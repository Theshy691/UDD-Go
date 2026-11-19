import { escapeHtml as esc } from './domain.js';
import { tripTime } from './portal-views.js';
import { schoolDate } from './trips.js';

export function dispatchBoard(trips, buses, users, { badge, paginate }) {
  const now = new Date();
  const today = schoolDate(now);
  const busesById = new Map(buses.map((bus) => [bus.id, bus]));
  const driverIds = new Set(users.filter((user) => user.role === 'driver').map((user) => user.id));
  const priorities = { active: 1, scheduled: 2, completed: 3, cancelled: 4 };
  const rows = trips
    .filter((trip) => trip.service_date === today)
    .map((trip) => {
      const departure = new Date(trip.planned_at);
      const bus = busesById.get(trip.bus_id);
      let issue = '';
      if (trip.status === 'scheduled') {
        if (!bus) issue = 'Bus unavailable';
        else if (bus.status === 'maintenance') issue = 'Bus in maintenance';
        else if (!driverIds.has(trip.driver_id)) issue = 'Driver unavailable';
        else if (departure < now) issue = 'Departure overdue';
      }
      return { trip, issue, departure };
    })
    .sort(
      (a, b) =>
        (a.issue ? 0 : priorities[a.trip.status]) - (b.issue ? 0 : priorities[b.trip.status]) ||
        a.departure - b.departure
    );

  const list = (items) => `<ul class="dispatch-list" role="list">
    ${items
      .map(
        ({ trip, issue }) => `<li>
      <button type="button" class="dispatch-trip" data-action="trip-detail" data-id="${esc(trip.id)}">
        <time datetime="${esc(trip.planned_at)}">${esc(tripTime(trip.planned_at))}</time>
        <span class="dispatch-trip-info">
          <strong>${esc(trip.route_name)}</strong>
          <span>${esc(trip.driver_name || 'Driver unavailable')} · ${esc(trip.bus_label || 'Bus unavailable')}</span>
          <span class="dispatch-trip-status">${badge(trip.status)}${issue ? `<span class="dispatch-issue">${issue}</span>` : ''}</span>
        </span>
      </button>
    </li>`
      )
      .join('')}
  </ul>`;

  return `<section class="card dispatch-board" aria-labelledby="dispatch-title">
    <div class="card-head"><h2 id="dispatch-title">Today’s trips <span class="count">${rows.length}</span></h2><span class="small muted">PHT</span></div>
    ${rows.length ? paginate('overview-today', rows, list, { label: 'Today’s trips', size: 5 }) : '<p class="dispatch-empty">No trips prepared for today. Prepare a trip from an active service.</p>'}
  </section>`;
}
