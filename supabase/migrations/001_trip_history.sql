-- Apply after schema.sql, once, BETWEEN journeys. All changes roll back if a route is active.
begin;
do $$ begin
  if exists(select 1 from public.routes where status='active') then
    raise exception 'Finish active routes before applying the trip migration. No changes were applied.';
  end if;
end $$;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.routes(id) on delete set null,
  route_name text not null,
  bus_id uuid references public.buses(id) on delete set null,
  bus_label text not null, plate_number text not null,
  driver_id uuid references public.users(id) on delete set null,
  driver_name text not null,
  capacity integer not null check(capacity between 1 and 100),
  service_date date not null, planned_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','active','completed','cancelled')),
  stops jsonb not null check(jsonb_typeof(stops)='array' and jsonb_array_length(stops)>=2),
  start_mileage bigint, final_mileage bigint,
  started_at timestamptz, completed_at timestamptz,
  cabin_checked boolean not null default false, cancellation_reason text,
  created_at timestamptz not null default now(),
  check(final_mileage is null or final_mileage>=start_mileage)
);
create unique index trip_departure_unique on public.trips(route_id,planned_at) where status<>'cancelled';
create unique index trip_active_bus on public.trips(bus_id) where status='active';
create unique index trip_active_driver on public.trips(driver_id) where status='active';
create unique index trip_active_route on public.trips(route_id) where status='active';
create index trip_service_date on public.trips(service_date desc,id);
create table public.trip_passengers (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id),
  student_id uuid not null references public.users(id), student_name text not null, student_code text not null,
  pickup_stop_id uuid not null, pickup_name text not null,
  dropoff_stop_id uuid not null, dropoff_name text not null,
  status text not null default 'expected' check(status in ('expected','boarded','alighted')),
  boarded_at timestamptz, alighted_at timestamptz,
  unique(trip_id,student_id), unique(trip_id,student_code)
);
create table public.passenger_events (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id),
  student_id uuid not null references public.users(id), actor_id uuid not null references public.users(id),
  type text not null check(type in ('boarded','alighted')), stop_id uuid not null,
  operation_id uuid not null unique, created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.users(id),
  action text not null, trip_id uuid references public.trips(id), operation_id uuid unique,
  detail jsonb not null, created_at timestamptz not null default now()
);
create table public.trip_operations (
  id uuid primary key, actor_id uuid not null references public.users(id), action text not null,
  request jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index trip_passenger_student on public.trip_passengers(student_id,trip_id);
create index passenger_event_trip on public.passenger_events(trip_id,created_at);
create index audit_created on public.audit_events(created_at desc);

create function public.fleet_can_trip(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.fleet_is_admin() or exists(select 1 from public.trips where id=p_id and driver_id=public.fleet_profile_id())
    or exists(select 1 from public.trip_passengers where trip_id=p_id and student_id=public.fleet_profile_id())
$$;
alter table public.trips enable row level security;
alter table public.trip_passengers enable row level security;
alter table public.passenger_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.trip_operations enable row level security;
create policy trip_read on public.trips for select to authenticated using(public.fleet_can_trip(id));
create policy manifest_read on public.trip_passengers for select to authenticated using(
  public.fleet_is_admin() or student_id=public.fleet_profile_id() or exists(select 1 from public.trips where id=trip_id and driver_id=public.fleet_profile_id())
);
create policy passenger_event_read on public.passenger_events for select to authenticated using(
  public.fleet_is_admin() or student_id=public.fleet_profile_id() or exists(select 1 from public.trips where id=trip_id and driver_id=public.fleet_profile_id())
);
create policy audit_read on public.audit_events for select to authenticated using(public.fleet_is_admin());
revoke all on public.trips,public.trip_passengers,public.passenger_events,public.audit_events,public.trip_operations from public,anon,authenticated;
grant select on public.trips,public.trip_passengers,public.passenger_events,public.audit_events to authenticated;
revoke all on function public.fleet_can_trip(uuid) from public,anon;
grant execute on function public.fleet_can_trip(uuid) to authenticated;

-- The original mutation body stays available only to the new guarded wrapper.
alter function public.fleet_action(text,jsonb) rename to fleet_legacy_action;
revoke all on function public.fleet_legacy_action(text,jsonb) from public,anon,authenticated;
create function public.fleet_action(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor public.users; route public.routes; bus public.buses; trip public.trips; passenger public.trip_passengers;
  op public.trip_operations; result jsonb; operation uuid; stops jsonb; terminal jsonb; chosen_stop jsonb;
  planned timestamptz; service_day date; mileage bigint; total integer; before_state jsonb;
begin
  select * into actor from public.users where auth_id=auth.uid();
  if actor.id is null then raise exception 'An authenticated fleet profile is required.'; end if;
  if p_action in ('start_route','end_route','board_student') then
    raise exception 'Use a dated trip for start, boarding, and completion. Refresh the application.';
  end if;
  if p_action not in ('create_trip','start_trip','record_boarding','record_alighting','complete_trip','cancel_trip') then
    if p_payload ? 'route_id' then perform 1 from public.routes where id=(p_payload->>'route_id')::uuid for update; end if;
    if p_payload ? 'bus_id' then perform 1 from public.buses where id=(p_payload->>'bus_id')::uuid for update; end if;
    -- No caller can use legacy deletion to discard a planned/active trip's resources.
    if p_action in ('delete_route','update_bus','delete_bus') and exists(
      select 1 from public.trips t where t.status in ('scheduled','active') and
      ((p_action='delete_route' and t.route_id=(p_payload->>'route_id')::uuid) or
       (p_action in ('update_bus','delete_bus') and t.bus_id=(p_payload->>'bus_id')::uuid))
    ) then raise exception 'Complete or cancel prepared trips before changing these resources.'; end if;
    if p_action='service_bus' and exists(select 1 from public.trips t where t.bus_id=(p_payload->>'bus_id')::uuid and t.status='active') then
      raise exception 'End the active trip before recording maintenance.';
    end if;
    before_state:=jsonb_build_object('bus',(select to_jsonb(b) from public.buses b where b.id=(p_payload->>'bus_id')::uuid),
      'assignment',(select to_jsonb(a) from public.student_assignments a where a.id=(p_payload->>'assignment_id')::uuid));
    result:=public.fleet_legacy_action(p_action,p_payload);
    insert into public.audit_events(actor_id,action,detail) values(actor.id,p_action,jsonb_build_object('request',p_payload,'before',before_state,'result',result));
    return result;
  end if;
  operation:=(p_payload->>'operation_id')::uuid;
  if operation is null then raise exception 'An operation ID is required.'; end if;
  -- A transaction-scoped lock makes retries atomic, including simultaneous retries.
  perform pg_advisory_xact_lock(hashtextextended(operation::text,0));
  select * into op from public.trip_operations where id=operation;
  if found then
    if op.actor_id<>actor.id or op.action<>p_action or op.request<>p_payload then raise exception 'Operation ID has already been used for another request.'; end if;
    return op.result;
  end if;
  if p_action='create_trip' then
    if actor.role<>'admin' then raise exception 'Only administrators can prepare trips.'; end if;
    select * into route from public.routes where id=(p_payload->>'route_id')::uuid for update;
    if not found then raise exception 'Route not found.'; end if;
    select * into bus from public.buses where id=route.bus_id for update;
    if bus.status='maintenance' then raise exception 'This bus is in maintenance.'; end if;
    service_day:=(p_payload->>'service_date')::date;
    planned:=(service_day::text||' '||(p_payload->>'departure_time'))::timestamp at time zone 'Asia/Manila';
    if service_day is null or planned is null then raise exception 'Choose a service date and departure time.'; end if;
    select jsonb_agg(to_jsonb(s) order by s.stop_sequence) into stops from public.route_stops s where s.route_id=route.id;
    if stops is null or jsonb_array_length(stops)<2 then raise exception 'A trip needs at least two stops.'; end if;
    terminal:=stops->(jsonb_array_length(stops)-1);
    select count(*) into total from public.student_assignments where route_id=route.id and status<>'cancelled';
    if total>bus.capacity then raise exception 'This trip exceeds bus capacity.'; end if;
    insert into public.trips(route_id,route_name,bus_id,bus_label,plate_number,driver_id,driver_name,capacity,service_date,planned_at,stops)
      values(route.id,route.route_name,bus.id,bus.label,bus.plate_number,route.driver_id,(select name from public.users where id=route.driver_id),bus.capacity,service_day,planned,stops)
      returning * into trip;
    insert into public.trip_passengers(trip_id,student_id,student_name,student_code,pickup_stop_id,pickup_name,dropoff_stop_id,dropoff_name)
      select trip.id,u.id,u.name,u.student_code,s.id,s.stop_name,(terminal->>'id')::uuid,terminal->>'stop_name'
      from public.student_assignments a join public.users u on u.id=a.student_id join public.route_stops s on s.id=a.stop_id
      where a.route_id=route.id and a.status<>'cancelled';
  else
    select * into trip from public.trips where id=(p_payload->>'trip_id')::uuid for update;
    if not found or (actor.role<>'admin' and (actor.role<>'driver' or trip.driver_id is distinct from actor.id)) then raise exception 'This trip is not assigned to you.'; end if;
    before_state:=to_jsonb(trip);
    select * into bus from public.buses where id=trip.bus_id for update;
    if p_action='start_trip' then
      if trip.status<>'scheduled' then raise exception 'Only a scheduled trip can start.'; end if;
      if trip.service_date<>(now() at time zone 'Asia/Manila')::date then raise exception 'Only today’s trips can start.'; end if;
      if bus.id is null or bus.status='maintenance' then raise exception 'This bus is in maintenance.'; end if;
      -- Serialize starts for a shared driver even across different buses.
      perform 1 from public.users where id=trip.driver_id for update;
      if exists(select 1 from public.trips where id<>trip.id and status='active' and (bus_id=trip.bus_id or driver_id=trip.driver_id or route_id=trip.route_id)) then raise exception 'This bus, driver, or route has an active trip.'; end if;
      select count(*) into total from public.trip_passengers where trip_id=trip.id;
      if total>bus.capacity then raise exception 'This trip exceeds bus capacity.'; end if;
      update public.trips set status='active',start_mileage=bus.current_mileage,started_at=now() where id=trip.id;
      update public.buses set status='active' where id=bus.id;
      update public.student_assignments set status='assigned',boarded_at=null where route_id=trip.route_id and status<>'cancelled';
      update public.routes set status='active' where id=trip.route_id;
    elsif p_action='cancel_trip' then
      if actor.role<>'admin' or trip.status<>'scheduled' then raise exception 'Only administrators can cancel scheduled trips.'; end if;
      if coalesce(length(trim(p_payload->>'reason')),0) not between 1 and 500 then raise exception 'Enter a cancellation reason (up to 500 characters).'; end if;
      update public.trips set status='cancelled',cancellation_reason=trim(p_payload->>'reason') where id=trip.id;
    elsif p_action='complete_trip' then
      if trip.status<>'active' then raise exception 'This trip is not active.'; end if;
      mileage:=(p_payload->>'mileage')::bigint;
      if mileage is null or mileage<greatest(bus.current_mileage,trip.start_mileage) or mileage>10000000 then raise exception 'Final mileage cannot be below the current odometer or outside its allowed range.'; end if;
      if exists(select 1 from public.trip_passengers where trip_id=trip.id and status='boarded') then raise exception 'Confirm drop-off for every student on board before completing this trip.'; end if;
      if (p_payload->>'cabin_checked')::boolean is distinct from true then raise exception 'Confirm the final cabin check before completing this trip.'; end if;
      update public.trips set status='completed',final_mileage=mileage,completed_at=now(),cabin_checked=true where id=trip.id;
      update public.buses set status='idle',current_mileage=mileage where id=bus.id;
      update public.routes set status='completed' where id=trip.route_id;
    else
      if trip.status<>'active' then raise exception 'Start this trip before recording passenger movement.'; end if;
      select * into passenger from public.trip_passengers where trip_id=trip.id and student_code=upper(trim(p_payload->>'student_code')) for update;
      if not found then raise exception 'This student is not assigned to this trip.'; end if;
      before_state:=to_jsonb(passenger);
      if p_action='record_boarding' and passenger.status<>'expected' then raise exception 'This student has already boarded.'; end if;
      if p_action='record_alighting' and passenger.status<>'boarded' then raise exception 'Only a student on board can be dropped off.'; end if;
      select value into chosen_stop from jsonb_array_elements(trip.stops) where value->>'id'=p_payload->>'stop_id';
      if chosen_stop is null or (p_payload->>'stop_id')::uuid<>(case when p_action='record_boarding' then passenger.pickup_stop_id else passenger.dropoff_stop_id end) then raise exception 'Choose the student’s assigned stop.'; end if;
      select count(*) into total from public.trip_passengers where trip_id=trip.id and status='boarded';
      if p_action='record_boarding' and total>=least(bus.capacity,trip.capacity) then raise exception 'This bus is full.'; end if;
      update public.trip_passengers set status=case when p_action='record_boarding' then 'boarded' else 'alighted' end,
        boarded_at=case when p_action='record_boarding' then now() else boarded_at end,
        alighted_at=case when p_action='record_alighting' then now() else alighted_at end where id=passenger.id;
      update public.student_assignments set status=case when p_action='record_boarding' then 'boarded' else 'assigned' end,
        boarded_at=case when p_action='record_boarding' then now() else null end where route_id=trip.route_id and student_id=passenger.student_id;
      insert into public.passenger_events(trip_id,student_id,actor_id,type,stop_id,operation_id)
        values(trip.id,passenger.student_id,actor.id,case when p_action='record_boarding' then 'boarded' else 'alighted' end,(chosen_stop->>'id')::uuid,operation);
    end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',trip.id);
  insert into public.audit_events(actor_id,action,trip_id,operation_id,detail)
    values(actor.id,p_action,trip.id,operation,jsonb_build_object('request',p_payload,'before',before_state,'result',result));
  insert into public.trip_operations(id,actor_id,action,request,result) values(operation,actor.id,p_action,p_payload,result);
  -- Notify profile topics too: prepared trips must be discoverable before route access changes.
  perform realtime.send(jsonb_build_object('table','trips'),'data_changed','fleet:admin',true);
  perform realtime.send(jsonb_build_object('table','trips'),'data_changed','user:'||trip.driver_id::text,true);
  for passenger in select * from public.trip_passengers where trip_id=trip.id loop
    perform realtime.send(jsonb_build_object('table','trips'),'data_changed','user:'||passenger.student_id::text,true);
  end loop;
  if trip.route_id is not null then perform realtime.send(jsonb_build_object('table','trips'),'data_changed','route:'||trip.route_id::text,true); end if;
  return result;
end;
$$;
revoke all on function public.fleet_action(text,jsonb) from public,anon;
grant execute on function public.fleet_action(text,jsonb) to authenticated;
commit;
