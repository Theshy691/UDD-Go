import { store } from './store.js';
import { schoolDate, tripCounts } from './trips.js';
import { escapeHtml as esc, csvCell } from './domain.js';

let from = schoolDate(new Date(Date.now() - 7 * 86400000)),
  to = schoolDate(new Date(Date.now() + 7 * 86400000));
let history = null,
  historyOwner = null;
const time = (value) =>
  value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded';
export const activeTrip = (routeId) =>
  store.data.trips.find((t) => t.route_id === routeId && t.status === 'active');
export function tripPage(ui) {
  const rows = historyOwner === store.profile.id && history ? history : store.visibleTrips();
  return `${ui.pageHeader('Every journey, recorded.', 'Prepare dated trips and keep passenger history for every school run.', store.profile.role === 'admin' ? ui.button('Prepare trip', 'prepare-trip', { primary: true, iconName: 'Plus' }) : '')}
    <section class="card"><div class="card-head"><h2>Trips & history</h2><span class="small muted">Times shown in Asia/Manila</span></div>
    <form id="trip-history-filter" class="table-toolbar"><label class="field">From<input type="date" name="from" value="${from}" required></label><label class="field">To<input type="date" name="to" value="${to}" required></label><button type="submit" class="button">Search history</button><button type="button" class="button" data-action="current-trips">Current trips</button></form>
    <p class="small muted" style="padding:0 24px">${historyOwner === store.profile.id && history ? 'Filtered history. Choose Current trips to return to upcoming journeys.' : 'Current trips and the surrounding seven days. Active journeys are always included.'}</p>
    <div class="table-wrap"><table><thead><tr><th>Departure</th><th>Route</th><th>Bus / driver</th><th>Status</th><th>Details</th></tr></thead><tbody>${rows.map((t) => `<tr><td>${esc(time(t.planned_at))}</td><td>${esc(t.route_name)}</td><td>${esc(t.bus_label)}<br><span class="small muted">${esc(t.driver_name)}</span></td><td>${ui.badge(t.status)}</td><td>${ui.button('View trip', 'trip-detail', { id: t.id })}</td></tr>`).join('') || '<tr><td colspan="5">No trips in this range. An administrator can prepare a trip from an existing route.</td></tr>'}</tbody></table></div></section>`;
}
export async function filterTripHistory(form) {
  const values = new FormData(form),
    nextFrom = values.get('from'),
    nextTo = values.get('to');
  if (!nextFrom || !nextTo || nextFrom > nextTo) throw new Error('Choose a valid date range.');
  const result = await store.tripHistory(nextFrom, nextTo);
  from = nextFrom;
  to = nextTo;
  history = result;
  historyOwner = store.profile.id;
}
export function resetTripHistory() {
  history = null;
  historyOwner = null;
}

export async function tripAction(action, id, ui) {
  if (action === 'current-trips') {
    resetTripHistory();
    await store.refresh();
    return true;
  }
  if (action === 'prepare-trip') {
    if (store.profile.role !== 'admin') throw new Error('Only administrators can prepare trips.');
    const routes = store.data.service_schedules.filter(
      (s) => s.active && !store.data.routes.find((r) => r.id === s.route_id)?.archived
    );
    if (!routes.length) throw new Error('Create an active service before preparing a trip.');
    const operation_id = crypto.randomUUID();
    ui.showModal(
      'Prepare a school run.',
      'This saves a dated copy of the route stops and current passenger assignments.',
      `<form>${ui.selectField('Service', 'schedule_id', routes.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join(''))}${ui.inputField('Service date', 'service_date', { type: 'date', value: schoolDate() })}<p class="note">Departure times follow the service schedule.</p><div class="note">The passenger list is fixed when prepared. Future assignment changes apply to the next trip.</div>${ui.formFooter('Prepare trip')}</form>`,
      {
        onSubmit: async (f) => {
          await store.action('create_trip', {
            schedule_id: f.get('schedule_id'),
            service_date: f.get('service_date'),
            operation_id,
          });
          resetTripHistory();
          ui.closeModal();
          ui.toast('Trip prepared.');
        },
      }
    );
    return true;
  }
  if (action !== 'trip-detail') return false;
  const trip =
    store.visibleTrips().find((t) => t.id === id) ||
    (historyOwner === store.profile.id ? history?.find((t) => t.id === id) : null);
  if (!trip) throw new Error('Refresh the trip list and try again.');
  const passengers = await store.tripManifest(id),
    resources = await store.tripResourceHistory(id),
    counts = tripCounts(passengers),
    isStudent = store.profile.role === 'student';
  const canDrive =
    store.profile.role === 'admin' ||
    (store.profile.role === 'driver' && trip.driver_id === store.profile.id);
  const operation_id = crypto.randomUUID();
  const movement = (p) =>
    trip.status === 'active' && canDrive
      ? p.status === 'expected'
        ? `<button class="button" type="button" data-trip-movement="record_boarding" data-student="${esc(p.student_code)}" data-stop="${esc(p.pickup_stop_id)}">Board</button>`
        : p.status === 'boarded'
          ? `<button class="button" type="button" data-trip-movement="record_alighting" data-student="${esc(p.student_code)}" data-stop="${esc(p.dropoff_stop_id)}">Confirm drop-off</button>`
          : ''
      : '';
  ui.showModal(
    esc(trip.route_name),
    `${esc(time(trip.planned_at))} · ${esc(trip.bus_label)} · ${esc(trip.driver_name)}`,
    `
    <div class="between">${ui.badge(trip.status)}<span>${isStudent ? 'Your passenger record' : `${counts.expected} expected · ${counts.boarded} on board · ${counts.alighted} dropped off`}</span></div>
    ${trip.legacy_import ? '<p class="note">Imported demo journey. Original boarding/start timestamps are unknown.</p>' : ''}
    ${store.profile.role === 'admin' && ['scheduled', 'active'].includes(trip.status) ? ui.button(trip.status === 'active' ? 'Record handover' : 'Replace bus / driver', 'replace-trip-resources', { id: trip.id }) : ''}
    ${trip.status === 'cancelled' ? `<p class="note">Cancellation: ${esc(trip.cancellation_reason)}</p>` : ''}
    <div class="stop-timeline">${trip.stops.map((s) => `<div class="stop-item"><span class="stop-dot"></span><div><strong>${esc(s.stop_name)}</strong><small>Stop ${s.stop_sequence}</small></div></div>`).join('')}</div>
    ${resources.length ? `<section class="note"><h3>Resource handovers</h3>${resources.map((e) => `<p>${esc(time(e.created_at))} · ${esc(e.reason)}<br>${esc(store.data.buses.find((b) => b.id === e.old_bus_id)?.label || e.old_bus_id)} → ${esc(store.data.buses.find((b) => b.id === e.new_bus_id)?.label || e.new_bus_id)}<br>Outgoing odometer: ${esc(e.old_start_mileage ?? 'Not started')} → ${esc(e.old_final_mileage ?? 'Not recorded')} km · incoming: ${esc(e.new_start_mileage ?? 'Not started')} km</p>`).join('')}</section>` : ''}
    <div class="trip-passenger-list">${passengers.map((p) => `<article class="trip-passenger"><div><strong>${esc(p.student_name)}</strong><p class="small muted">${esc(p.student_code)}</p><p class="small">${esc(p.pickup_name)} → ${esc(p.dropoff_name)}</p></div><div>${ui.badge(p.status)}<p class="small muted">Boarded: ${esc(time(p.boarded_at))}</p><p class="small muted">Dropped off: ${esc(time(p.alighted_at))}</p>${movement(p)}</div></article>`).join('') || '<p class="note">No passengers reserved.</p>'}</div>
    ${
      trip.status === 'active' && canDrive
        ? `<form id="trip-complete-form">${ui.inputField('Final odometer (km)', 'mileage', { type: 'number', min: trip.segment_start_mileage ?? trip.start_mileage ?? 0, max: 10000000, value: trip.segment_start_mileage ?? trip.start_mileage ?? 0 })}<label class="setting-row"><span>I checked the cabin and confirmed no passengers remain.</span><input type="checkbox" name="cabin_checked" required></label>${ui.formFooter('Complete trip')}</form>`
        : trip.status === 'scheduled' && canDrive
          ? `<form id="trip-start-form"><div class="note">Confirm the bus and passenger list before starting. Only today’s trips can start.</div>${ui.formFooter('Start trip')}</form>`
          : `<div class="modal-footer">${ui.button('Close', 'close-modal')}</div>`
    }
    ${trip.status === 'scheduled' && store.profile.role === 'admin' ? '<form id="trip-cancel-form"><label class="field">Cancellation reason<input name="reason" required maxlength="500"></label><div class="form-error" role="alert"></div><button type="submit" class="button danger">Cancel trip</button></form>' : ''}
    <div class="form-error" id="trip-action-error" role="alert"></div><button type="button" class="button" id="export-trip">Export passenger record</button>`,
    {
      wide: true,
      onSubmit: async (f) => {
        if (trip.status === 'scheduled')
          await store.action('start_trip', { trip_id: id, operation_id });
        else
          await store.action('complete_trip', {
            trip_id: id,
            mileage: Number(f.get('mileage')),
            cabin_checked: f.get('cabin_checked') === 'on',
            operation_id,
          });
        resetTripHistory();
        ui.closeModal();
        ui.toast(
          trip.status === 'scheduled'
            ? 'Trip started. Enable GPS in My route.'
            : 'Trip completed and saved.'
        );
      },
    }
  );
  // Add a standard error target for the existing modal submission handler.
  const primary = document.querySelector('#trip-start-form,#trip-complete-form');
  if (primary && !primary.querySelector('.form-error'))
    primary.insertAdjacentHTML('beforeend', '<div class="form-error" role="alert"></div>');
  const cancelOperation = crypto.randomUUID();
  document.querySelector('#trip-cancel-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      submit = form.querySelector('button');
    submit.disabled = true;
    try {
      await store.action('cancel_trip', {
        trip_id: id,
        reason: new FormData(form).get('reason'),
        operation_id: cancelOperation,
      });
      resetTripHistory();
      ui.closeModal();
      ui.toast('Trip cancelled.');
    } catch (error) {
      form.querySelector('.form-error').textContent = error.message;
      submit.disabled = false;
    }
  });
  document.querySelectorAll('[data-trip-movement]').forEach((button) => {
    const movementOperation = crypto.randomUUID();
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await store.action(button.dataset.tripMovement, {
          trip_id: id,
          student_code: button.dataset.student,
          stop_id: button.dataset.stop,
          operation_id: movementOperation,
        });
        await tripAction('trip-detail', id, ui);
      } catch (error) {
        document.querySelector('#trip-action-error').textContent = error.message;
        button.disabled = false;
      }
    });
  });
  document.querySelector('#export-trip').addEventListener('click', () => {
    const rows = [
      [
        'Service date',
        'Route',
        'Bus',
        'Driver',
        'Student ID',
        'Student',
        'Pickup',
        'Drop-off',
        'Status',
        'Boarded at (UTC)',
        'Alighted at (UTC)',
      ],
      ...passengers.map((p) => [
        trip.service_date,
        trip.route_name,
        trip.bus_label,
        trip.driver_name,
        p.student_code,
        p.student_name,
        p.pickup_name,
        p.dropoff_name,
        p.status,
        p.boarded_at,
        p.alighted_at,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `udd-trip-${trip.service_date}-${trip.id}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return true;
}
