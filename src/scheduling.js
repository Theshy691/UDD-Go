import {createTripSnapshot, schoolDate} from './trips.js';
import {validCoordinates} from './domain.js';
export const SCHEDULING_ACTIONS=['save_service','subscribe_student','unsubscribe_student','generate_trips','set_calendar_exception','remove_calendar_exception','publish_route','archive_route','replace_trip_resources'];
export const schedulingActions=new Set([...SCHEDULING_ACTIONS,'create_trip','start_trip','complete_trip']);
export const addDays=(date,days)=>schoolDate(new Date(new Date(`${date}T12:00:00+08:00`).getTime()+days*86400000));
export function serviceDays(service,from=service.start_date,to=service.end_date){
  if(!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from>to || !Number.isFinite(+new Date(from)) || !Number.isFinite(+new Date(to)) || schoolDate(new Date(`${from}T12:00:00+08:00`))!==from || schoolDate(new Date(`${to}T12:00:00+08:00`))!==to || new Date(to)-new Date(from)>366*86400000)throw new Error('Choose a date range of at most one year.');
  const result=[];
  for(let day=from;day<=to;day=addDays(day,1))if(day>=service.start_date && day<=service.end_date && service.weekdays.includes(new Date(`${day}T12:00:00+08:00`).getUTCDay() || 7))result.push(day);
  return result;
}
export function serviceWindow(service,day){const start=+new Date(`${day}T${service.departure_time}+08:00`);return [start,start+(service.duration_minutes+service.turnaround_minutes)*60000];}
export const overlaps=(a,b)=>a[0]<b[1] && b[0]<a[1];
export function servicesOverlap(a,b,from,to){
  const first=from || a.start_date, last=to || a.end_date;
  if(first>last)return false;
  return serviceDays(a,first,last).some(day=>serviceDays(b,addDays(day,-1),addDays(day,1)).some(other=>overlaps(serviceWindow(a,day),serviceWindow(b,other))));
}
export function upgradeScheduling(data){
  if(data.service_schedules)return data;
  Object.assign(data,{service_schedules:[],student_subscriptions:[],calendar_exceptions:[],route_versions:[],trip_resource_events:[]});
  for(const route of data.routes){
    route.version_no=1;route.archived=false;
    const version={id:crypto.randomUUID(),route_id:route.id,version_no:1,route_name:route.route_name,stops:structuredClone(data.route_stops.filter(s=>s.route_id===route.id).sort((a,b)=>a.stop_sequence-b.stop_sequence)),created_at:new Date().toISOString()};
    data.route_versions.push(version);
    const service={id:crypto.randomUUID(),name:route.route_name,route_id:route.id,route_version_id:version.id,direction:'outbound',departure_time:route.departure_time,duration_minutes:60,turnaround_minutes:15,weekdays:[1,2,3,4,5],start_date:schoolDate(),end_date:addDays(schoolDate(),365),bus_id:route.bus_id,driver_id:route.driver_id,active:true};
    data.service_schedules.push(service);
    for(const a of data.student_assignments.filter(a=>a.route_id===route.id && a.status!=='cancelled'))data.student_subscriptions.push({id:crypto.randomUUID(),student_id:a.student_id,schedule_id:service.id,pickup_stop_id:a.stop_id,dropoff_stop_id:version.stops.at(-1).id,start_date:service.start_date,end_date:service.end_date});
  }
  for(const t of data.trips)Object.assign(t,{planned_end_at:new Date(+new Date(t.planned_at)+3600000).toISOString(),turnaround_minutes:15,location_epoch:1,direction:t.direction || 'outbound',schedule_id:data.service_schedules.find(s=>s.route_id===t.route_id && s.departure_time.slice(0,5)===new Date(t.planned_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}))?.id,route_version_id:data.route_versions.find(v=>v.route_id===t.route_id)?.id});
  return data;
}
export function assertTripAllocation(data,candidate,exclude){
  const window=[+new Date(candidate.planned_at),Math.max(+new Date(candidate.planned_end_at),candidate.status==='active'?Date.now():0)+candidate.turnaround_minutes*60000];
  for(const t of data.trips.filter(t=>t.id!==exclude && ['scheduled','active'].includes(t.status))){
    const other=[+new Date(t.planned_at),Math.max(+new Date(t.planned_end_at),t.status==='active'?Date.now():0)+(t.turnaround_minutes || 0)*60000];
    if(overlaps(window,other) && (candidate.bus_id===t.bus_id || candidate.driver_id===t.driver_id))throw new Error('Bus or driver allocation overlaps another trip, including turnaround time.');
    if(overlaps(window,other)){
      const own=new Set(candidate.student_ids || []);
      if(data.trip_passengers.some(p=>p.trip_id===t.id && own.has(p.student_id)))throw new Error('A student already has a trip in this time window.');
    }
  }
}
export function applySchedulingAction(data,actor,action,p){
  if(!schedulingActions.has(action))throw new Error('Unknown scheduling action.');
  if(!p.operation_id)throw new Error('An operation ID is required.');
  const request=JSON.stringify(p); // Stored payload is compared structurally below.
  const op=data.trip_operations.find(o=>o.id===p.operation_id);
  if(op){if(op.actor_id!==actor.id || op.action!==action || JSON.stringify(sortObject(JSON.parse(op.request)))!==JSON.stringify(sortObject(p)))throw new Error('Operation ID has already been used for another request.');return op.result;}
  if(!['start_trip','complete_trip'].includes(action) && actor.role!=='admin')throw new Error('Only administrators can change service planning.');
  const before=structuredClone({trip:data.trips.find(t=>t.id===p.trip_id),service:data.service_schedules.find(s=>s.id===p.schedule_id),route:data.routes.find(r=>r.id===p.route_id)});
  let result={ok:true};
  if(action==='save_service'){
    const route=data.routes.find(r=>r.id===p.route_id && !r.archived),bus=data.buses.find(b=>b.id===p.bus_id && b.status!=='maintenance');
    if(!route || !bus || !data.users.some(u=>u.id===p.driver_id && u.role==='driver'))throw new Error('Choose an available route, bus, and driver.');
    const service={...p,id:p.schedule_id || crypto.randomUUID(),route_version_id:data.route_versions.filter(v=>v.route_id===route.id).sort((a,b)=>b.version_no-a.version_no)[0].id,active:p.active!==false};
    if(!p.name?.trim() || p.name.trim().length>100 || !['outbound','return'].includes(p.direction) || !/^\d{2}:\d{2}(:\d{2})?$/.test(p.departure_time) || !Number.isFinite(+new Date(`2026-01-01T${p.departure_time}+08:00`)) || !Number.isInteger(p.duration_minutes) || p.duration_minutes<1 || p.duration_minutes>720 || !Number.isInteger(p.turnaround_minutes) || p.turnaround_minutes<0 || p.turnaround_minutes>120 || !p.weekdays?.length || p.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw new Error('Check the service name, direction, weekdays, duration, and turnaround.');
    serviceDays(service);
    const existing=data.service_schedules.find(s=>s.id===service.id);
    if(p.schedule_id && !existing)throw new Error('Service not found.');
    if(existing && existing.route_id!==route.id && data.student_subscriptions.some(a=>a.schedule_id===existing.id))throw new Error('Remove or move subscriptions before changing the service route.');
    if(service.active)for(const other of data.service_schedules.filter(s=>s.id!==service.id && s.active))if((service.bus_id===other.bus_id || service.driver_id===other.driver_id) && servicesOverlap(service,other))throw new Error('Recurring service allocations overlap, including turnaround time.');
    if(existing)Object.assign(existing,service);else data.service_schedules.push(service);
    // Existing subscriptions must still fit their new service and vehicle.
    validateSubscriptions(data,service);result.id=service.id;
  }else if(action==='subscribe_student'){
    const service=data.service_schedules.find(s=>s.id===p.schedule_id && s.active);
    if(!service || !data.users.some(u=>u.id===p.student_id && u.role==='student'))throw new Error('Choose an active service and student.');
    const stops=data.route_versions.find(v=>v.id===service.route_version_id).stops;
    const pickup=stops.find(s=>s.id===p.pickup_stop_id),dropoff=stops.find(s=>s.id===p.dropoff_stop_id);
    if(!pickup || !dropoff || pickup.stop_sequence>=dropoff.stop_sequence)throw new Error('Pickup must precede drop-off on this service route.');
    if(p.start_date<service.start_date || p.end_date>service.end_date || !serviceDays(service,p.start_date,p.end_date).length)throw new Error('Choose subscription dates within the service calendar.');
    if(data.student_subscriptions.some(a=>a.schedule_id===service.id && a.student_id===p.student_id))throw new Error('This student already has a subscription to this service.');
    const sub={...p,id:crypto.randomUUID()};data.student_subscriptions.push(sub);validateSubscriptions(data,service);result.id=sub.id;
  }else if(action==='unsubscribe_student'){
    const sub=data.student_subscriptions.find(a=>a.id===p.subscription_id);if(!sub)throw new Error('Subscription not found.');
    data.student_subscriptions=data.student_subscriptions.filter(a=>a.id!==sub.id);result.id=sub.id;
  }else if(action==='create_trip' || action==='generate_trips'){
    const services=action==='create_trip'?[data.service_schedules.find(s=>s.id===p.schedule_id || (!p.schedule_id && s.route_id===p.route_id))]:data.service_schedules.filter(s=>s.active && (!p.schedule_id || s.id===p.schedule_id));
    if(services.some(s=>!s) || !services.length)throw new Error('Choose an active service.');
    if(action==='generate_trips' && (p.from>p.to || new Date(p.to)-new Date(p.from)>6*86400000))throw new Error('Generate at most seven service days at a time.');
    let count=0,skipped=0;
    for(const service of services){
      if(!service.active || data.routes.find(r=>r.id===service.route_id)?.archived)throw new Error('This service or route is inactive.');
      const from=action==='create_trip'?p.service_date:p.from,to=action==='create_trip'?p.service_date:p.to;
      // Validate dates even when an extra service day overrides weekday selection.
      serviceDays({...service,weekdays:[1,2,3,4,5,6,7]},from,to);
      for(let day=from;day<=to;day=addDays(day,1)){
        const exception=data.calendar_exceptions.find(e=>e.service_date===day && e.schedule_id===service.id) || data.calendar_exceptions.find(e=>e.service_date===day && !e.schedule_id);
        const eligible=day>=service.start_date && day<=service.end_date && exception?.type!=='cancelled' && (exception?.type==='extra' || serviceDays(service,day,day).length);
        if(!eligible){if(action==='create_trip')throw new Error('No service is scheduled on that date.');skipped++;continue;}
        if(data.trips.some(t=>t.schedule_id===service.id && t.service_date===day && (action==='generate_trips' || t.status!=='cancelled'))){if(action==='create_trip')throw new Error('A trip already exists for this service date.');skipped++;continue;}
        const route=data.routes.find(r=>r.id===service.route_id),version=data.route_versions.find(v=>v.id===service.route_version_id);
        const subs=data.student_subscriptions.filter(a=>a.schedule_id===service.id && a.start_date<=day && a.end_date>=day);
        const temporary={...data,route_stops:version.stops.map(s=>({...s,route_id:route.id})),student_assignments:subs.map(a=>({route_id:route.id,student_id:a.student_id,stop_id:a.pickup_stop_id,status:'assigned'}))};
        const {trip,passengers}=createTripSnapshot(temporary,{...route,bus_id:service.bus_id,driver_id:service.driver_id},day,service.departure_time);
        Object.assign(trip,{schedule_id:service.id,route_version_id:version.id,direction:service.direction,planned_end_at:new Date(+new Date(trip.planned_at)+service.duration_minutes*60000).toISOString(),turnaround_minutes:service.turnaround_minutes,location_epoch:1});
        for(const passenger of passengers){const a=subs.find(a=>a.student_id===passenger.student_id),drop=version.stops.find(s=>s.id===a.dropoff_stop_id);Object.assign(passenger,{dropoff_stop_id:drop.id,dropoff_name:drop.stop_name});}
        assertTripAllocation(data,{...trip,student_ids:passengers.map(p=>p.student_id)});
        data.trips.push(trip);data.trip_passengers.push(...passengers);count++;result.id=trip.id;
      }
    }
    result.created=count;result.skipped=skipped;
  }else if(action==='set_calendar_exception' || action==='remove_calendar_exception'){
    if(!p.reason?.trim() || !['cancelled','extra'].includes(p.type) || !/^\d{4}-\d{2}-\d{2}$/.test(p.service_date) || schoolDate(new Date(`${p.service_date}T12:00:00+08:00`))!==p.service_date)throw new Error('Choose a date, exception type, and reason.');
    if(p.schedule_id && !data.service_schedules.some(s=>s.id===p.schedule_id))throw new Error('Service not found.');
    data.calendar_exceptions=data.calendar_exceptions.filter(e=>!(e.service_date===p.service_date && (e.schedule_id || null)===(p.schedule_id || null)));
    if(action==='set_calendar_exception'){
      data.calendar_exceptions.push({id:crypto.randomUUID(),...p});
      if(p.type==='cancelled')for(const trip of data.trips.filter(t=>t.status==='scheduled' && t.service_date===p.service_date && (!p.schedule_id || t.schedule_id===p.schedule_id)))Object.assign(trip,{status:'cancelled',cancellation_reason:p.reason});
    }
  }else if(action==='publish_route'){
    const route=data.routes.find(r=>r.id===p.route_id && !r.archived);if(!route)throw new Error('Route not found or archived.');
    if(route.version_no!==p.expected_version)throw new Error('This route changed. Refresh before publishing.');
    if(!p.route_name?.trim() || !Array.isArray(p.stops) || p.stops.length<2 || p.stops.length>200 || p.stops.some(s=>!s.stop_name?.trim() || s.stop_name.trim().length>100 || !validCoordinates(s.latitude,s.longitude)))throw new Error('Provide a route name and at least two valid named stops.');
    const old=data.route_stops.filter(s=>s.route_id===route.id);
    const stops=p.stops.map((s,i)=>({...s,id:s.id || crypto.randomUUID(),route_id:route.id,stop_sequence:i+1}));
    if(new Set(stops.map(s=>s.id)).size!==stops.length || stops.some(s=>data.route_stops.some(o=>o.id===s.id && o.route_id!==route.id)))throw new Error('Stop IDs must be unique and belong to this route.');
    const map=id=>stops.some(s=>s.id===id)?id:p.stop_remap?.[id];
    const ids=new Set(stops.map(s=>s.id));
    for(const sub of data.student_subscriptions.filter(a=>data.service_schedules.some(s=>s.id===a.schedule_id && s.route_id===route.id))){
      const pickup=map(sub.pickup_stop_id),dropoff=map(sub.dropoff_stop_id);
      if(!ids.has(pickup) || !ids.has(dropoff) || stops.find(s=>s.id===pickup).stop_sequence>=stops.find(s=>s.id===dropoff).stop_sequence)throw new Error('Remap subscribed stops so pickup still precedes drop-off.');
      sub.pickup_stop_id=pickup;sub.dropoff_stop_id=dropoff;
    }
    for(const a of data.student_assignments.filter(a=>a.route_id===route.id)){if(!ids.has(map(a.stop_id)))throw new Error('Remap legacy pickup stops before removing them.');a.stop_id=map(a.stop_id);}
    route.route_name=p.route_name.trim();route.area=p.area || '';route.version_no++;
    data.route_stops=data.route_stops.filter(s=>s.route_id!==route.id).concat(stops);
    const version={id:crypto.randomUUID(),route_id:route.id,version_no:route.version_no,route_name:route.route_name,stops:structuredClone(stops),created_at:new Date().toISOString()};data.route_versions.push(version);
    data.service_schedules.filter(s=>s.route_id===route.id).forEach(s=>s.route_version_id=version.id);result.id=version.id;
  }else if(action==='archive_route'){
    const route=data.routes.find(r=>r.id===p.route_id);if(!route)throw new Error('Route not found.');
    if(data.trips.some(t=>t.route_id===route.id && ['scheduled','active'].includes(t.status)))throw new Error('Complete or cancel pending trips before archiving.');
    route.archived=true;data.service_schedules.filter(s=>s.route_id===route.id).forEach(s=>s.active=false);result.id=route.id;
  }else{
    const trip=data.trips.find(t=>t.id===p.trip_id);
    if(!trip || (actor.role!=='admin' && (actor.role!=='driver' || trip.driver_id!==actor.id)))throw new Error('This trip is not assigned to you.');
    const bus=data.buses.find(b=>b.id===trip.bus_id);
    if(action==='start_trip'){
      if(trip.status!=='scheduled' || trip.service_date!==schoolDate())throw new Error('Only today’s scheduled trips can start.');
      if(bus.status==='maintenance' || data.trips.some(t=>t.id!==trip.id && t.status==='active' && (t.bus_id===trip.bus_id || t.driver_id===trip.driver_id)))throw new Error('The bus or driver is unavailable or has an active trip.');
      const ids=new Set(data.trip_passengers.filter(a=>a.trip_id===trip.id).map(a=>a.student_id));
      if(data.trip_passengers.some(a=>a.trip_id!==trip.id && ids.has(a.student_id) && a.status==='boarded' && data.trips.some(t=>t.id===a.trip_id && t.status==='active')))throw new Error('A reserved student is still on board another active trip.');
      assertTripAllocation(data,{...trip,status:'active',student_ids:[...ids]},trip.id);Object.assign(trip,{status:'active',started_at:new Date().toISOString(),start_mileage:bus.current_mileage});bus.status='active';
    }else if(action==='complete_trip'){
      // The original validation applies to the current vehicle segment after a handover.
      if(trip.status!=='active' || !Number.isSafeInteger(p.mileage) || p.mileage<bus.current_mileage || p.mileage>10000000)throw new Error('Check the active trip and final odometer.');
      if(data.trip_passengers.some(a=>a.trip_id===trip.id && a.status==='boarded'))throw new Error('Confirm drop-off for every student on board.');
      if(p.cabin_checked!==true)throw new Error('Confirm the final cabin check.');
      Object.assign(trip,{status:'completed',completed_at:new Date().toISOString(),final_mileage:p.mileage,cabin_checked:true});bus.status='idle';bus.current_mileage=p.mileage;
    }else if(action==='replace_trip_resources'){
      if(!['scheduled','active'].includes(trip.status) || !p.reason?.trim())throw new Error('Choose a pending trip and enter a replacement reason.');
      const replacement=data.buses.find(b=>b.id===p.bus_id && b.status!=='maintenance'),driver=data.users.find(u=>u.id===p.driver_id && u.role==='driver');
      if(!replacement || !driver || data.trip_passengers.filter(a=>a.trip_id===trip.id).length>replacement.capacity)throw new Error('Replacement resources are unavailable or too small for reserved passengers.');
      if(trip.status==='active' && (p.transfer_confirmed!==true || !Number.isSafeInteger(p.mileage) || p.mileage<bus.current_mileage))throw new Error('Confirm passenger reconciliation and the outgoing vehicle odometer.');
      assertTripAllocation(data,{...trip,bus_id:replacement.id,driver_id:driver.id},trip.id);
      if(data.trips.some(t=>t.id!==trip.id && t.status==='active' && (t.bus_id===replacement.id || t.driver_id===driver.id)))throw new Error('Replacement resources have an active trip.');
      data.trip_resource_events.push({id:crypto.randomUUID(),trip_id:trip.id,old_bus_id:bus.id,old_driver_id:trip.driver_id,new_bus_id:replacement.id,new_driver_id:driver.id,reason:p.reason,old_start_mileage:trip.segment_start_mileage ?? trip.start_mileage,old_final_mileage:p.mileage ?? null,new_start_mileage:replacement.id===bus.id?p.mileage:replacement.current_mileage,created_at:new Date().toISOString(),actor_id:actor.id});
      if(trip.status==='active'){bus.current_mileage=p.mileage;bus.status=replacement.id===bus.id?'active':'idle';replacement.status='active';trip.segment_start_mileage=replacement.current_mileage;}
      Object.assign(trip,{bus_id:replacement.id,bus_label:replacement.label,plate_number:replacement.plate_number,capacity:replacement.capacity,driver_id:driver.id,driver_name:driver.name,location_epoch:trip.location_epoch+1});
    }
    // Routes retain default resources; their status is a projection of current trips.
    for(const route of data.routes)route.status=data.trips.some(t=>t.route_id===route.id && t.status==='active')?'active':data.trips.some(t=>t.route_id===route.id && t.status==='completed')?'completed':'scheduled';
    result.id=trip.id;
  }
  data.audit_events.push({id:crypto.randomUUID(),actor_id:actor.id,action,trip_id:p.trip_id || null,operation_id:p.operation_id,created_at:new Date().toISOString(),detail:{request:p,before,result}});
  data.trip_operations.push({id:p.operation_id,actor_id:actor.id,action,request,result});return result;
}
function sortObject(value){if(Array.isArray(value))return value.map(sortObject);if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortObject(value[k])]));return value;}
function validateSubscriptions(data,service){
  const subs=data.student_subscriptions.filter(a=>a.schedule_id===service.id),capacity=data.buses.find(b=>b.id===service.bus_id).capacity;
  if(subs.some(a=>a.start_date<service.start_date || a.end_date>service.end_date))throw new Error('Existing subscriptions must stay within the service dates.');
  for(const day of serviceDays({...service,weekdays:[1,2,3,4,5,6,7]}))if(subs.filter(a=>a.start_date<=day && a.end_date>=day).length>capacity)throw new Error('This service is full for one or more subscribed dates.');
  for(const a of subs)for(const other of data.student_subscriptions.filter(b=>b.student_id===a.student_id && b.schedule_id!==a.schedule_id)){
    const second=data.service_schedules.find(s=>s.id===other.schedule_id);if(!second?.active || !service.active)continue;
    if(servicesOverlap({...service,start_date:[service.start_date,a.start_date].sort().at(-1),end_date:[service.end_date,a.end_date].sort()[0]},{...second,start_date:[second.start_date,other.start_date].sort().at(-1),end_date:[second.end_date,other.end_date].sort()[0]}))throw new Error('This student has overlapping service subscriptions.');
  }
}
