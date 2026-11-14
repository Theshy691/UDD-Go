-- Base schema: new installs must also apply migrations 001 and 002 in numeric order.
-- Run once in the Supabase SQL editor. Uses only the public anon/publishable key on clients.
begin;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  role text not null check (role in ('admin','driver','student')),
  student_code text unique,
  contact_number text,
  created_at timestamptz not null default now(),
  check (role <> 'student' or student_code is not null)
);
create table public.buses (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 100),
  plate_number text not null unique check (length(trim(plate_number)) between 1 and 100),
  capacity integer not null check (capacity between 1 and 100),
  current_mileage bigint not null default 0 check (current_mileage between 0 and 10000000),
  next_service_mileage bigint not null default 5000 check (next_service_mileage between 1 and 10000000),
  current_lat double precision,
  current_lng double precision,
  status text not null default 'idle' check (status in ('idle','active','maintenance')),
  created_at timestamptz not null default now()
);
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  route_name text not null check (length(trim(route_name)) between 1 and 100),
  area text,
  driver_id uuid not null unique references public.users(id),
  bus_id uuid not null unique references public.buses(id),
  color text not null default '#2ba9e0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  departure_time time not null default '06:30',
  status text not null default 'scheduled' check (status in ('scheduled','active','completed')),
  created_at timestamptz not null default now()
);
create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  stop_name text not null check (length(trim(stop_name)) between 1 and 100),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  stop_sequence integer not null check (stop_sequence > 0),
  unique(route_id, stop_sequence)
);
create table public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.users(id),
  route_id uuid not null references public.routes(id),
  stop_id uuid not null references public.route_stops(id),
  status text not null default 'assigned' check (status in ('assigned','boarded','cancelled')),
  boarded_at timestamptz
);
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.routes(id) on delete set null,
  type text not null default 'update' check (type in ('update','boarding','route','maintenance')),
  message text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index assignments_route_idx on public.student_assignments(route_id, status);
create index activity_created_idx on public.activity(created_at desc);
create index activity_route_idx on public.activity(route_id);

-- These small SECURITY DEFINER helpers prevent recursive RLS policies.
create function public.fleet_profile_id() returns uuid language sql stable security definer set search_path='' as $$
  select id from public.users where auth_id = (select auth.uid())
$$;
create function public.fleet_is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.users where auth_id = (select auth.uid()) and role='admin')
$$;
create function public.fleet_can_route(p_route_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.fleet_is_admin() or exists(select 1 from public.routes r where r.id=p_route_id and r.driver_id=public.fleet_profile_id())
    or exists(select 1 from public.student_assignments a where a.route_id=p_route_id and a.student_id=public.fleet_profile_id() and a.status<>'cancelled')
$$;
create function public.fleet_can_drive(p_route_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.fleet_is_admin() or exists(select 1 from public.routes where id=p_route_id and driver_id=public.fleet_profile_id())
$$;
create function public.fleet_can_read_person(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.fleet_is_admin() or p_id=public.fleet_profile_id()
    or exists(select 1 from public.routes r where r.driver_id=p_id and public.fleet_can_route(r.id))
    or exists(select 1 from public.student_assignments a join public.routes r on r.id=a.route_id where a.student_id=p_id and r.driver_id=public.fleet_profile_id())
$$;
create function public.fleet_can_read_bus(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.fleet_is_admin() or exists(select 1 from public.routes r where r.bus_id=p_id and public.fleet_can_route(r.id))
$$;

alter table public.users enable row level security;
alter table public.buses enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.student_assignments enable row level security;
alter table public.activity enable row level security;
create policy users_read on public.users for select to authenticated using (public.fleet_can_read_person(id));
create policy buses_read on public.buses for select to authenticated using (public.fleet_can_read_bus(id));
create policy routes_read on public.routes for select to authenticated using (public.fleet_can_route(id));
create policy stops_read on public.route_stops for select to authenticated using (public.fleet_can_route(route_id));
create policy assignments_read on public.student_assignments for select to authenticated using (
  public.fleet_is_admin() or student_id=public.fleet_profile_id() or exists(select 1 from public.routes where id=route_id and driver_id=public.fleet_profile_id())
);
create policy activity_read on public.activity for select to authenticated using (
  public.fleet_is_admin() or (route_id is not null and public.fleet_can_drive(route_id))
);
revoke all on public.users,public.buses,public.routes,public.route_stops,public.student_assignments,public.activity from anon,authenticated;
grant select on public.users,public.buses,public.routes,public.route_stops,public.student_assignments,public.activity to authenticated;

-- GPS is private, transient broadcast traffic. It is never written to the bus table.
create policy fleet_broadcast_receive on realtime.messages for select to authenticated using (
  extension='broadcast' and (
    (realtime.topic()='fleet:admin' and public.fleet_is_admin()) or
    realtime.topic()='user:'||public.fleet_profile_id()::text or
    exists(select 1 from public.routes r where realtime.topic()='route:'||r.id::text and public.fleet_can_route(r.id))
  )
);
create policy fleet_broadcast_send on realtime.messages for insert to authenticated with check (
  extension='broadcast' and exists(select 1 from public.routes r where realtime.topic()='route:'||r.id::text and public.fleet_can_drive(r.id))
);

-- Students receive aggregate occupancy without access to other students' identities.
create function public.fleet_route_capacity(p_route_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_capacity integer; v_assigned integer; v_boarded integer;
begin
  if not public.fleet_can_route(p_route_id) then raise exception 'This route is not available to your account.'; end if;
  select b.capacity into v_capacity from public.routes r join public.buses b on b.id=r.bus_id where r.id=p_route_id;
  select count(*) filter(where status<>'cancelled'),count(*) filter(where status='boarded') into v_assigned,v_boarded
    from public.student_assignments where route_id=p_route_id;
  return jsonb_build_object('capacity',v_capacity,'assigned',v_assigned,'boarded',v_boarded,'available',greatest(0,v_capacity-v_assigned));
end;
$$;
revoke all on function public.fleet_route_capacity(uuid) from public,anon;
grant execute on function public.fleet_route_capacity(uuid) to authenticated;

-- A transaction, with a row lock on the route, serializes concurrent boarding/assignment.
-- Direct writes are unavailable to browser roles; every mutation checks the caller here.
create function public.fleet_action(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor public.users; v_bus public.buses; v_route public.routes; v_assignment public.student_assignments;
  v_id uuid; v_person public.users; v_stop jsonb; v_count integer; v_mileage bigint; v_next bigint;
  v_message text; v_detail text := ''; v_type text := 'update'; v_route_id uuid;
begin
  select * into v_actor from public.users where auth_id=auth.uid();
  if v_actor.id is null then raise exception 'An authenticated fleet profile is required.'; end if;
  if p_action not in ('add_bus','update_bus','delete_bus','add_person','add_route','delete_route','assign_student','unassign_student','service_bus','start_route','end_route','board_student') then raise exception 'Unknown fleet action.'; end if;
  if p_action not in ('start_route','end_route','board_student') and v_actor.role<>'admin' then raise exception 'Only fleet administrators can make this change.'; end if;

  if p_payload ? 'route_id' then
    select * into v_route from public.routes where id=(p_payload->>'route_id')::uuid for update;
    if not found then raise exception 'Route not found.'; end if;
    v_route_id:=v_route.id;
    select * into v_bus from public.buses where id=v_route.bus_id for update;
    if p_action in ('start_route','end_route','board_student') and not public.fleet_can_drive(v_route.id) then raise exception 'You are not assigned to this route.'; end if;
  elsif p_action in ('start_route','end_route','board_student','assign_student') then raise exception 'A valid route is required.';
  end if;

  case p_action
    when 'add_bus' then
      if (p_payload->>'next_service_mileage')::bigint <= (p_payload->>'current_mileage')::bigint then raise exception 'Next service must be after the current odometer.'; end if;
      insert into public.buses(label,plate_number,capacity,current_mileage,next_service_mileage)
      values(trim(p_payload->>'label'),upper(trim(p_payload->>'plate_number')),(p_payload->>'capacity')::integer,(p_payload->>'current_mileage')::bigint,(p_payload->>'next_service_mileage')::bigint) returning id into v_id;
      v_message:=trim(p_payload->>'label')||' added to the fleet';
    when 'delete_bus' then
      delete from public.buses where id=(p_payload->>'bus_id')::uuid returning label into v_detail;
      if not found then raise exception 'Bus not found.'; end if;
      v_message:=v_detail||' removed from the fleet';
    when 'update_bus' then
      select * into v_bus from public.buses where id=(p_payload->>'bus_id')::uuid for update;
      if not found then raise exception 'Bus not found.'; end if;
      if v_bus.status='active' then raise exception 'End the active trip before editing this bus.'; end if;
      if coalesce(p_payload->>'status','') not in ('idle','maintenance') then raise exception 'Choose an available or maintenance status.'; end if;
      if (p_payload->>'current_mileage')::bigint<v_bus.current_mileage then raise exception 'The odometer cannot move backwards.'; end if;
      select count(*) into v_count from public.student_assignments a join public.routes r on r.id=a.route_id where r.bus_id=v_bus.id and a.status<>'cancelled';
      if (p_payload->>'capacity')::integer<v_count then raise exception 'Capacity cannot be lower than the number of assigned students.'; end if;
      update public.buses set label=trim(p_payload->>'label'),plate_number=upper(trim(p_payload->>'plate_number')),
        capacity=(p_payload->>'capacity')::integer,current_mileage=(p_payload->>'current_mileage')::bigint,
        next_service_mileage=(p_payload->>'next_service_mileage')::bigint,status=p_payload->>'status' where id=v_bus.id;
      v_message:=trim(p_payload->>'label')||' details updated';
    when 'add_person' then
      if (p_payload->>'role') is null or (p_payload->>'role') not in ('driver','student') then raise exception 'Choose a driver or student profile.'; end if;
      if p_payload->>'role'='student' and coalesce(length(trim(p_payload->>'student_code')),0)=0 then raise exception 'A student ID is required.'; end if;
      insert into public.users(name,role,student_code,contact_number)
      values(trim(p_payload->>'name'),p_payload->>'role',case when p_payload->>'role'='student' then upper(trim(p_payload->>'student_code')) else null end,trim(p_payload->>'contact_number')) returning id into v_id;
      v_message:=trim(p_payload->>'name')||' added';
    when 'add_route' then
      select * into v_bus from public.buses where id=(p_payload->>'bus_id')::uuid for update;
      if v_bus.id is null or v_bus.status='maintenance' then raise exception 'Choose an available bus.'; end if;
      if not exists(select 1 from public.users where id=(p_payload->>'driver_id')::uuid and role='driver') then raise exception 'Choose a valid driver.'; end if;
      if jsonb_typeof(p_payload->'stops') is distinct from 'array' or jsonb_array_length(p_payload->'stops')<2 then raise exception 'Add at least two stops.'; end if;
      insert into public.routes(route_name,area,driver_id,bus_id,color,departure_time)
      values(trim(p_payload->>'route_name'),trim(p_payload->>'area'),(p_payload->>'driver_id')::uuid,v_bus.id,p_payload->>'color',(p_payload->>'departure_time')::time) returning id into v_route_id;
      v_count:=0;
      for v_stop in select value from jsonb_array_elements(p_payload->'stops') loop
        v_count:=v_count+1;
        insert into public.route_stops(route_id,stop_name,latitude,longitude,stop_sequence)
        values(v_route_id,trim(v_stop->>'stop_name'),(v_stop->>'latitude')::double precision,(v_stop->>'longitude')::double precision,v_count);
      end loop;
      v_message:='New route: '||trim(p_payload->>'route_name'); v_type:='route';
    when 'assign_student' then
      if not exists(select 1 from public.users where id=(p_payload->>'student_id')::uuid and role='student') then raise exception 'Choose a valid student.'; end if;
      if not exists(select 1 from public.route_stops where id=(p_payload->>'stop_id')::uuid and route_id=v_route.id) then raise exception 'Choose a stop on this route.'; end if;
      select count(*) into v_count from public.student_assignments where route_id=v_route.id and status<>'cancelled';
      if v_count>=v_bus.capacity then raise exception 'This route is full. Choose a bus with available seats.'; end if;
      insert into public.student_assignments(student_id,route_id,stop_id) values((p_payload->>'student_id')::uuid,v_route.id,(p_payload->>'stop_id')::uuid);
      v_message:='Student assigned to '||v_route.route_name;
    when 'delete_route' then
      if v_route.id is null then raise exception 'Route not found.'; end if;
      if v_route.status='active' then raise exception 'End the active trip before removing this route.'; end if;
      delete from public.student_assignments where route_id=v_route.id;
      delete from public.routes where id=v_route.id;
      v_route_id:=null;
      if v_bus.status<>'maintenance' then update public.buses set status='idle' where id=v_bus.id; end if;
      v_message:=v_route.route_name||' removed'; v_type:='route';
    when 'unassign_student' then
      select * into v_assignment from public.student_assignments where id=(p_payload->>'assignment_id')::uuid;
      if not found then raise exception 'Assignment not found.'; end if;
      perform 1 from public.routes where id=v_assignment.route_id for update;
      select * into v_assignment from public.student_assignments where id=v_assignment.id for update;
      if v_assignment.status='boarded' then raise exception 'End the trip before removing a boarded student.'; end if;
      delete from public.student_assignments where id=v_assignment.id;
      v_route_id:=v_assignment.route_id; v_message:='Student route assignment removed';
    when 'start_route' then
      if v_route.status='active' then raise exception 'This route is already active.'; end if;
      if v_bus.status='maintenance' then raise exception 'This bus is in maintenance.'; end if;
      update public.routes set status='active' where id=v_route.id;
      update public.buses set status='active' where id=v_bus.id;
      update public.student_assignments set status='assigned',boarded_at=null where route_id=v_route.id and status<>'cancelled';
      v_message:=v_bus.label||' started its route'; v_type:='route'; v_detail:=v_route.route_name;
    when 'board_student' then
      if v_route.status<>'active' then raise exception 'Start your route before boarding students.'; end if;
      select * into v_person from public.users where student_code=upper(trim(p_payload->>'student_code')) and role='student';
      select * into v_assignment from public.student_assignments where route_id=v_route.id and student_id=v_person.id and status<>'cancelled' for update;
      if not found then raise exception 'This student is not assigned to your route.'; end if;
      if v_assignment.status='boarded' then raise exception 'This student has already boarded.'; end if;
      select count(*) into v_count from public.student_assignments where route_id=v_route.id and status='boarded';
      if v_count>=v_bus.capacity then raise exception 'This bus is full. Boarding is not allowed.'; end if;
      update public.student_assignments set status='boarded',boarded_at=now() where id=v_assignment.id;
      v_message:=v_person.name||' boarded '||v_bus.label; v_type:='boarding'; v_detail:=v_route.route_name;
    when 'end_route' then
      if v_route.status<>'active' then raise exception 'This route is not active.'; end if;
      v_mileage:=(p_payload->>'mileage')::bigint;
      if v_mileage is null or v_mileage<v_bus.current_mileage then raise exception 'Final mileage cannot be below the current odometer.'; end if;
      update public.routes set status='completed' where id=v_route.id;
      update public.buses set status='idle',current_mileage=v_mileage where id=v_bus.id;
      update public.student_assignments set status='assigned',boarded_at=null where route_id=v_route.id and status='boarded';
      v_message:=v_bus.label||' completed its route'; v_type:='route'; v_detail:=v_mileage::text||' km on the odometer';
    when 'service_bus' then
      select * into v_bus from public.buses where id=(p_payload->>'bus_id')::uuid for update;
      if not found then raise exception 'Bus not found.'; end if;
      if v_bus.status='active' then raise exception 'End the active trip before recording maintenance.'; end if;
      v_mileage:=(p_payload->>'mileage')::bigint; v_next:=(p_payload->>'next_service_mileage')::bigint;
      if v_mileage is null or v_next is null or v_mileage<v_bus.current_mileage or v_next<=v_mileage then raise exception 'Check the odometer and next service mileage.'; end if;
      update public.buses set current_mileage=v_mileage,next_service_mileage=v_next,status='idle' where id=v_bus.id;
      v_message:=v_bus.label||' maintenance completed'; v_type:='maintenance';
  end case;
  insert into public.activity(route_id,type,message,detail) values(v_route_id,v_type,v_message,v_detail);
  return jsonb_build_object('ok',true,'id',v_id);
exception
  when unique_violation then raise exception 'This plate number, student ID, route assignment, bus, or driver is already in use.';
  when foreign_key_violation then raise exception 'This record is still assigned to a route and cannot be removed.';
end;
$$;
revoke all on function public.fleet_action(text,jsonb) from public,anon;
grant execute on function public.fleet_action(text,jsonb) to authenticated;

-- Publish lightweight invalidations after durable changes, rather than polling tables.
create function public.fleet_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_route uuid;
begin
  if tg_op='DELETE' then v_row:=to_jsonb(old); else v_row:=to_jsonb(new); end if;
  perform realtime.send(jsonb_build_object('table',tg_table_name),'data_changed','fleet:admin',true);
  if tg_table_name='routes' then v_route:=(v_row->>'id')::uuid;
  elsif v_row ? 'route_id' then v_route:=(v_row->>'route_id')::uuid;
  elsif tg_table_name='buses' then select id into v_route from public.routes where bus_id=(v_row->>'id')::uuid;
  end if;
  if v_route is not null then
    perform realtime.send(jsonb_build_object('table',tg_table_name),'data_changed','route:'||v_route::text,true);
  end if;
  if tg_table_name='student_assignments' then
    perform realtime.send(jsonb_build_object('table',tg_table_name),'data_changed','user:'||(v_row->>'student_id'),true);
  elsif tg_table_name='routes' then
    perform realtime.send(jsonb_build_object('table',tg_table_name),'data_changed','user:'||(v_row->>'driver_id'),true);
    if tg_op='UPDATE' then
      if new.status is distinct from old.status then
        perform realtime.send(jsonb_build_object('route_id',new.id,'route_name',new.route_name,'status',new.status),'trip','route:'||new.id::text,true);
      end if;
    end if;
  end if;
  return null;
end;
$$;
create trigger users_notify after insert or update or delete on public.users for each row execute function public.fleet_notify();
create trigger buses_notify after insert or update or delete on public.buses for each row execute function public.fleet_notify();
create trigger routes_notify after insert or update or delete on public.routes for each row execute function public.fleet_notify();
create trigger stops_notify after insert or update or delete on public.route_stops for each row execute function public.fleet_notify();
create trigger assignments_notify after insert or update or delete on public.student_assignments for each row execute function public.fleet_notify();
create trigger activity_notify after insert on public.activity for each row execute function public.fleet_notify();

-- Helper functions expose only the authenticated caller's access. Never accept client auth IDs.
revoke all on function public.fleet_profile_id(),public.fleet_is_admin(),public.fleet_can_route(uuid),public.fleet_can_drive(uuid),public.fleet_can_read_person(uuid),public.fleet_can_read_bus(uuid) from public,anon;
grant execute on function public.fleet_profile_id(),public.fleet_is_admin(),public.fleet_can_route(uuid),public.fleet_can_drive(uuid),public.fleet_can_read_person(uuid),public.fleet_can_read_bus(uuid) to authenticated;
revoke all on function public.fleet_notify() from public,anon,authenticated;
commit;
