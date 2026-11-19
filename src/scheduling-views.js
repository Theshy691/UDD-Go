import { store } from './store.js';
import { resetTripHistory } from './trip-views.js';
import { schoolDate } from './trips.js';
import { addDays } from './scheduling.js';
import { escapeHtml as esc } from './domain.js';
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const option = (id, label, selected) =>
  `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`;
export function schedulingPage(ui) {
  const admin = store.profile.role === 'admin',
    services = store.data.service_schedules;
  const serviceGrid = (rows) =>
    `<div class="route-grid">${
      rows
        .map((s) => {
          const route = store.data.routes.find((r) => r.id === s.route_id),
            bus = store.data.buses.find((b) => b.id === s.bus_id),
            driver = store.data.users.find((u) => u.id === s.driver_id);
          return `<section class="card route-card"><div class="between"><h2>${esc(s.name)}</h2>${ui.badge(s.active ? 'scheduled' : 'cancelled')}</div><p>${esc(route?.route_name || 'Archived route')} · ${esc(s.direction)}</p><p><strong>${esc(s.departure_time.slice(0, 5))}</strong> · ${s.duration_minutes} minutes · ${s.turnaround_minutes} minute turnaround</p><p>${s.weekdays.map((d) => dayNames[d - 1]).join(', ')}<br>${esc(s.start_date)} → ${esc(s.end_date)}</p><div class="route-meta"><div><span>Bus</span>${esc(bus?.label || 'Unavailable')}</div><div><span>Driver</span>${esc(driver?.name || 'Unavailable')}</div></div>${admin ? `<div class="trip-actions">${ui.button('Edit service', 'save-service', { id: s.id })}${ui.button('Passengers', 'service-passengers', { id: s.id })}${ui.button('Generate trips', 'generate-service-trips', { id: s.id })}</div>` : ''}</section>`;
        })
        .join('') ||
      '<section class="card"><div class="empty">Create a route, then add its first service.</div></section>'
    }</div>`;
  const exceptions = (rows) =>
    `<div class="activity-list">${rows.map((e) => `<div class="setting-row"><div><strong>${esc(e.service_date)} · ${esc(e.type === 'cancelled' ? 'No service' : 'Extra service day')}</strong><p>${esc(services.find((s) => s.id === e.schedule_id)?.name || 'All services')} · ${esc(e.reason)}</p></div>${ui.button('Remove', 'remove-calendar-exception', { id: e.id })}</div>`).join('') || '<p class="muted">No exceptions. Services follow their weekday calendars.</p>'}</div>`;
  return `<div class="service-page-heading">${ui.pageHeader('Plan the school week.', 'Separate services, shared resources, and a calendar for every school run.', admin ? `${ui.button('Generate trips', 'generate-service-trips')}${ui.button('Create service', 'save-service', { primary: true })}` : '')}</div>
  ${ui.paginate('services', services, serviceGrid, { label: 'Services', size: 9 })}
  ${admin ? `<section class="card" style="margin-top:24px"><div class="card-head"><h2>School calendar exceptions</h2>${ui.button('Add exception', 'calendar-exception')}</div>${ui.paginate('calendar-exceptions', store.data.calendar_exceptions, exceptions, { label: 'Calendar exceptions' })}</section>` : ''}`;
}
export async function schedulingAction(action, id, ui) {
  if (
    ![
      'save-service',
      'generate-service-trips',
      'calendar-exception',
      'remove-calendar-exception',
      'service-passengers',
      'subscribe-service',
      'unsubscribe-service',
      'replace-trip-resources',
      'archive-route',
    ].includes(action)
  )
    return false;
  if (store.profile.role !== 'admin')
    throw new Error('Only administrators can manage service planning.');
  const services = store.data.service_schedules,
    operation_id = crypto.randomUUID();
  const submit = async (name, payload, message) => {
    resetTripHistory();
    const result = await store.action(name, { ...payload, operation_id });
    ui.closeModal();
    ui.toast(message || 'Saved.');
    return result;
  };
  if (action === 'save-service') {
    const s = services.find((s) => s.id === id),
      routes = store.data.routes.filter((r) => !r.archived),
      buses = store.data.buses.filter((b) => b.status !== 'maintenance'),
      drivers = store.data.users.filter((u) => u.role === 'driver');
    if (!routes.length || !buses.length || !drivers.length)
      throw new Error('Add an available route, bus, and driver first.');
    ui.showModal(
      s ? 'Edit this service.' : 'Add a recurring service.',
      'Changes affect future preparations. Existing dated trips keep their saved allocations.',
      `<form>${ui.inputField('Service name', 'name', { value: s?.name || '' })}${ui.selectField('Route', 'route_id', routes.map((r) => option(r.id, r.route_name, s?.route_id)).join(''))}<div class="note">Stops follow the selected route’s order. Choose a campus-first route for a return service.</div>${ui.selectField('Direction', 'direction', option('outbound', 'To campus', s?.direction || 'outbound') + option('return', 'Return journey', s?.direction))}<div class="field-row">${ui.inputField('Departure time', 'departure_time', { type: 'time', value: s?.departure_time || '06:30' })}${ui.inputField('Duration (minutes)', 'duration_minutes', { type: 'number', min: 1, max: 720, value: s?.duration_minutes || 60 })}</div>${ui.inputField('Turnaround (minutes)', 'turnaround_minutes', { type: 'number', min: 0, max: 120, value: s?.turnaround_minutes ?? 15 })}<fieldset class="service-weekdays"><legend>Service weekdays</legend>${dayNames.map((name, i) => `<label><input type="checkbox" name="weekday" value="${i + 1}" ${(s?.weekdays || [1, 2, 3, 4, 5]).includes(i + 1) ? 'checked' : ''}>${name}</label>`).join('')}</fieldset><div class="field-row">${ui.inputField('Effective from', 'start_date', { type: 'date', value: s?.start_date || schoolDate() })}${ui.inputField('Effective until', 'end_date', { type: 'date', value: s?.end_date || addDays(schoolDate(), 365) })}</div>${ui.selectField('Bus', 'bus_id', buses.map((b) => option(b.id, `${b.label} · ${b.capacity} seats`, s?.bus_id)).join(''))}${ui.selectField('Driver', 'driver_id', drivers.map((d) => option(d.id, d.name, s?.driver_id)).join(''))}<label class="setting-row"><span>Service is active</span><input type="checkbox" name="active" ${!s || s.active ? 'checked' : ''}></label>${ui.formFooter('Save service')}</form>`,
      {
        onSubmit: async (f) =>
          submit(
            'save_service',
            {
              schedule_id: s?.id,
              name: f.get('name'),
              route_id: f.get('route_id'),
              direction: f.get('direction'),
              departure_time: f.get('departure_time'),
              duration_minutes: Number(f.get('duration_minutes')),
              turnaround_minutes: Number(f.get('turnaround_minutes')),
              weekdays: f.getAll('weekday').map(Number),
              start_date: f.get('start_date'),
              end_date: f.get('end_date'),
              bus_id: f.get('bus_id'),
              driver_id: f.get('driver_id'),
              active: f.get('active') === 'on',
            },
            'Service saved.'
          ),
      }
    );
  } else if (action === 'generate-service-trips') {
    if (!services.some((s) => s.active)) throw new Error('Create an active service first.');
    ui.showModal(
      'Prepare the next school runs.',
      'Generate up to seven days. Existing journeys, cancellations, and holidays are preserved.',
      `<form>${ui.selectField(
        'Service',
        'schedule_id',
        option('all', 'All active services', id || 'all') +
          services
            .filter((s) => s.active)
            .map((s) => option(s.id, s.name, id))
            .join('')
      )}<div class="field-row">${ui.inputField('From', 'from', { type: 'date', value: schoolDate() })}${ui.inputField('Through', 'to', { type: 'date', value: addDays(schoolDate(), 6) })}</div><div class="note">Generation is atomic: a conflict leaves the batch unchanged. Correct the allocation and try again.</div>${ui.formFooter('Generate trips')}</form>`,
      {
        onSubmit: async (f) => {
          resetTripHistory();
          const result = await store.action('generate_trips', {
            schedule_id: f.get('schedule_id') === 'all' ? undefined : f.get('schedule_id'),
            from: f.get('from'),
            to: f.get('to'),
            operation_id,
          });
          ui.closeModal();
          ui.toast(`${result.created} trips prepared; ${result.skipped} dates skipped.`);
        },
      }
    );
  } else if (action === 'calendar-exception' || action === 'remove-calendar-exception') {
    const e = store.data.calendar_exceptions.find((e) => e.id === id);
    ui.showModal(
      e ? 'Remove this calendar exception?' : 'Set a calendar exception.',
      'No-service dates cancel matching unstarted trips. Active journeys continue; removing an exception does not restore cancelled trips.',
      `<form>${e ? `<p>${esc(e.service_date)} · ${esc(e.reason)}</p>` : `${ui.inputField('Service date', 'service_date', { type: 'date', value: schoolDate() })}${ui.selectField('Scope', 'schedule_id', option('all', 'All services', 'all') + services.map((s) => option(s.id, s.name)).join(''))}${ui.selectField('Exception', 'type', option('cancelled', 'No service', 'cancelled') + option('extra', 'Extra service day'))}`}${ui.inputField('Reason', 'reason', { value: e ? 'Remove calendar exception' : '' })}${ui.formFooter(e ? 'Remove exception' : 'Save exception')}</form>`,
      {
        onSubmit: async (f) =>
          submit(
            e ? 'remove_calendar_exception' : 'set_calendar_exception',
            {
              service_date: e?.service_date || f.get('service_date'),
              schedule_id: e
                ? e.schedule_id || undefined
                : f.get('schedule_id') === 'all'
                  ? undefined
                  : f.get('schedule_id'),
              type: e?.type || f.get('type'),
              reason: f.get('reason'),
            },
            'Calendar updated.'
          ),
      }
    );
  } else if (action === 'service-passengers') {
    const s = services.find((s) => s.id === id);
    if (!s) throw new Error('Service not found.');
    const subs = store.data.student_subscriptions.filter((a) => a.schedule_id === id),
      stops = store.data.route_versions.find((v) => v.id === s.route_version_id)?.stops || [];
    const passengers = (rows) =>
      `<div class="trip-passenger-list">${rows.map((a) => `<article class="trip-passenger"><div><strong>${esc(store.data.users.find((u) => u.id === a.student_id)?.name)}</strong><p>${esc(stops.find((s) => s.id === a.pickup_stop_id)?.stop_name)} → ${esc(stops.find((s) => s.id === a.dropoff_stop_id)?.stop_name)}</p><p class="small muted">${esc(a.start_date)} → ${esc(a.end_date)}</p></div>${ui.button('Remove subscription', 'unsubscribe-service', { id: a.id })}</article>`).join('') || '<p class="note">No subscriptions yet.</p>'}</div>`;
    ui.showModal(
      esc(s.name),
      'Subscriptions reserve seats on applicable dates. Changes do not rewrite prepared manifests.',
      (paginate) =>
        `${paginate('service-passengers', subs, passengers, { label: 'Service passengers' })}<div class="modal-footer">${ui.button('Close', 'close-modal')}${ui.button('Add passenger', 'subscribe-service', { id: `schedule:${id}`, primary: true })}</div>`,
      { wide: true }
    );
  } else if (action === 'subscribe-service') {
    const students = store.data.users.filter((u) => u.role === 'student'),
      active = services.filter(
        (s) => s.active && !store.data.routes.find((r) => r.id === s.route_id)?.archived
      );
    if (!students.length || !active.length)
      throw new Error('Add a student and an active service first.');
    const scheduleId = id?.startsWith('schedule:') ? id.slice(9) : active[0].id,
      studentId = id?.startsWith('schedule:') ? students[0].id : id;
    const selected = active.find((s) => s.id === scheduleId) || active[0];
    ui.showModal(
      'Reserve this student’s service.',
      'A student may have separate morning and return subscriptions. Capacity and overlapping services are checked before saving.',
      `<form>${ui.selectField('Student', 'student_id', students.map((s) => option(s.id, s.name, studentId)).join(''))}${ui.selectField('Service', 'schedule_id', active.map((s) => option(s.id, s.name, selected.id)).join(''))}<div id="subscription-stops"></div><div class="field-row">${ui.inputField('From', 'start_date', { type: 'date', value: selected.start_date })}${ui.inputField('Until', 'end_date', { type: 'date', value: selected.end_date })}</div>${ui.formFooter('Reserve service')}</form>`,
      {
        onSubmit: async (f) =>
          submit(
            'subscribe_student',
            {
              student_id: f.get('student_id'),
              schedule_id: f.get('schedule_id'),
              pickup_stop_id: f.get('pickup_stop_id'),
              dropoff_stop_id: f.get('dropoff_stop_id'),
              start_date: f.get('start_date'),
              end_date: f.get('end_date'),
            },
            'Service reserved.'
          ),
      }
    );
    const update = () => {
      const select = document.querySelector('#modal-root [name=schedule_id]');
      if (!select) return;
      const s = active.find((s) => s.id === select.value) || active[0];
      if (!s) return;
      const stops = store.data.route_versions.find((v) => v.id === s.route_version_id)?.stops || [];
      const container = document.querySelector('#subscription-stops');
      if (container)
        container.innerHTML =
          stops.length >= 2
            ? ui.selectField(
                'Pickup stop',
                'pickup_stop_id',
                stops.map((stop) => option(stop.id, stop.stop_name, stops[0].id)).join('')
              ) +
              ui.selectField(
                'Drop-off stop',
                'dropoff_stop_id',
                stops.map((stop) => option(stop.id, stop.stop_name, stops.at(-1).id)).join('')
              )
            : '<p class="note">No stops defined for this service.</p>';
      const start = document.querySelector('#modal-root [name=start_date]'),
        end = document.querySelector('#modal-root [name=end_date]');
      if (start) start.value = s.start_date;
      if (end) end.value = s.end_date;
    };
    update();
    document.querySelector('#modal-root [name=schedule_id]')?.addEventListener('change', update);
  } else if (action === 'unsubscribe-service') {
    ui.showModal(
      'Remove this subscription?',
      'Prepared passenger manifests remain unchanged.',
      `<form>${ui.formFooter('Remove subscription')}</form>`,
      {
        onSubmit: () =>
          submit('unsubscribe_student', { subscription_id: id }, 'Subscription removed.'),
      }
    );
  } else if (action === 'archive-route') {
    ui.showModal(
      'Archive this route?',
      'Complete or cancel pending trips first. The route versions and trip history are retained; its services will become inactive.',
      `<form>${ui.formFooter('Archive route')}</form>`,
      { onSubmit: () => submit('archive_route', { route_id: id }, 'Route archived.') }
    );
  } else if (action === 'replace-trip-resources') {
    const trip = store.data.trips.find((t) => t.id === id);
    if (!trip) throw new Error('Refresh current trips before replacing resources.');
    const bus = store.data.buses.find((b) => b.id === trip.bus_id);
    if (!bus) throw new Error('Trip bus not found.');
    ui.showModal(
      trip.status === 'active' ? 'Record a trip handover.' : 'Replace this trip’s resources.',
      'The reason and resource changes are saved. Future trips keep their planned assignments.',
      `<form>${ui.selectField(
        'Replacement bus',
        'bus_id',
        store.data.buses
          .filter((b) => b.status !== 'maintenance')
          .map((b) => option(b.id, `${b.label} · ${b.capacity} seats`, trip.bus_id))
          .join('')
      )}${ui.selectField(
        'Replacement driver',
        'driver_id',
        store.data.users
          .filter((u) => u.role === 'driver')
          .map((u) => option(u.id, u.name, trip.driver_id))
          .join('')
      )}${ui.inputField('Replacement reason', 'reason')}${trip.status === 'active' ? `${ui.inputField('Outgoing vehicle odometer', 'mileage', { type: 'number', min: bus.current_mileage, max: 10000000, value: bus.current_mileage })}<label class="setting-row"><span>I reconciled the passengers and confirmed the transfer.</span><input type="checkbox" name="transfer_confirmed" required></label>` : ''}${ui.formFooter('Save replacement')}</form>`,
      {
        onSubmit: async (f) =>
          submit(
            'replace_trip_resources',
            {
              trip_id: id,
              bus_id: f.get('bus_id'),
              driver_id: f.get('driver_id'),
              reason: f.get('reason'),
              ...(trip.status === 'active'
                ? {
                    mileage: Number(f.get('mileage')),
                    transfer_confirmed: f.get('transfer_confirmed') === 'on',
                  }
                : {}),
            },
            'Trip resources updated.'
          ),
      }
    );
  }
  return true;
}
