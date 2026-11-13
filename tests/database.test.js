import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// A real embedded PostgreSQL engine exercises the actual migration and RPCs.
// Supabase-owned auth/realtime primitives are stubbed; hosted WebSockets require a project.
test('PostgreSQL migration, permissions, boarding, capacity, and maintenance',async t=>{
  const db=new PGlite();
  const authIds={admin:'00000000-0000-4000-a000-000000000001',driver:'00000000-0000-4000-a000-000000000002',student:'00000000-0000-4000-a000-000000000003',outsider:'00000000-0000-4000-a000-000000000004'};
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema realtime;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table realtime.messages(id bigint generated always as identity, extension text, topic text);
      alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
      grant usage on schema public,auth,realtime to authenticated;
      grant select,insert on realtime.messages to authenticated;
      grant usage on sequence realtime.messages_id_seq to authenticated;
    `);
    await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
    for(const id of Object.values(authIds))await db.query('insert into auth.users values($1)',[id]);
    const admin=await scalar("insert into public.users(auth_id,name,role) values($1,'Admin','admin') returning id",[authIds.admin]);
    const driver=await scalar("insert into public.users(auth_id,name,role) values($1,'Driver','driver') returning id",[authIds.driver]);
    const student=await scalar("insert into public.users(auth_id,name,role,student_code) values($1,'Student One','student','S-001') returning id",[authIds.student]);
    const outsider=await scalar("insert into public.users(auth_id,name,role,student_code) values($1,'Other Student','student','S-002') returning id",[authIds.outsider]);
    const login=async role=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[authIds[role]]);await db.exec('set role authenticated');};
    const action=(name,payload)=>db.query('select public.fleet_action($1,$2::jsonb)',[name,JSON.stringify(payload)]);
    await login('admin');
    await action('add_bus',{label:'Bus 1',plate_number:'ABC 123',capacity:1,current_mileage:1000,next_service_mileage:2000});
    const bus=(await db.query('select * from buses')).rows[0];
    await action('add_route',{route_name:'Campus loop',area:'Dagupan',bus_id:bus.id,driver_id:driver,color:'#38bdf8',departure_time:'06:30',stops:[{stop_name:'Pickup',latitude:16.04,longitude:120.34},{stop_name:'Campus',latitude:16.05,longitude:120.35}]});
    const route=(await db.query('select * from routes')).rows[0];
    const stop=(await db.query('select * from route_stops order by stop_sequence')).rows[0];
    await t.test('capacity is enforced in the transaction',async()=>{
      await action('assign_student',{route_id:route.id,student_id:student,stop_id:stop.id});
      await assert.rejects(action('assign_student',{route_id:route.id,student_id:outsider,stop_id:stop.id}),/route is full/);
      assert.equal(Number(await scalar('select count(*) from student_assignments')),1);
    });
    await t.test('direct browser writes and privilege escalation are denied',async()=>{
      await login('student');
      await assert.rejects(db.query("update users set role='admin'"),/permission denied/);
      await assert.rejects(action('add_person',{name:'Injected Admin',role:'admin'}),/Only fleet administrators/);
      await assert.rejects(action('start_route',{route_id:route.id}),/not assigned/);
    });
    await t.test('student RLS hides other students and unassigned routes',async()=>{
      await login('student');
      assert.equal(Number(await scalar('select count(*) from student_assignments')),1);
      assert.equal(Number(await scalar("select count(*) from users where role='student'")),1);
      const summary = await scalar('select public.fleet_route_capacity($1)',[route.id]);
      assert.equal(summary.assigned,1);
      assert.equal(summary.capacity,1);
      await login('outsider');
      assert.equal(Number(await scalar('select count(*) from routes')),0);
      assert.equal(Number(await scalar('select count(*) from buses')),0);
      assert.equal(Number(await scalar('select count(*) from student_assignments')),0);
      await assert.rejects(db.query('select public.fleet_route_capacity($1)',[route.id]),/not available/);
    });
    await t.test('driver boarding validates route, ID, trip state, and duplicates',async()=>{
      await login('driver');
      await assert.rejects(action('board_student',{route_id:route.id,student_code:'S-001'}),/Start your route/);
      await action('start_route',{route_id:route.id});
      await assert.rejects(action('board_student',{route_id:route.id,student_code:'S-002'}),/not assigned/);
      await action('board_student',{route_id:route.id,student_code:' s-001 '});
      await assert.rejects(action('board_student',{route_id:route.id,student_code:'S-001'}),/already boarded/);
      assert.equal(await scalar('select status from student_assignments'),'boarded');
    });
    await t.test('odometer cannot move backwards and end trip clears boarding',async()=>{
      await assert.rejects(action('end_route',{route_id:route.id,mileage:999}),/below the current/);
      await action('end_route',{route_id:route.id,mileage:2001});
      assert.equal(await scalar('select status from student_assignments'),'assigned');
      assert.equal(await scalar('select status from routes'),'completed');
      assert.equal(Number(await scalar('select current_mileage from buses')),2001);
    });
    await t.test('maintenance requires an administrator and a future interval',async()=>{
      await assert.rejects(action('service_bus',{bus_id:bus.id,mileage:2001,next_service_mileage:7001}),/Only fleet administrators/);
      await login('admin');
      await assert.rejects(action('service_bus',{bus_id:bus.id,mileage:2001,next_service_mileage:2000}),/Check the odometer/);
      await action('service_bus',{bus_id:bus.id,mileage:2001,next_service_mileage:7001});
      assert.equal(Number(await scalar('select next_service_mileage from buses')),7001);
    });
    await t.test('vehicle updates preserve assigned capacity and maintenance state',async()=>{
      const values={bus_id:bus.id,label:'Updated bus',plate_number:'ABC 123',capacity:1,current_mileage:2001,next_service_mileage:7001,status:'maintenance'};
      await action('update_bus',values);
      assert.equal(await scalar('select status from buses'),'maintenance');
      await assert.rejects(action('update_bus',{...values,capacity:0}),/Capacity cannot be lower/);
      await assert.rejects(action('update_bus',{...values,current_mileage:2000}),/cannot move backwards/);
      await login('driver');
      await assert.rejects(action('start_route',{route_id:route.id}),/in maintenance/);
      await login('admin');
      await action('update_bus',{...values,status:'idle'});
    });
    await t.test('Realtime RLS prevents student publishing and outsiders receiving',async()=>{
      await db.exec('reset role');
      await db.query('insert into realtime.messages(extension,topic) values($1,$2)',['broadcast',`route:${route.id}`]);
      await login('student');
      await db.query("select set_config('realtime.topic',$1,false)",[`route:${route.id}`]);
      assert.equal(Number(await scalar('select count(*) from realtime.messages')),1);
      await assert.rejects(db.query("insert into realtime.messages(extension,topic) values('broadcast',$1)",[`route:${route.id}`]),/row-level security/);
      await login('outsider');
      assert.equal(Number(await scalar('select count(*) from realtime.messages')),0);
      await login('driver');
      await db.query("insert into realtime.messages(extension,topic) values('broadcast',$1)",[`route:${route.id}`]);
    });
    await t.test('removing an inactive route releases its vehicle and assignments',async()=>{
      await login('admin');
      await action('delete_route',{route_id:route.id});
      assert.equal(Number(await scalar('select count(*) from routes')),0);
      assert.equal(Number(await scalar('select count(*) from student_assignments')),0);
      assert.equal(Number(await scalar('select count(*) from route_stops')),0);
      await action('delete_bus',{bus_id:bus.id});
      assert.equal(Number(await scalar('select count(*) from buses')),0);
      assert.ok(Number(await scalar('select count(*) from activity'))>0);
    });
  } finally {await db.close();}
});
