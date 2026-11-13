import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSeed} from '../src/seed.js';
import {applyDemoTripAction, upgradeDemoTrips, schoolDate, validateCompletion} from '../src/trips.js';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

test('school service dates use Manila midnight and cabin confirmation is explicit',()=>{
  assert.equal(schoolDate(new Date('2026-11-13T16:01:00Z')),'2026-11-14');
  assert.throws(()=>validateCompletion({status:'active',start_mileage:0},[],0,'false'),/cabin check/);
});

const operation=(payload={})=>({operation_id:crypto.randomUUID(),...payload});
test('demo trip history, rollback staging, idempotency, and snapshot isolation',()=>{
  const data=upgradeDemoTrips(makeSeed()), admin=data.users[0], driver=data.users.find(u=>u.id==='driver-1');
  const trip=data.trips.find(t=>t.driver_id===driver.id), passengers=data.trip_passengers.filter(p=>p.trip_id===trip.id);
  const initial=data.trips.length;upgradeDemoTrips(data);assert.equal(data.trips.length,initial);
  const passenger=passengers.find(p=>p.status==='expected');
  const payload=operation({trip_id:trip.id,student_code:passenger.student_code,stop_id:passenger.pickup_stop_id});
  applyDemoTripAction(data,driver,'record_boarding',payload);applyDemoTripAction(data,driver,'record_boarding',payload);
  assert.equal(data.passenger_events.length,1);
  assert.throws(()=>applyDemoTripAction(data,driver,'record_alighting',payload),/already been used/);
  assert.throws(()=>applyDemoTripAction(data,driver,'complete_trip',operation({trip_id:trip.id,mileage:trip.start_mileage,cabin_checked:true})),/drop-off/);
  for(const p of passengers.filter(p=>p.status==='boarded'))applyDemoTripAction(data,driver,'record_alighting',operation({trip_id:trip.id,student_code:p.student_code,stop_id:p.dropoff_stop_id}));
  assert.throws(()=>applyDemoTripAction(data,driver,'complete_trip',operation({trip_id:trip.id,mileage:trip.start_mileage})),/cabin check/);
  applyDemoTripAction(data,driver,'complete_trip',operation({trip_id:trip.id,mileage:trip.start_mileage+10,cabin_checked:true}));
  const saved=JSON.stringify(trip), snapshot=JSON.stringify(passengers);
  const second=applyDemoTripAction(data,admin,'create_trip',operation({route_id:trip.route_id,service_date:schoolDate(),departure_time:'23:00'}));
  applyDemoTripAction(data,driver,'start_trip',operation({trip_id:second.id}));
  assert.equal(JSON.stringify(trip),saved);assert.equal(JSON.stringify(passengers),snapshot);
  assert.ok(data.trip_passengers.filter(p=>p.trip_id===second.id).every(p=>p.status==='expected'));
  data.routes.find(r=>r.id===trip.route_id).route_name='Changed later';assert.notEqual(trip.route_name,'Changed later');
  assert.throws(()=>applyDemoTripAction(data,data.users.find(u=>u.role==='student'),'record_boarding',operation({trip_id:second.id})),/not assigned/);
});

test('incremental trip migration and authorized PostgreSQL lifecycle',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
      create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table realtime.messages(id bigint generated always as identity,extension text,topic text);alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
      grant usage on schema public,auth,realtime to authenticated;grant select,insert on realtime.messages to authenticated;`);
    await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    const auth={admin:crypto.randomUUID(),driver:crypto.randomUUID(),student:crypto.randomUUID(),other:crypto.randomUUID()};
    const ids={};
    for(const [role,id] of Object.entries(auth)){
      await db.query('insert into auth.users values($1)',[id]);
      ids[role]=(await db.query("insert into public.users(auth_id,name,role,student_code) values($1,$2,$3,$4) returning id",[id,role,role==='other'?'student':role,['student','other'].includes(role)?role.toUpperCase():null])).rows[0].id;
    }
    const login=async role=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[auth[role]]);await db.exec('set role authenticated');};
    const action=async(name,payload)=> (await db.query('select public.fleet_action($1,$2::jsonb) result',[name,JSON.stringify(payload)])).rows[0].result;
    const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
    await login('admin');
    await action('add_bus',{label:'History bus',plate_number:'HIS 123',capacity:2,current_mileage:100,next_service_mileage:1000});
    const bus=await scalar('select id from buses');
    await action('add_route',{route_name:'History loop',area:'Dagupan',bus_id:bus,driver_id:ids.driver,color:'#38bdf8',departure_time:'06:30',stops:[{stop_name:'Pickup',latitude:16,longitude:120},{stop_name:'Campus',latitude:16.1,longitude:120.1}]});
    const route=await scalar('select id from routes'), stop=await scalar('select id from route_stops order by stop_sequence limit 1');
    await action('assign_student',{student_id:ids.student,route_id:route,stop_id:stop});
    await t.test('active-route cutover fails atomically and preserves existing data',async()=>{
      await action('start_route',{route_id:route});await db.exec('reset role');
      await assert.rejects(db.exec(await readFile(new URL('../supabase/migrations/001_trip_history.sql',import.meta.url),'utf8')),/Finish active routes/);
      await db.exec('rollback');assert.equal(await scalar("select to_regclass('public.trips')"),null);
      await login('admin');await action('end_route',{route_id:route,mileage:100});await db.exec('reset role');
      await db.exec(await readFile(new URL('../supabase/migrations/001_trip_history.sql',import.meta.url),'utf8'));
      assert.equal(Number(await scalar('select count(*) from student_assignments')),1);
    });
    await login('admin');
    const create=operation({route_id:route,service_date:schoolDate(),departure_time:'06:30'});
    const first=await action('create_trip',create);
    await t.test('preparation and retries are idempotent; operation IDs bind the request',async()=>{
      assert.equal((await action('create_trip',create)).id,first.id);
      assert.equal(Number(await scalar('select count(*) from trips')),1);
      await assert.rejects(action('create_trip',{...create,departure_time:'07:00'}),/already been used/);
      await assert.rejects(action('delete_route',{route_id:route}),/prepared trips/);
    });
    await t.test('manifest and audit RLS, legacy bypass, and direct writes are denied',async()=>{
      await login('student');assert.equal(Number(await scalar('select count(*) from trips')),1);assert.equal(Number(await scalar('select count(*) from trip_passengers')),1);
      assert.equal(Number(await scalar('select count(*) from audit_events')),0);
      await assert.rejects(action('start_trip',operation({trip_id:first.id})),/not assigned/);
      await assert.rejects(db.query("update trip_passengers set status='alighted'"),/permission denied/);
      await assert.rejects(db.query("select public.fleet_legacy_action('start_route',$1::jsonb)",[JSON.stringify({route_id:route})]),/permission denied/);
      await login('other');assert.equal(Number(await scalar('select count(*) from trips')),0);assert.equal(Number(await scalar('select count(*) from trip_passengers')),0);
      await login('driver');await assert.rejects(action('start_route',{route_id:route}),/dated trip/);
    });
    await login('driver');
    await action('start_trip',operation({trip_id:first.id}));
    let manifest=(await db.query('select * from trip_passengers')).rows[0];
    await t.test('boarding records exact stops, prevents duplicates and wrong passengers',async()=>{
      await assert.rejects(action('record_alighting',operation({trip_id:first.id,student_code:'STUDENT',stop_id:manifest.dropoff_stop_id})),/Only a student on board/);
      await assert.rejects(action('record_boarding',operation({trip_id:first.id,student_code:'OTHER',stop_id:stop})),/not assigned/);
      await assert.rejects(action('record_boarding',operation({trip_id:first.id,student_code:'STUDENT',stop_id:manifest.dropoff_stop_id})),/assigned stop/);
      const board=operation({trip_id:first.id,student_code:'STUDENT',stop_id:stop});await action('record_boarding',board);await action('record_boarding',board);
      assert.equal(Number(await scalar('select count(*) from passenger_events')),1);
      await assert.rejects(action('record_boarding',operation({...board,operation_id:crypto.randomUUID()})),/already boarded/);
    });
    await t.test('completion requires alighting, monotonic mileage, and cabin check',async()=>{
      await assert.rejects(action('complete_trip',operation({trip_id:first.id,mileage:99,cabin_checked:true})),/below the current/);
      await assert.rejects(action('complete_trip',operation({trip_id:first.id,mileage:110,cabin_checked:true})),/drop-off/);
      await action('record_alighting',operation({trip_id:first.id,student_code:'STUDENT',stop_id:manifest.dropoff_stop_id}));
      await assert.rejects(action('complete_trip',operation({trip_id:first.id,mileage:110})),/cabin check/);
      const finish=operation({trip_id:first.id,mileage:110,cabin_checked:true});await action('complete_trip',finish);await action('complete_trip',finish);
      assert.equal(await scalar('select status from trips'),'completed');assert.equal(await scalar('select status from trip_passengers'),'alighted');
    });
    await t.test('cancellation is restricted, reasoned, and retains its snapshot',async()=>{
      await login('admin');
      const future=await action('create_trip',operation({route_id:route,service_date:schoolDate(new Date(Date.now()+86400000)),departure_time:'06:30'}));
      await login('driver');
      await assert.rejects(action('start_trip',operation({trip_id:future.id})),/today/);
      await assert.rejects(action('cancel_trip',operation({trip_id:future.id,reason:'Driver request'})),/Only administrators/);
      await login('admin');
      await assert.rejects(action('cancel_trip',operation({trip_id:future.id,reason:''})),/reason/);
      const cancel=operation({trip_id:future.id,reason:'School suspended'});await action('cancel_trip',cancel);await action('cancel_trip',cancel);
      assert.equal((await db.query('select status from trips where id=$1',[future.id])).rows[0].status,'cancelled');
      assert.equal((await db.query('select count(*) from trip_passengers where trip_id=$1',[future.id])).rows[0].count,1);
    });
    await t.test('second trip preserves first manifest and immutable event history',async()=>{
      await login('admin');const second=await action('create_trip',operation({route_id:route,service_date:schoolDate(),departure_time:'15:30'}));
      const competing=await action('create_trip',operation({route_id:route,service_date:schoolDate(),departure_time:'18:30'}));
      await login('driver');await action('start_trip',operation({trip_id:second.id}));
      await assert.rejects(action('start_trip',operation({trip_id:competing.id})),/active trip/);
      assert.equal((await db.query('select status from trip_passengers where trip_id=$1',[first.id])).rows[0].status,'alighted');
      assert.equal((await db.query('select status from trip_passengers where trip_id=$1',[second.id])).rows[0].status,'expected');
      assert.equal(Number(await scalar('select count(*) from passenger_events')),2);
      await assert.rejects(action('record_boarding',operation({trip_id:first.id,student_code:'STUDENT',stop_id:stop})),/Start this trip/);
    });
  } finally {await db.close();}
});
