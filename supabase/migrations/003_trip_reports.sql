begin;

create table public.trip_reports (
  id uuid primary key,
  trip_id uuid not null references public.trips(id),
  student_id uuid not null references public.users(id),
  student_name text not null,
  route_name text not null,
  bus_label text not null,
  pickup_name text not null,
  service_date date not null,
  reason text not null check (reason in ('missed_pickup', 'wrong_pickup', 'missing_boarding', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'submitted' check (status in ('submitted', 'received', 'resolved')),
  created_at timestamptz not null default now(),
  unique (trip_id, student_id, reason)
);

create index trip_reports_student on public.trip_reports(student_id);
create index trip_reports_open on public.trip_reports(id) where status <> 'resolved';
alter table public.trip_reports enable row level security;
revoke all on public.trip_reports from public, anon, authenticated;
grant select on public.trip_reports to authenticated;
create policy trip_reports_read on public.trip_reports for select to authenticated
  using (public.fleet_is_admin() or student_id in (
    select id from public.users where id = public.fleet_profile_id() and role = 'student'
  ));

alter function public.fleet_action(text,jsonb) rename to fleet_planning_action;
revoke all on function public.fleet_planning_action(text,jsonb) from public, anon, authenticated;

create function public.fleet_action(p_action text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.users;
  trip public.trips;
  passenger public.trip_passengers;
  report public.trip_reports;
  report_id uuid;
  requested_status text;
  reason_code text;
  description text;
begin
  if p_action not in ('submit_trip_report', 'update_trip_report') then
    return public.fleet_planning_action(p_action, p_payload);
  end if;

  select * into actor from public.users where auth_id = auth.uid();
  if not found then raise exception 'An authenticated fleet profile is required.'; end if;

  if p_action = 'submit_trip_report' then
    if actor.role <> 'student' then raise exception 'Only students can report a trip issue.'; end if;
    report_id := (p_payload->>'operation_id')::uuid;
    if report_id is null then raise exception 'A report ID is required.'; end if;
    reason_code := p_payload->>'reason';
    description := btrim(coalesce(p_payload->>'note', ''));
    if reason_code is null or reason_code not in ('missed_pickup', 'wrong_pickup', 'missing_boarding', 'other') then
      raise exception 'Choose a report reason.';
    end if;
    if char_length(description) > 500 then raise exception 'Keep your note to 500 characters.'; end if;

    select * into trip from public.trips where id = (p_payload->>'trip_id')::uuid;
    select * into passenger from public.trip_passengers where trip_id = trip.id and student_id = actor.id;
    if not found then raise exception 'Only your assigned trips can be reported.'; end if;

    insert into public.trip_reports(id, trip_id, student_id, student_name, route_name, bus_label, pickup_name, service_date, reason, note)
    values (report_id, trip.id, actor.id, passenger.student_name, trip.route_name, trip.bus_label, passenger.pickup_name, trip.service_date, reason_code, description)
    on conflict do nothing returning * into report;

    if not found then
      select * into report from public.trip_reports where id = report_id and student_id = actor.id
        and trip_id = trip.id and reason = reason_code and note = description;
      if found then return jsonb_build_object('id', report.id); end if;
      raise exception 'You already reported this issue for this trip.';
    end if;
  else
    if actor.role <> 'admin' then raise exception 'Only fleet admins can update reports.'; end if;
    requested_status := p_payload->>'status';
    if requested_status is null or requested_status not in ('received', 'resolved') then
      raise exception 'Choose Received or Resolved.';
    end if;
    select * into report from public.trip_reports where id = (p_payload->>'report_id')::uuid for update;
    if not found then raise exception 'This report is unavailable.'; end if;
    if report.status = 'resolved' or report.status = requested_status then
      return jsonb_build_object('id', report.id);
    end if;
    update public.trip_reports set status = requested_status where id = report.id returning * into report;
  end if;

  perform realtime.send('{"table":"trip_reports"}'::jsonb, 'data_changed', 'fleet:admin', true);
  perform realtime.send('{"table":"trip_reports"}'::jsonb, 'data_changed', 'user:' || report.student_id::text, true);
  return jsonb_build_object('id', report.id);
end $$;

revoke all on function public.fleet_action(text,jsonb) from public, anon;
grant execute on function public.fleet_action(text,jsonb) to authenticated;

commit;
