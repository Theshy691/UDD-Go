import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetDatabase} from './helpers/fleet-db.js';
import {schoolDate,upgradeDemoTrips} from '../src/trips.js';
import {makeSeed} from '../src/seed.js';
import {addDays,upgradeScheduling,applySchedulingAction,serviceDays,servicesOverlap} from '../src/scheduling.js';

test('services migration, scheduling, subscriptions, route versions, and handover permissions',async t=>{
 const f=await fleetDatabase(),{db,ids,login,action,scalar,op,migrate}=f;
 try{
  await login('admin');
  await action('add_bus',{label:'Bus 1',plate_number:'SCH 1',capacity:2,current_mileage:1000,next_service_mileage:5000});
  const bus=await scalar('select id from buses');
  await action('add_route',{route_name:'Campus route',area:'Dagupan',bus_id:bus,driver_id:ids.driver,color:'#38bdf8',departure_time:'06:30',stops:[{stop_name:'A',latitude:16,longitude:120},{stop_name:'B',latitude:16.01,longitude:120.01},{stop_name:'Campus',latitude:16.02,longitude:120.02}]});
  const route=await scalar('select id from routes'),stops=(await db.query('select * from route_stops order by stop_sequence')).rows;
  await action('assign_student',{student_id:ids.student,route_id:route,stop_id:stops[0].id});
  const legacy=await action('create_trip',op({route_id:route,service_date:addDays(schoolDate(),-1),departure_time:'06:30'}));
  const snapshot=await scalar('select stops from trips where id=$1',[legacy.id]);
  await db.exec('reset role');await migrate('supabase/migrations/002_services_and_route_versions.sql');await login('admin');
  let service=(await db.query('select * from service_schedules')).rows[0];
  const today=schoolDate(),weekdays=[1,2,3,4,5,6,7];
  await action('save_service',op({...service,schedule_id:service.id,weekdays}));
  service=(await db.query('select * from service_schedules')).rows[0];
  let pm,trip;
  await t.test('migration preserves history and converts old assignments to subscriptions',async()=>{
    assert.deepEqual(await scalar('select stops from trips where id=$1',[legacy.id]),snapshot);
    assert.equal(Number(await scalar('select count(*) from student_subscriptions')),1);
    assert.equal(Number(await scalar('select count(*) from route_versions')),1);
  });
  await t.test('one bus and driver can serve AM/PM; overlapping templates are rejected',async()=>{
    pm=await action('save_service',op({...service,schedule_id:undefined,name:'Return service',direction:'return',departure_time:'15:30'}));
    await action('subscribe_student',op({schedule_id:pm.id,student_id:ids.student,pickup_stop_id:stops[0].id,dropoff_stop_id:stops[2].id,start_date:today,end_date:service.end_date}));
    assert.equal(Number(await scalar('select count(*) from student_subscriptions where student_id=$1',[ids.student])),2);
    await assert.rejects(action('save_service',op({...service,schedule_id:undefined,name:'Overlap',departure_time:'07:00'})),/overlap/);
  });
  await t.test('student overlaps are rejected across independently allocated services',async()=>{
    await action('add_bus',{label:'Independent',plate_number:'IND 1',capacity:2,current_mileage:100,next_service_mileage:1000});
    const independent=await scalar("select id from buses where label='Independent'");
    const extra=await action('save_service',op({...service,schedule_id:undefined,name:'Independent overlap',bus_id:independent,driver_id:ids.replacement,departure_time:'07:00'}));
    await assert.rejects(action('subscribe_student',op({schedule_id:extra.id,student_id:ids.student,pickup_stop_id:stops[0].id,dropoff_stop_id:stops[2].id,start_date:today,end_date:service.end_date})),/overlapping service/);
    await action('save_service',op({...service,schedule_id:extra.id,name:'Independent overlap',bus_id:independent,driver_id:ids.replacement,departure_time:'07:00',active:false}));
  });
  await t.test('capacity and duplicate subscriptions are enforced',async()=>{
    const sub={schedule_id:service.id,pickup_stop_id:stops[0].id,dropoff_stop_id:stops[2].id,start_date:today,end_date:service.end_date};
    await action('subscribe_student',op({...sub,student_id:ids.other}));
    await assert.rejects(action('subscribe_student',op({...sub,student_id:ids.third})),/full/);
    await assert.rejects(action('subscribe_student',op({...sub,student_id:ids.other})),/unique|duplicate/);
  });
  await t.test('generation is repeatable; holiday cancels prepared trips but preserves manifests',async()=>{
    const generated=await action('generate_trips',op({from:today,to:addDays(today,2)}));assert.equal(generated.created,6);
    assert.equal((await action('generate_trips',op({from:today,to:addDays(today,2)}))).created,0);
    await action('set_calendar_exception',op({service_date:addDays(today,1),type:'cancelled',reason:'School holiday'}));
    assert.equal(Number(await scalar("select count(*) from trips where service_date=$1 and status='cancelled'",[addDays(today,1)])),2);
    const total=await scalar('select count(*) from trip_passengers');await action('generate_trips',op({from:today,to:addDays(today,2)}));assert.equal(await scalar('select count(*) from trip_passengers'),total);
    trip=(await db.query('select * from trips where schedule_id=$1 and service_date=$2',[service.id,today])).rows[0];
  });
  await t.test('publishing versions preserves prepared snapshots; optimistic versions and stop remapping apply',async()=>{
    const original=await scalar('select stops from trips where id=$1',[trip.id]);
    await assert.rejects(action('publish_route',op({route_id:route,expected_version:1,route_name:'Edited',area:'Dagupan',stops:stops.slice(1)})),/Remap/);
    await action('publish_route',op({route_id:route,expected_version:1,route_name:'Edited',area:'Dagupan',stops:stops.slice(1),stop_remap:{[stops[0].id]:stops[1].id}}));
    assert.deepEqual(await scalar('select stops from trips where id=$1',[trip.id]),original);
    assert.equal(Number(await scalar('select count(*) from route_versions')),2);
    await assert.rejects(action('publish_route',op({route_id:route,expected_version:1,route_name:'Stale',stops:stops.slice(1)})),/changed/);
  });
  await t.test('scheduled substitution rejects undersized bus; active handover revokes old publisher',async()=>{
    await action('add_bus',{label:'Small',plate_number:'SCH 2',capacity:1,current_mileage:100,next_service_mileage:2000});
    const small=await scalar("select id from buses where label='Small'");
    await assert.rejects(action('replace_trip_resources',op({trip_id:trip.id,bus_id:small,driver_id:ids.replacement,reason:'Replacement'})),/too small/);
    await action('add_bus',{label:'Spare',plate_number:'SCH 3',capacity:3,current_mileage:100,next_service_mileage:2000});
    const spare=await scalar("select id from buses where label='Spare'");
    // This test starts the morning trip late: cancel the same-day return allocation first.
    const returnToday=await scalar('select id from trips where schedule_id=$1 and service_date=$2',[pm.id,today]);
    await action('cancel_trip',op({trip_id:returnToday,reason:'Late dispatch; return service replaced'}));
    await login('driver');await action('start_trip',op({trip_id:trip.id}));
    await db.query('select public.fleet_publish_position($1,1,16,120,$2)',[trip.id,Date.now()]);
    await login('admin');
    await assert.rejects(action('replace_trip_resources',op({trip_id:trip.id,bus_id:spare,driver_id:ids.replacement,reason:'Breakdown',mileage:1005})),/reconciliation/);
    await action('replace_trip_resources',op({trip_id:trip.id,bus_id:spare,driver_id:ids.replacement,reason:'Breakdown',mileage:1005,transfer_confirmed:true}));
    await login('driver');
    await assert.rejects(db.query('select public.fleet_publish_position($1,1,16,120,$2)',[trip.id,Date.now()]),/current active/);
    await assert.rejects(db.query('select public.fleet_publish_position($1,2,16,120,$2)',[trip.id,Date.now()]),/current active/);
    await assert.rejects(action('complete_trip',op({trip_id:trip.id,mileage:2000,cabin_checked:true})),/not assigned/);
    await login('replacement');
    await db.query('select public.fleet_publish_position($1,2,16,120,$2)',[trip.id,Date.now()]);
  });
  await t.test('private channel epochs and aggregate occupancy preserve passenger privacy',async()=>{
    await db.exec('reset role');
    // Channel policy evaluates the requested topic. A stale cached topic cannot receive new-epoch samples.
    await db.query("insert into realtime.messages(extension,topic) values('broadcast',$1)",[`trip:${trip.id}:2`]);
    await login('driver');await db.query("select set_config('realtime.topic',$1,false)",[`trip:${trip.id}:2`]);
    assert.equal(Number(await scalar('select count(*) from realtime.messages')),0);
    await assert.rejects(db.query("insert into realtime.messages(extension,topic) values('broadcast',$1)",[`trip:${trip.id}:2`]),/row-level security/);
    await login('replacement');
    assert.equal(Number(await scalar('select count(*) from realtime.messages')),1);
    await db.query("select set_config('realtime.topic',$1,false)",[`trip:${trip.id}:1`]);
    assert.equal(Number(await scalar('select count(*) from realtime.messages')),0);
    await login('student');
    assert.equal(Number(await scalar('select count(*) from trip_passengers where trip_id=$1',[trip.id])),1);
    assert.equal((await scalar('select public.fleet_trip_capacity($1)',[trip.id])).assigned,2);
    await login('replacement');await action('complete_trip',op({trip_id:trip.id,mileage:110,cabin_checked:true}));
    assert.equal(Number(await scalar('select final_mileage from trips where id=$1',[trip.id])),110);
    await login('admin');
  });
  await t.test('extra service days override weekdays and regeneration is idempotent',async()=>{
    await login('admin');
    const target=addDays(today,7),excluded=new Date(`${target}T12:00:00+08:00`).getUTCDay() || 7;
    const payload={...service,schedule_id:pm.id,name:'Return service',direction:'return',departure_time:'15:30',weekdays:[1,2,3,4,5,6,7].filter(d=>d!==excluded)};
    await action('save_service',op(payload));
    assert.equal((await action('generate_trips',op({schedule_id:pm.id,from:target,to:target}))).created,0);
    await action('set_calendar_exception',op({schedule_id:pm.id,service_date:target,type:'extra',reason:'Special campus service'}));
    assert.equal((await action('generate_trips',op({schedule_id:pm.id,from:target,to:target}))).created,1);
    assert.equal((await action('generate_trips',op({schedule_id:pm.id,from:target,to:target}))).created,0);
  });
  await t.test('overnight subscriptions conflict even when their effective date ranges are adjacent',async()=>{
    const day=addDays(today,10),next=addDays(day,1),independent=await scalar("select id from buses where label='Independent'"),spare=await scalar("select id from buses where label='Spare'");
    const latePayload={...service,schedule_id:undefined,name:'Overnight',departure_time:'23:30',start_date:day,end_date:day,bus_id:independent,driver_id:ids.replacement};
    const late=await action('save_service',op(latePayload));
    await assert.rejects(action('save_service',op({...latePayload,name:'Overnight resource clash',departure_time:'00:30',start_date:next,end_date:next})),/overlap/);
    const earlyPayload={...latePayload,name:'Early',departure_time:'00:30',start_date:next,end_date:next,bus_id:spare,driver_id:ids.driver};
    const early=await action('save_service',op(earlyPayload));
    await action('subscribe_student',op({schedule_id:late.id,student_id:ids.student,pickup_stop_id:stops[1].id,dropoff_stop_id:stops[2].id,start_date:day,end_date:day}));
    await assert.rejects(action('subscribe_student',op({schedule_id:early.id,student_id:ids.student,pickup_stop_id:stops[1].id,dropoff_stop_id:stops[2].id,start_date:next,end_date:next})),/overlapping service/);
    await action('save_service',op({...latePayload,schedule_id:late.id,active:false}));await action('save_service',op({...earlyPayload,schedule_id:early.id,active:false}));
  });
  await t.test('route templates share defaults; unused routes archive without losing versions',async()=>{
    const independent=await scalar("select id from buses where label='Independent'");
    await action('add_route',{route_name:'Archivable route',area:'Dagupan',bus_id:independent,driver_id:ids.replacement,color:'#38bdf8',departure_time:'10:00',stops:[{stop_name:'X',latitude:16,longitude:120},{stop_name:'Y',latitude:16.1,longitude:120.1}]});
    const extraRoute=await scalar("select id from routes where route_name='Archivable route'");
    await action('archive_route',op({route_id:extraRoute}));
    assert.equal(await scalar('select archived from routes where id=$1',[extraRoute]),true);
    assert.equal(Number(await scalar('select count(*) from route_versions where route_id=$1',[extraRoute])),1);
    await assert.rejects(action('save_service',op({...service,schedule_id:undefined,route_id:extraRoute})),/available route/);
  });
  await t.test('student scope, direct-write denial, and route archive protections',async()=>{
    await login('third');
    await assert.rejects(db.query("select public.fleet_trip_action('start_trip',$1::jsonb)",[JSON.stringify(op({trip_id:trip.id}))]),/permission denied/);
    await assert.rejects(db.query('select public.fleet_trip_capacity($1)',[trip.id]),/not available/);
    assert.equal(Number(await scalar('select count(*) from service_schedules')),0);
    assert.equal(Number(await scalar('select count(*) from student_subscriptions')),0);
    await assert.rejects(action('save_service',op({...service})),/Only administrators/);
    await assert.rejects(db.query("update service_schedules set active=false"),/permission denied/);
    await login('student');assert.equal(Number(await scalar('select count(*) from student_subscriptions')),3);
    assert.equal(Number(await scalar('select count(*) from student_subscriptions where student_id<>public.fleet_profile_id()')),0);
    assert.equal(Number(await scalar('select count(*) from trip_resource_events')),0);
    await login('admin');await assert.rejects(action('archive_route',op({route_id:route})),/pending trips/);
  });
 }finally{await db.close();}
});

test('demo services preserve AM/PM subscriptions and route snapshots',()=>{
 const data=upgradeScheduling(upgradeDemoTrips(makeSeed())),actor=data.users[0],service=data.service_schedules[0];
 // Complete sample journeys for this isolated planning scenario.
 data.trips.forEach(t=>t.status='completed');data.buses.filter(b=>b.status==='active').forEach(b=>b.status='idle');
 service.weekdays=[1,2,3,4,5,6,7];
 const op=p=>({...p,operation_id:crypto.randomUUID()});
 const pm=applySchedulingAction(data,actor,'save_service',op({...service,schedule_id:undefined,name:'PM',direction:'return',departure_time:'15:30'}));
 const sub=data.student_subscriptions[0];applySchedulingAction(data,actor,'subscribe_student',op({...sub,id:undefined,schedule_id:pm.id}));
 assert.equal(data.student_subscriptions.filter(a=>a.student_id===sub.student_id).length,2);
 assert.throws(()=>applySchedulingAction(structuredClone(data),actor,'save_service',op({...service,schedule_id:undefined,name:'Overlap',departure_time:'07:00'})),/overlap/);
 const result=applySchedulingAction(data,actor,'generate_trips',op({from:schoolDate(),to:addDays(schoolDate(),1)}));assert.ok(result.created>=3);
 const again=applySchedulingAction(data,actor,'generate_trips',op({from:schoolDate(),to:addDays(schoolDate(),1)}));assert.equal(again.created,0);
 assert.equal(serviceDays(service,schoolDate(),schoolDate()).length,1);
});

test('turnaround windows include overnight services with adjacent effective dates',()=>{
 const base={start_date:'2026-11-16',end_date:'2026-11-16',weekdays:[1,2,3,4,5,6,7],duration_minutes:60,turnaround_minutes:15};
 const late={...base,departure_time:'23:30'},early={...base,start_date:'2026-11-17',end_date:'2026-11-17',departure_time:'00:30'};
 assert.equal(servicesOverlap(late,early),true);
 assert.equal(servicesOverlap(late,{...early,departure_time:'00:45'}),false);
 assert.throws(()=>serviceDays(base,'2026-02-30','2026-03-02'),/date range/);
});

test('demo route publishing remaps subscriptions and rejects unmapped stops',()=>{
 const data=upgradeScheduling(upgradeDemoTrips(makeSeed())),actor=data.users[0],route=data.routes[0];
 const oldStops=data.route_stops.filter(s=>s.route_id===route.id);
 const op=p=>({...p,operation_id:crypto.randomUUID()});
 assert.throws(()=>applySchedulingAction(data,actor,'publish_route',op({route_id:route.id,expected_version:route.version_no,route_name:route.route_name,stops:oldStops.slice(1)})),/Remap/);
 const newStops=oldStops.slice(1);
 const res=applySchedulingAction(data,actor,'publish_route',op({route_id:route.id,expected_version:route.version_no,route_name:route.route_name,stops:newStops,stop_remap:{[oldStops[0].id]:newStops[0].id}}));
 assert.ok(res.id);
 assert.equal(data.routes.find(r=>r.id===route.id).version_no,2);
});
