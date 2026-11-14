-- Apply once after 001_trip_history.sql. Existing trips retain their snapshots.
begin;
select pg_advisory_xact_lock(742002);
alter table public.routes drop constraint routes_bus_id_key;
alter table public.routes drop constraint routes_driver_id_key;
alter table public.routes add column version_no integer not null default 1;
alter table public.routes add column archived boolean not null default false;
drop index public.trip_active_route;
drop index public.trip_departure_unique;
create table public.route_versions (
 id uuid primary key default gen_random_uuid(), route_id uuid not null references public.routes(id),
 version_no integer not null, route_name text not null, stops jsonb not null,
 created_at timestamptz not null default now(), unique(route_id,version_no)
);
insert into public.route_versions(route_id,version_no,route_name,stops)
 select r.id,1,r.route_name,(select jsonb_agg(to_jsonb(s) order by s.stop_sequence) from public.route_stops s where s.route_id=r.id) from public.routes r;
create table public.service_schedules (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 route_id uuid not null references public.routes(id), route_version_id uuid not null references public.route_versions(id),
 direction text not null check(direction in ('outbound','return')), departure_time time not null,
 duration_minutes integer not null check(duration_minutes between 1 and 720),
 turnaround_minutes integer not null default 15 check(turnaround_minutes between 0 and 120),
 weekdays integer[] not null check(cardinality(weekdays)>0 and weekdays <@ array[1,2,3,4,5,6,7]),
 start_date date not null, end_date date not null check(end_date>=start_date and end_date-start_date<=366),
 bus_id uuid not null references public.buses(id), driver_id uuid not null references public.users(id), active boolean not null default true
);
create table public.student_subscriptions (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references public.service_schedules(id),
 student_id uuid not null references public.users(id), pickup_stop_id uuid not null references public.route_stops(id),
 dropoff_stop_id uuid not null references public.route_stops(id), start_date date not null, end_date date not null check(end_date>=start_date),
 unique(schedule_id,student_id)
);
create table public.calendar_exceptions (
 id uuid primary key default gen_random_uuid(), schedule_id uuid references public.service_schedules(id),
 service_date date not null, type text not null check(type in ('cancelled','extra')), reason text not null check(length(trim(reason)) between 1 and 500)
);
create unique index calendar_service_day on public.calendar_exceptions(schedule_id,service_date) where schedule_id is not null;
create unique index calendar_school_day on public.calendar_exceptions(service_date) where schedule_id is null;
create table public.trip_resource_events (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips(id),actor_id uuid not null references public.users(id),
 old_bus_id uuid not null references public.buses(id),new_bus_id uuid not null references public.buses(id),
 old_driver_id uuid not null references public.users(id),new_driver_id uuid not null references public.users(id),
 old_start_mileage bigint,old_final_mileage bigint,new_start_mileage bigint,reason text not null,created_at timestamptz not null default now()
);
insert into public.service_schedules(name,route_id,route_version_id,direction,departure_time,duration_minutes,weekdays,start_date,end_date,bus_id,driver_id)
 select r.route_name,r.id,v.id,'outbound',r.departure_time,60,array[1,2,3,4,5],(now() at time zone 'Asia/Manila')::date,(now() at time zone 'Asia/Manila')::date+365,r.bus_id,r.driver_id
 from public.routes r join public.route_versions v on v.route_id=r.id and v.version_no=1;
insert into public.student_subscriptions(schedule_id,student_id,pickup_stop_id,dropoff_stop_id,start_date,end_date)
 select s.id,a.student_id,a.stop_id,(v.stops->(jsonb_array_length(v.stops)-1)->>'id')::uuid,s.start_date,s.end_date
 from public.student_assignments a join public.service_schedules s on s.route_id=a.route_id join public.route_versions v on v.id=s.route_version_id where a.status<>'cancelled';
alter table public.trips add column schedule_id uuid references public.service_schedules(id);
alter table public.trips add column route_version_id uuid references public.route_versions(id);
alter table public.trips add column planned_end_at timestamptz;
alter table public.trips add column turnaround_minutes integer not null default 15 check(turnaround_minutes between 0 and 120);
alter table public.trips add column direction text not null default 'outbound' check(direction in ('outbound','return'));
alter table public.trips add column location_epoch integer not null default 1;
alter table public.trips add column segment_start_mileage bigint;
alter table public.trips drop constraint trips_check;
alter table public.trips add constraint trip_segment_mileage check(final_mileage is null or final_mileage>=coalesce(segment_start_mileage,start_mileage));
update public.trips set planned_end_at=planned_at+interval '60 minutes';
alter table public.trips alter column planned_end_at set not null;
alter table public.trips add constraint trip_time_order check(planned_end_at>planned_at);
-- Link only matching default departures; keep their stop snapshots and unknown version intact.
update public.trips t set schedule_id=s.id from public.service_schedules s
where t.route_id=s.route_id and t.bus_id=s.bus_id and t.driver_id=s.driver_id
and (t.planned_at at time zone 'Asia/Manila')::time=s.departure_time;
-- Existing trip snapshots may differ from current stops: do not invent their route-version link.
create unique index trip_schedule_day on public.trips(schedule_id,service_date) where status<>'cancelled';
create index subscription_student on public.student_subscriptions(student_id,schedule_id);

create function public.fleet_can_service(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.fleet_is_admin() or exists(select 1 from public.service_schedules s where s.id=p_id and s.driver_id=public.fleet_profile_id())
 or exists(select 1 from public.student_subscriptions a where a.schedule_id=p_id and a.student_id=public.fleet_profile_id())
$$;
create or replace function public.fleet_can_route(p_route_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.fleet_is_admin() or exists(select 1 from public.service_schedules s where s.route_id=p_route_id and public.fleet_can_service(s.id))
 or exists(select 1 from public.trips t where t.route_id=p_route_id and public.fleet_can_trip(t.id))
$$;
create or replace function public.fleet_can_drive(p_route_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.fleet_is_admin() or exists(select 1 from public.trips where route_id=p_route_id and status='active' and driver_id=public.fleet_profile_id())
$$;
create or replace function public.fleet_can_read_bus(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.fleet_is_admin() or exists(select 1 from public.trips t where t.bus_id=p_id and public.fleet_can_trip(t.id))
 or exists(select 1 from public.service_schedules s where s.bus_id=p_id and public.fleet_can_service(s.id))
$$;
create or replace function public.fleet_can_read_person(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.fleet_is_admin() or p_id=public.fleet_profile_id()
 or exists(select 1 from public.trips t where t.driver_id=p_id and public.fleet_can_trip(t.id))
 or exists(select 1 from public.service_schedules s where s.driver_id=p_id and public.fleet_can_service(s.id))
$$;
alter table public.route_versions enable row level security;
alter table public.service_schedules enable row level security;
alter table public.student_subscriptions enable row level security;
alter table public.calendar_exceptions enable row level security;
alter table public.trip_resource_events enable row level security;
create policy version_read on public.route_versions for select to authenticated using(public.fleet_can_route(route_id));
create policy service_read on public.service_schedules for select to authenticated using(public.fleet_can_service(id));
create policy subscription_read on public.student_subscriptions for select to authenticated using(public.fleet_is_admin() or student_id=public.fleet_profile_id());
create policy calendar_read on public.calendar_exceptions for select to authenticated using(schedule_id is null or public.fleet_can_service(schedule_id));
create policy resource_history_read on public.trip_resource_events for select to authenticated using(public.fleet_is_admin());
revoke all on public.route_versions,public.service_schedules,public.student_subscriptions,public.calendar_exceptions,public.trip_resource_events from public,anon,authenticated;
grant select on public.route_versions,public.service_schedules,public.student_subscriptions,public.calendar_exceptions,public.trip_resource_events to authenticated;
revoke all on function public.fleet_can_service(uuid) from public,anon;
grant execute on function public.fleet_can_service(uuid) to authenticated;

create function public.fleet_trip_capacity(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fleet_can_trip(p_id) then raise exception 'This trip is not available to your account.';end if;
 return (select jsonb_build_object('assigned',count(*),'boarded',count(*) filter(where status='boarded'),'alighted',count(*) filter(where status='alighted'),'expected',count(*) filter(where status='expected')) from public.trip_passengers where trip_id=p_id);
end $$;
revoke all on function public.fleet_trip_capacity(uuid) from public,anon;
grant execute on function public.fleet_trip_capacity(uuid) to authenticated;

-- A single school-level planning lock serializes all mutations, including edits and generation.
-- This favors correctness for a school fleet over parallel planning throughput.
create function public.fleet_assert_trip_allocation(p_id uuid,p_bus uuid,p_driver uuid,p_start timestamptz,p_end timestamptz,p_buffer integer,p_students uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.trips t where t.id is distinct from p_id and t.status in ('scheduled','active')
 and tstzrange(p_start,p_end+make_interval(mins=>p_buffer),'[)') && tstzrange(t.planned_at,greatest(t.planned_end_at,case when t.status='active' then now() else t.planned_end_at end)+make_interval(mins=>t.turnaround_minutes),'[)')
 and (t.bus_id=p_bus or t.driver_id=p_driver)) then raise exception 'Bus or driver allocation overlaps another trip, including turnaround time.'; end if;
 if exists(select 1 from public.trip_passengers a join public.trips t on t.id=a.trip_id where t.id is distinct from p_id and t.status in ('scheduled','active') and a.student_id=any(p_students)
 and tstzrange(p_start,p_end+make_interval(mins=>p_buffer),'[)') && tstzrange(t.planned_at,t.planned_end_at+make_interval(mins=>t.turnaround_minutes),'[)')) then raise exception 'A student already has a trip in this time window.'; end if;
end $$;
create function public.fleet_services_overlap(p_a public.service_schedules,p_b public.service_schedules,p_from date default null,p_to date default null) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from generate_series(greatest(p_a.start_date,coalesce(p_from,p_a.start_date))::timestamp,least(p_a.end_date,coalesce(p_to,p_a.end_date))::timestamp,interval '1 day') d
 cross join generate_series(-1,1) offset_day
 where extract(isodow from d)::integer=any(p_a.weekdays) and (d::date+offset_day) between p_b.start_date and p_b.end_date
 and (p_from is null or d::date+offset_day>=p_from) and (p_to is null or d::date+offset_day<=p_to)
 and extract(isodow from d+offset_day*interval '1 day')::integer=any(p_b.weekdays)
 and tsrange(d::date+p_a.departure_time,d::date+p_a.departure_time+make_interval(mins=>p_a.duration_minutes+p_a.turnaround_minutes),'[)')
 && tsrange((d::date+offset_day)+p_b.departure_time,(d::date+offset_day)+p_b.departure_time+make_interval(mins=>p_b.duration_minutes+p_b.turnaround_minutes),'[)'))
$$;
create function public.fleet_validate_subscriptions(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_s public.service_schedules;v_capacity integer;
begin
 select * into v_s from public.service_schedules where id=p_id;
 select capacity into v_capacity from public.buses where id=v_s.bus_id;
 if exists(select 1 from public.student_subscriptions where schedule_id=p_id and (start_date<v_s.start_date or end_date>v_s.end_date)) then raise exception 'Existing subscriptions must stay within service dates.'; end if;
 if exists(select 1 from generate_series(v_s.start_date::timestamp,v_s.end_date::timestamp,interval '1 day') d
 where (select count(*) from public.student_subscriptions a where a.schedule_id=p_id and d::date between a.start_date and a.end_date)>v_capacity) then raise exception 'This service is full for one or more subscribed dates.'; end if;
 if v_s.active and exists(select 1 from public.student_subscriptions a join public.student_subscriptions b on b.student_id=a.student_id and b.schedule_id<>a.schedule_id
 join public.service_schedules s on s.id=b.schedule_id where a.schedule_id=p_id and s.active and public.fleet_services_overlap(jsonb_populate_record(v_s,jsonb_build_object('start_date',greatest(v_s.start_date,a.start_date),'end_date',least(v_s.end_date,a.end_date))),jsonb_populate_record(s,jsonb_build_object('start_date',greatest(s.start_date,b.start_date),'end_date',least(s.end_date,b.end_date))))) then raise exception 'This student has overlapping service subscriptions.'; end if;
end $$;
revoke all on function public.fleet_assert_trip_allocation(uuid,uuid,uuid,timestamptz,timestamptz,integer,uuid[]),public.fleet_services_overlap(public.service_schedules,public.service_schedules,date,date),public.fleet_validate_subscriptions(uuid) from public,anon,authenticated;

alter function public.fleet_action(text,jsonb) rename to fleet_trip_action;
revoke all on function public.fleet_trip_action(text,jsonb) from public,anon,authenticated;
create function public.fleet_action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor public.users;v_op public.trip_operations;v_operation uuid;v_result jsonb:='{"ok":true}';v_before jsonb;
 v_s public.service_schedules;v_other public.service_schedules;v_r public.routes;v_b public.buses;v_old_bus public.buses;v_driver public.users;
 v_t public.trips;v_version public.route_versions;v_sub public.student_subscriptions;v_day date;v_from date;v_to date;v_exception public.calendar_exceptions;
 v_stop jsonb;v_stops jsonb;v_old_stops jsonb;v_pickup uuid;v_dropoff uuid;v_count integer;v_created integer:=0;v_skipped integer:=0;
 v_start timestamptz;v_end timestamptz;v_new_id uuid;v_ids uuid[];v_old_driver uuid;v_mileage bigint;v_epoch integer;v_record record;
begin
 perform pg_advisory_xact_lock(742002);
 select * into v_actor from public.users where auth_id=auth.uid();if not found then raise exception 'An authenticated fleet profile is required.';end if;
 if p_action in ('assign_student','unassign_student') then raise exception 'Manage student service subscriptions instead of a single route assignment.';end if;
 if p_action='delete_route' then raise exception 'Archive used routes to preserve route versions and service history.';end if;
 if p_action not in ('save_service','subscribe_student','unsubscribe_student','generate_trips','set_calendar_exception','remove_calendar_exception','publish_route','archive_route','replace_trip_resources','create_trip','start_trip','complete_trip') then
   if p_action='add_route' then
     if v_actor.role<>'admin' then raise exception 'Only administrators can create routes.';end if;
     select * into v_b from public.buses where id=(p_payload->>'bus_id')::uuid and status<>'maintenance';
     if not found or not exists(select 1 from public.users where id=(p_payload->>'driver_id')::uuid and role='driver') then raise exception 'Choose available default resources.';end if;
     if jsonb_typeof(p_payload->'stops') is distinct from 'array' or jsonb_array_length(p_payload->'stops') not between 2 and 200 then raise exception 'Choose between two and 200 route stops.';end if;
     insert into public.routes(route_name,area,bus_id,driver_id,color,departure_time)
     values(trim(p_payload->>'route_name'),trim(p_payload->>'area'),v_b.id,(p_payload->>'driver_id')::uuid,p_payload->>'color',(p_payload->>'departure_time')::time) returning * into v_r;
     v_count:=0;
     for v_stop in select value from jsonb_array_elements(p_payload->'stops') loop
       v_count:=v_count+1;
       insert into public.route_stops(route_id,stop_name,latitude,longitude,stop_sequence)
       values(v_r.id,trim(v_stop->>'stop_name'),(v_stop->>'latitude')::double precision,(v_stop->>'longitude')::double precision,v_count);
     end loop;
     insert into public.route_versions(route_id,version_no,route_name,stops) select v_r.id,1,v_r.route_name,jsonb_agg(to_jsonb(s) order by s.stop_sequence) from public.route_stops s where s.route_id=v_r.id;
     v_result:=jsonb_build_object('ok',true,'id',v_r.id);
     insert into public.audit_events(actor_id,action,detail) values(v_actor.id,p_action,jsonb_build_object('request',p_payload,'result',v_result));
     return v_result;
   end if;
   return public.fleet_trip_action(p_action,p_payload);
 end if;
 if p_action not in ('start_trip','complete_trip') and v_actor.role<>'admin' then raise exception 'Only administrators can change service planning.';end if;
 v_operation:=(p_payload->>'operation_id')::uuid;if v_operation is null then raise exception 'An operation ID is required.';end if;
 select * into v_op from public.trip_operations where id=v_operation;
 if found then
   if v_op.actor_id<>v_actor.id or v_op.action<>p_action or v_op.request<>p_payload then raise exception 'Operation ID has already been used for another request.';end if;
   return v_op.result;
 end if;
 if p_action='save_service' then
   select * into v_r from public.routes where id=(p_payload->>'route_id')::uuid and not archived;if not found then raise exception 'Choose an available route.';end if;
   select * into v_b from public.buses where id=(p_payload->>'bus_id')::uuid and status<>'maintenance';if not found then raise exception 'Choose an available bus.';end if;
   if not exists(select 1 from public.users where id=(p_payload->>'driver_id')::uuid and role='driver') then raise exception 'Choose a valid driver.';end if;
   select * into v_version from public.route_versions where route_id=v_r.id order by version_no desc limit 1;
   if p_payload->>'schedule_id' is not null then
     select * into v_s from public.service_schedules where id=(p_payload->>'schedule_id')::uuid;if not found then raise exception 'Service not found.';end if;
     v_before:=to_jsonb(v_s);
     if v_s.route_id<>v_r.id and exists(select 1 from public.student_subscriptions where schedule_id=v_s.id) then raise exception 'Remove or move subscriptions before changing the service route.';end if;
   end if;
   v_new_id:=coalesce(v_s.id,gen_random_uuid());
   insert into public.service_schedules(id,name,route_id,route_version_id,direction,departure_time,duration_minutes,turnaround_minutes,weekdays,start_date,end_date,bus_id,driver_id,active)
     values(v_new_id,trim(p_payload->>'name'),v_r.id,v_version.id,p_payload->>'direction',(p_payload->>'departure_time')::time,(p_payload->>'duration_minutes')::integer,(p_payload->>'turnaround_minutes')::integer,
     array(select value::integer from jsonb_array_elements_text(p_payload->'weekdays')),(p_payload->>'start_date')::date,(p_payload->>'end_date')::date,v_b.id,(p_payload->>'driver_id')::uuid,coalesce((p_payload->>'active')::boolean,true))
   on conflict(id) do update set name=excluded.name,route_id=excluded.route_id,route_version_id=excluded.route_version_id,direction=excluded.direction,departure_time=excluded.departure_time,duration_minutes=excluded.duration_minutes,turnaround_minutes=excluded.turnaround_minutes,weekdays=excluded.weekdays,start_date=excluded.start_date,end_date=excluded.end_date,bus_id=excluded.bus_id,driver_id=excluded.driver_id,active=excluded.active returning * into v_s;
   if v_s.active and exists(select 1 from public.service_schedules s where s.id<>v_s.id and s.active and (s.bus_id=v_s.bus_id or s.driver_id=v_s.driver_id) and public.fleet_services_overlap(v_s,s)) then raise exception 'Recurring service allocations overlap, including turnaround time.';end if;
   perform public.fleet_validate_subscriptions(v_s.id);v_result:=v_result||jsonb_build_object('id',v_s.id);
 elsif p_action='subscribe_student' then
   select * into v_s from public.service_schedules where id=(p_payload->>'schedule_id')::uuid and active;if not found then raise exception 'Choose an active service.';end if;
   if not exists(select 1 from public.users where id=(p_payload->>'student_id')::uuid and role='student') then raise exception 'Choose a valid student.';end if;
   select * into v_version from public.route_versions where id=v_s.route_version_id;
   v_pickup:=(p_payload->>'pickup_stop_id')::uuid;v_dropoff:=(p_payload->>'dropoff_stop_id')::uuid;
   if not exists(select 1 from jsonb_array_elements(v_version.stops) a,jsonb_array_elements(v_version.stops) b where a->>'id'=v_pickup::text and b->>'id'=v_dropoff::text and (a->>'stop_sequence')::integer<(b->>'stop_sequence')::integer) then raise exception 'Pickup must precede drop-off on this service route.';end if;
   v_from:=(p_payload->>'start_date')::date;v_to:=(p_payload->>'end_date')::date;
   if v_from<v_s.start_date or v_to>v_s.end_date or not exists(select 1 from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d where extract(isodow from d)::integer=any(v_s.weekdays)) then raise exception 'Choose subscription dates within the service calendar.';end if;
   insert into public.student_subscriptions(schedule_id,student_id,pickup_stop_id,dropoff_stop_id,start_date,end_date) values(v_s.id,(p_payload->>'student_id')::uuid,v_pickup,v_dropoff,v_from,v_to) returning id into v_new_id;
   perform public.fleet_validate_subscriptions(v_s.id);v_result:=v_result||jsonb_build_object('id',v_new_id);
 elsif p_action='unsubscribe_student' then
   delete from public.student_subscriptions where id=(p_payload->>'subscription_id')::uuid returning to_jsonb(student_subscriptions) into v_before;
   if not found then raise exception 'Subscription not found.';end if;
 elsif p_action in ('generate_trips','create_trip') then
   v_from:=(case when p_action='create_trip' then p_payload->>'service_date' else p_payload->>'from' end)::date;
   v_to:=(case when p_action='create_trip' then p_payload->>'service_date' else p_payload->>'to' end)::date;
   if v_from is null or v_to is null or v_to<v_from or v_to-v_from>6 then raise exception 'Generate at most seven service days at a time.';end if;
   if p_action='create_trip' and p_payload->>'schedule_id' is null then select id into v_new_id from public.service_schedules where route_id=(p_payload->>'route_id')::uuid and active order by departure_time limit 1;else v_new_id:=(p_payload->>'schedule_id')::uuid;end if;
   if v_new_id is not null and not exists(select 1 from public.service_schedules where id=v_new_id and active) then raise exception 'Choose an active service.';end if;
   for v_s in select * from public.service_schedules where active and (id=v_new_id or (v_new_id is null and p_action='generate_trips')) order by departure_time,id loop
     if exists(select 1 from public.routes where id=v_s.route_id and archived) then raise exception 'This route is archived.';end if;
     select * into v_version from public.route_versions where id=v_s.route_version_id;
     select * into v_b from public.buses where id=v_s.bus_id;if v_b.status='maintenance' then raise exception 'A service bus is in maintenance.';end if;
     v_day:=v_from;
     while v_day<=v_to loop
       select * into v_exception from public.calendar_exceptions where service_date=v_day and (schedule_id=v_s.id or schedule_id is null) order by schedule_id nulls last limit 1;
       if v_day not between v_s.start_date and v_s.end_date or v_exception.type='cancelled' or (v_exception.type is distinct from 'extra' and not extract(isodow from v_day)::integer=any(v_s.weekdays)) then
         if p_action='create_trip' then raise exception 'No service is scheduled on that date.';end if;v_skipped:=v_skipped+1;
       elsif exists(select 1 from public.trips where schedule_id=v_s.id and service_date=v_day and (p_action='generate_trips' or status<>'cancelled')) then
         if p_action='create_trip' then raise exception 'A trip already exists for this service date.';end if;v_skipped:=v_skipped+1;
       else
         v_start:=(v_day+v_s.departure_time) at time zone 'Asia/Manila';v_end:=v_start+make_interval(mins=>v_s.duration_minutes);
         select coalesce(array_agg(student_id),'{}') into v_ids from public.student_subscriptions where schedule_id=v_s.id and v_day between start_date and end_date;
         if cardinality(v_ids)>v_b.capacity then raise exception 'This service is full.';end if;
         perform public.fleet_assert_trip_allocation(null,v_b.id,v_s.driver_id,v_start,v_end,v_s.turnaround_minutes,v_ids);
         insert into public.trips(route_id,route_version_id,route_name,schedule_id,bus_id,bus_label,plate_number,driver_id,driver_name,capacity,service_date,planned_at,planned_end_at,turnaround_minutes,direction,stops)
         values(v_s.route_id,v_version.id,v_version.route_name,v_s.id,v_b.id,v_b.label,v_b.plate_number,v_s.driver_id,(select name from public.users where id=v_s.driver_id),v_b.capacity,v_day,v_start,v_end,v_s.turnaround_minutes,v_s.direction,v_version.stops) returning * into v_t;
         insert into public.trip_passengers(trip_id,student_id,student_name,student_code,pickup_stop_id,pickup_name,dropoff_stop_id,dropoff_name)
         select v_t.id,u.id,u.name,u.student_code,a.pickup_stop_id,pickup->>'stop_name',a.dropoff_stop_id,dropoff->>'stop_name'
         from public.student_subscriptions a join public.users u on u.id=a.student_id
         cross join jsonb_array_elements(v_version.stops) pickup cross join jsonb_array_elements(v_version.stops) dropoff
         where a.schedule_id=v_s.id and v_day between a.start_date and a.end_date and pickup->>'id'=a.pickup_stop_id::text and dropoff->>'id'=a.dropoff_stop_id::text;
         v_created:=v_created+1;v_result:=v_result||jsonb_build_object('id',v_t.id);
       end if;
       v_day:=v_day+1;
     end loop;
   end loop;
   if p_action='create_trip' and v_created=0 then raise exception 'Choose an active service.';end if;
   v_result:=v_result||jsonb_build_object('created',v_created,'skipped',v_skipped);
 elsif p_action in ('set_calendar_exception','remove_calendar_exception') then
   if coalesce(length(trim(p_payload->>'reason')),0) not between 1 and 500 or p_payload->>'type' not in ('cancelled','extra') then raise exception 'Choose an exception type and reason.';end if;
   v_day:=(p_payload->>'service_date')::date;v_new_id:=(p_payload->>'schedule_id')::uuid;
   delete from public.calendar_exceptions where service_date=v_day and schedule_id is not distinct from v_new_id;
   if p_action='set_calendar_exception' then
     insert into public.calendar_exceptions(schedule_id,service_date,type,reason) values(v_new_id,v_day,p_payload->>'type',trim(p_payload->>'reason'));
     if p_payload->>'type'='cancelled' then update public.trips set status='cancelled',cancellation_reason=trim(p_payload->>'reason') where service_date=v_day and status='scheduled' and (v_new_id is null or schedule_id=v_new_id);end if;
   end if;
 elsif p_action='publish_route' then
   select * into v_r from public.routes where id=(p_payload->>'route_id')::uuid and not archived for update;
   if not found then raise exception 'Route not found or archived.';end if;
   if (p_payload->>'expected_version')::integer is distinct from v_r.version_no then raise exception 'This route changed. Refresh before publishing.';end if;
   v_before:=to_jsonb(v_r);v_stops:=p_payload->'stops';
   if coalesce(length(trim(p_payload->>'route_name')),0) not between 1 and 100 or jsonb_typeof(v_stops) is distinct from 'array' or jsonb_array_length(v_stops) not between 2 and 200 then raise exception 'Provide a route name and at least two valid stops.';end if;
   select jsonb_agg(to_jsonb(s) order by s.stop_sequence) into v_old_stops from public.route_stops s where s.route_id=v_r.id;
   -- Preserve provided IDs; new IDs are generated before remapping subscriptions.
   select jsonb_agg(value||jsonb_build_object('id',coalesce(value->>'id',gen_random_uuid()::text),'route_id',v_r.id,'stop_sequence',ord) order by ord) into v_stops from jsonb_array_elements(v_stops) with ordinality as a(value,ord);
   if exists(select 1 from jsonb_array_elements(v_stops) s where coalesce(length(trim(s->>'stop_name')),0) not between 1 and 100 or (s->>'latitude')::double precision not between -90 and 90 or (s->>'longitude')::double precision not between -180 and 180 or not(s ? 'latitude' and s ? 'longitude')) then raise exception 'Provide valid named stops and coordinates.';end if;
   if (select count(*) from jsonb_array_elements(v_stops))<>(select count(distinct value->>'id') from jsonb_array_elements(v_stops)) or exists(select 1 from public.route_stops o where o.route_id<>v_r.id and o.id in(select (value->>'id')::uuid from jsonb_array_elements(v_stops))) then raise exception 'Stop IDs must be unique and belong to this route.';end if;
   -- Stage sequences outside their old positive range to avoid transient uniqueness failures.
   update public.route_stops set stop_sequence=stop_sequence+100000 where route_id=v_r.id;
   for v_stop in select value from jsonb_array_elements(v_stops) loop
     insert into public.route_stops(id,route_id,stop_name,latitude,longitude,stop_sequence) values((v_stop->>'id')::uuid,v_r.id,trim(v_stop->>'stop_name'),(v_stop->>'latitude')::double precision,(v_stop->>'longitude')::double precision,(v_stop->>'stop_sequence')::integer)
     on conflict(id) do update set stop_name=excluded.stop_name,latitude=excluded.latitude,longitude=excluded.longitude,stop_sequence=excluded.stop_sequence;
   end loop;
   for v_sub in select a.* from public.student_subscriptions a join public.service_schedules s on s.id=a.schedule_id where s.route_id=v_r.id loop
     v_pickup:=case when exists(select 1 from jsonb_array_elements(v_stops) where value->>'id'=v_sub.pickup_stop_id::text) then v_sub.pickup_stop_id else (p_payload->'stop_remap'->>v_sub.pickup_stop_id::text)::uuid end;
     v_dropoff:=case when exists(select 1 from jsonb_array_elements(v_stops) where value->>'id'=v_sub.dropoff_stop_id::text) then v_sub.dropoff_stop_id else (p_payload->'stop_remap'->>v_sub.dropoff_stop_id::text)::uuid end;
     if not exists(select 1 from jsonb_array_elements(v_stops) a,jsonb_array_elements(v_stops) b where a->>'id'=v_pickup::text and b->>'id'=v_dropoff::text and (a->>'stop_sequence')::integer<(b->>'stop_sequence')::integer) then raise exception 'Remap subscribed stops so pickup still precedes drop-off.';end if;
     update public.student_subscriptions set pickup_stop_id=v_pickup,dropoff_stop_id=v_dropoff where id=v_sub.id;
   end loop;
   for v_record in select * from public.student_assignments where route_id=v_r.id loop
     v_pickup:=case when exists(select 1 from jsonb_array_elements(v_stops) where value->>'id'=v_record.stop_id::text) then v_record.stop_id else (p_payload->'stop_remap'->>v_record.stop_id::text)::uuid end;
     if not exists(select 1 from jsonb_array_elements(v_stops) where value->>'id'=v_pickup::text) then raise exception 'Remap legacy pickup stops before removing them.';end if;
     update public.student_assignments set stop_id=v_pickup where id=v_record.id;
   end loop;
   delete from public.route_stops where route_id=v_r.id and id not in(select (value->>'id')::uuid from jsonb_array_elements(v_stops));
   update public.routes set route_name=trim(p_payload->>'route_name'),area=trim(p_payload->>'area'),version_no=version_no+1 where id=v_r.id returning * into v_r;
   insert into public.route_versions(route_id,version_no,route_name,stops) values(v_r.id,v_r.version_no,v_r.route_name,v_stops) returning * into v_version;
   update public.service_schedules set route_version_id=v_version.id where route_id=v_r.id;v_result:=v_result||jsonb_build_object('id',v_version.id);
 elsif p_action='archive_route' then
   select * into v_r from public.routes where id=(p_payload->>'route_id')::uuid;if not found then raise exception 'Route not found.';end if;
   if exists(select 1 from public.trips where route_id=v_r.id and status in ('scheduled','active')) then raise exception 'Complete or cancel pending trips before archiving.';end if;
   update public.routes set archived=true where id=v_r.id;update public.service_schedules set active=false where route_id=v_r.id;
 else
   select * into v_t from public.trips where id=(p_payload->>'trip_id')::uuid for update;
   if not found or (v_actor.role<>'admin' and (v_actor.role<>'driver' or v_t.driver_id is distinct from v_actor.id)) then raise exception 'This trip is not assigned to you.';end if;
   v_before:=to_jsonb(v_t);select * into v_old_bus from public.buses where id=v_t.bus_id for update;
   if p_action='start_trip' then
     if v_t.status<>'scheduled' or v_t.service_date<>(now() at time zone 'Asia/Manila')::date then raise exception 'Only today’s scheduled trips can start.';end if;
     if v_old_bus.status='maintenance' or exists(select 1 from public.trips where id<>v_t.id and status='active' and (bus_id=v_t.bus_id or driver_id=v_t.driver_id)) then raise exception 'The bus or driver is unavailable or has an active trip.';end if;
     if (select count(*) from public.trip_passengers where trip_id=v_t.id)>v_old_bus.capacity then raise exception 'This trip exceeds bus capacity.';end if;
     if exists(select 1 from public.trip_passengers mine join public.trip_passengers other on other.student_id=mine.student_id join public.trips t on t.id=other.trip_id where mine.trip_id=v_t.id and t.id<>v_t.id and t.status='active' and other.status='boarded') then raise exception 'A reserved student is still on board another active trip.';end if;
     perform public.fleet_assert_trip_allocation(v_t.id,v_t.bus_id,v_t.driver_id,v_t.planned_at,greatest(v_t.planned_end_at,now()),v_t.turnaround_minutes);
     update public.trips set status='active',start_mileage=v_old_bus.current_mileage,segment_start_mileage=v_old_bus.current_mileage,started_at=now() where id=v_t.id;
     update public.buses set status='active' where id=v_t.bus_id;
   elsif p_action='complete_trip' then
     v_mileage:=(p_payload->>'mileage')::bigint;
     if v_t.status<>'active' or v_mileage is null or v_mileage<v_old_bus.current_mileage or v_mileage>10000000 then raise exception 'Check the active trip and final odometer.';end if;
     if exists(select 1 from public.trip_passengers where trip_id=v_t.id and status='boarded') then raise exception 'Confirm drop-off for every student on board.';end if;
     if (p_payload->>'cabin_checked')::boolean is distinct from true then raise exception 'Confirm the final cabin check.';end if;
     update public.trips set status='completed',final_mileage=v_mileage,completed_at=now(),cabin_checked=true where id=v_t.id;
     update public.buses set status='idle',current_mileage=v_mileage where id=v_t.bus_id;
   elsif p_action='replace_trip_resources' then
     if v_t.status not in ('scheduled','active') or coalesce(length(trim(p_payload->>'reason')),0) not between 1 and 500 then raise exception 'Choose a pending trip and enter a replacement reason.';end if;
     select * into v_b from public.buses where id=(p_payload->>'bus_id')::uuid and status<>'maintenance';
     select * into v_driver from public.users where id=(p_payload->>'driver_id')::uuid and role='driver';
     if v_b.id is null or v_driver.id is null or (select count(*) from public.trip_passengers where trip_id=v_t.id)>v_b.capacity then raise exception 'Replacement resources are unavailable or too small for reserved passengers.';end if;
     v_mileage:=(p_payload->>'mileage')::bigint;
     if v_t.status='active' and ((p_payload->>'transfer_confirmed')::boolean is distinct from true or v_mileage is null or v_mileage<v_old_bus.current_mileage or v_mileage>10000000) then raise exception 'Confirm passenger reconciliation and the outgoing vehicle odometer.';end if;
     perform public.fleet_assert_trip_allocation(v_t.id,v_b.id,v_driver.id,v_t.planned_at,case when v_t.status='active' then greatest(v_t.planned_end_at,now()) else v_t.planned_end_at end,v_t.turnaround_minutes);
     if exists(select 1 from public.trips where id<>v_t.id and status='active' and (bus_id=v_b.id or driver_id=v_driver.id)) then raise exception 'Replacement resources have an active trip.';end if;
     insert into public.trip_resource_events(trip_id,actor_id,old_bus_id,new_bus_id,old_driver_id,new_driver_id,old_start_mileage,old_final_mileage,new_start_mileage,reason)
     values(v_t.id,v_actor.id,v_t.bus_id,v_b.id,v_t.driver_id,v_driver.id,coalesce(v_t.segment_start_mileage,v_t.start_mileage),v_mileage,case when v_t.bus_id=v_b.id then v_mileage else v_b.current_mileage end,trim(p_payload->>'reason'));
     if v_t.status='active' then
       update public.buses set status=case when id=v_b.id then 'active' else 'idle' end,current_mileage=v_mileage where id=v_old_bus.id;
       update public.buses set status='active' where id=v_b.id;
     end if;
     v_old_driver:=v_t.driver_id;
     update public.trips set bus_id=v_b.id,bus_label=v_b.label,plate_number=v_b.plate_number,capacity=v_b.capacity,driver_id=v_driver.id,driver_name=v_driver.name,
       location_epoch=location_epoch+1,segment_start_mileage=case when status='active' then case when v_b.id=v_old_bus.id then v_mileage else v_b.current_mileage end else segment_start_mileage end where id=v_t.id;
     perform realtime.send('{"table":"trips"}'::jsonb,'data_changed','user:'||v_old_driver::text,true);
   end if;
   update public.routes r set status=case when exists(select 1 from public.trips where route_id=r.id and status='active') then 'active' when exists(select 1 from public.trips where route_id=r.id and status='completed') then 'completed' else 'scheduled' end where r.id=v_t.route_id;
   v_result:=v_result||jsonb_build_object('id',v_t.id);
 end if;
 insert into public.audit_events(actor_id,action,trip_id,operation_id,detail) values(v_actor.id,p_action,(p_payload->>'trip_id')::uuid,v_operation,jsonb_build_object('request',p_payload,'before',v_before,'result',v_result));
 insert into public.trip_operations(id,actor_id,action,request,result) values(v_operation,v_actor.id,p_action,p_payload,v_result);
 if p_action in ('start_trip','complete_trip') then
   for v_record in select student_id as id from public.trip_passengers where trip_id=v_t.id loop
     perform realtime.send(jsonb_build_object('trip_id',v_t.id,'route_id',v_t.route_id,'route_name',v_t.route_name,'status',case when p_action='start_trip' then 'active' else 'completed' end),'trip','user:'||v_record.id::text,true);
   end loop;
 end if;
 -- Planning is infrequent. Invalidate each fleet profile so reassignment is discovered immediately.
 for v_record in select id from public.users loop perform realtime.send('{"table":"planning"}'::jsonb,'data_changed','user:'||v_record.id::text,true);end loop;
 perform realtime.send('{"table":"planning"}'::jsonb,'data_changed','fleet:admin',true);
 return v_result;
end $$;
revoke all on function public.fleet_action(text,jsonb) from public,anon;
grant execute on function public.fleet_action(text,jsonb) to authenticated;

-- Location traffic is still transient. The RPC validates the current driver on every sample.
-- Epoch-specific topics ensure a removed driver's cached subscription receives no later samples.
drop policy fleet_broadcast_send on realtime.messages;
drop policy fleet_broadcast_receive on realtime.messages;
create policy fleet_broadcast_receive on realtime.messages for select to authenticated using(extension='broadcast' and (
 (realtime.topic()='fleet:admin' and public.fleet_is_admin()) or realtime.topic()='user:'||public.fleet_profile_id()::text
 or exists(select 1 from public.trips t where realtime.topic()='trip:'||t.id::text||':'||t.location_epoch::text and t.status='active' and public.fleet_can_trip(t.id))
));
create function public.fleet_publish_position(p_trip_id uuid,p_epoch integer,p_lat double precision,p_lng double precision,p_at bigint) returns void language plpgsql security definer set search_path='' as $$
declare v_t public.trips;
begin
 select * into v_t from public.trips where id=p_trip_id;
 if not found or v_t.status<>'active' or p_epoch is distinct from v_t.location_epoch or not exists(select 1 from public.users where auth_id=auth.uid() and (role='admin' or (role='driver' and id=v_t.driver_id))) then raise exception 'You are not the current active trip publisher.';end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_at is null or p_at>extract(epoch from now())*1000+60000 or p_at<extract(epoch from now())*1000-120000 then raise exception 'Invalid or stale location sample.';end if;
 perform realtime.send(jsonb_build_object('trip_id',v_t.id,'route_id',v_t.route_id,'location_epoch',v_t.location_epoch,'lat',p_lat,'lng',p_lng,'at',p_at),'position','trip:'||v_t.id::text||':'||v_t.location_epoch::text,true);
end $$;
revoke all on function public.fleet_publish_position(uuid,integer,double precision,double precision,bigint) from public,anon;
grant execute on function public.fleet_publish_position(uuid,integer,double precision,double precision,bigint) to authenticated;
commit;
