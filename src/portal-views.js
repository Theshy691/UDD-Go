import { escapeHtml as esc } from './domain.js';

const tripClock = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila',
});

export function tripTime(value) {
  const timestamp = new Date(value ?? NaN);
  return Number.isFinite(timestamp.getTime()) ? tripClock.format(timestamp) : 'Time unavailable';
}

export function driverTripSummary(
  trip,
  passengers,
  counts,
  { button, badge, demo, sharing, traffic }
) {
  const stops = trip.stops ?? [];
  const finalStop = stops.at(-1);
  const pendingStops = new Set();
  const recordedStops = new Set();
  for (const passenger of passengers) {
    if (passenger.status === 'expected') pendingStops.add(passenger.pickup_stop_id);
    if (passenger.status === 'boarded') {
      recordedStops.add(passenger.pickup_stop_id);
      pendingStops.add(passenger.dropoff_stop_id);
    }
    if (passenger.status === 'alighted') recordedStops.add(passenger.dropoff_stop_id);
  }
  // A boarding or drop-off confirms progress in the saved stop order.
  const lastRecorded = stops.findLastIndex((stop) => recordedStops.has(stop.id));
  const nextStop = stops.find((stop, i) => i >= lastRecorded && pendingStops.has(stop.id));
  const scheduled = trip.status === 'scheduled';
  const active = trip.status === 'active';
  const cabinCheck = active && counts.boarded === 0 && finalStop && recordedStops.has(finalStop.id);
  const stop = scheduled ? stops[0] : active ? nextStop : null;
  const actionLabel = scheduled
    ? 'Review and start trip'
    : cabinCheck
      ? 'Complete cabin check'
      : active
        ? 'View passengers'
        : 'View trip record';
  const stopLabel = scheduled ? 'First stop' : stop ? 'Next passenger stop' : 'Route destination';
  const stopName = stop?.stop_name ?? finalStop?.stop_name ?? 'Stop details unavailable';

  return `<section class="card journey-summary" aria-labelledby="journey-route-title">
    <div class="journey-summary-head">
      <div><h2 id="journey-route-title">${esc(trip.route_name)}</h2><p>${trip.direction === 'return' ? 'Return' : 'Outbound'} · Scheduled ${esc(tripTime(trip.planned_at))} PHT</p></div>
      ${badge(trip.status)}
    </div>
    <dl class="journey-facts">
      <div><dt>${stopLabel}</dt><dd>${esc(stopName)}</dd></div>
      <div><dt>Assigned bus</dt><dd>${esc(trip.bus_label)}</dd></div>
      <div><dt>On board</dt><dd>${counts.boarded} / ${trip.capacity}</dd></div>
    </dl>
    <div class="journey-actions">
      ${button(actionLabel, cabinCheck ? 'trip-cabin-check' : 'trip-detail', { id: trip.id, primary: true })}
      ${active && !sharing ? button('Enable GPS sharing', 'enable-gps', { id: trip.id, iconName: 'LocateFixed' }) : ''}
      ${active ? `<p id="gps-status" data-trip-id="${esc(trip.id)}" role="status">${sharing ? 'Sharing GPS' : demo ? 'Simulated bus location' : 'GPS sharing is off'}</p>` : ''}
    </div>
    ${traffic}
  </section>`;
}

export function studentTripSummary(trip, passenger, { button, badge, icon, boardingId, phone }) {
  let status = 'Passenger record unavailable';
  if (passenger?.status === 'alighted') status = 'Dropped off';
  if (passenger?.status === 'boarded') status = 'On board';
  if (passenger?.status === 'expected') {
    status =
      {
        scheduled: 'Seat reserved',
        active: 'Waiting to board',
        completed: 'Boarding not recorded',
      }[trip.status] ?? status;
  }

  return `<section class="card journey-summary" aria-labelledby="journey-route-title">
    <div class="journey-summary-head">
      <div><h2 id="journey-route-title">${esc(trip.route_name)}</h2><p>${trip.direction === 'return' ? 'Return' : 'Outbound'} · Scheduled departure <time datetime="${esc(trip.planned_at)}">${esc(tripTime(trip.planned_at))} PHT</time></p></div>
      ${badge(trip.status)}
    </div>
    <dl class="journey-facts">
      <div><dt>Pickup stop</dt><dd>${esc(passenger?.pickup_name || 'Unavailable')}</dd></div>
      <div><dt>Assigned bus</dt><dd>${esc(trip.bus_label)}</dd></div>
      <div><dt>Boarding ID</dt><dd>${esc(passenger?.student_code || boardingId || 'Unavailable')}</dd></div>
    </dl>
    ${
      trip.status === 'cancelled'
        ? `<p class="journey-note"><strong>Trip cancelled.</strong>${trip.cancellation_reason ? ` ${esc(trip.cancellation_reason)}` : ''}</p>`
        : `<p class="journey-note"><strong>${status}</strong>${passenger?.dropoff_name ? ` · Drop-off at ${esc(passenger.dropoff_name)}` : ''}</p>`
    }
    <div class="journey-actions">
      ${button('View my trip record', 'trip-detail', { id: trip.id, iconName: 'CalendarDays' })}
      ${phone ? `<a href="tel:${esc(phone.replace(/[^+\d]/g, ''))}" class="button">${icon('Phone')} Call driver</a>` : ''}
    </div>
  </section>`;
}
