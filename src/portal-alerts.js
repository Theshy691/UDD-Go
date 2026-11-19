import { maintenanceStatus } from './domain.js';
import { tripTime } from './portal-views.js';
import { schoolDate } from './trips.js';

export function portalAlerts(profile, trips, { buses, trip_passengers: passengers }) {
  if (profile.role === 'admin') {
    return buses
      .map((bus) => ({ bus, ...maintenanceStatus(bus) }))
      .filter(({ status }) => status !== 'healthy')
      .sort((a, b) => a.remaining - b.remaining)
      .map(({ bus, status }) => ({
        title: bus.label,
        detail: status === 'overdue' ? 'Overdue for service' : 'Due for service soon',
        action: 'bus-detail',
        id: bus.id,
      }));
  }

  const today = schoolDate();
  const ownPassengers = new Map(
    passengers.filter((p) => p.student_id === profile.id).map((p) => [p.trip_id, p])
  );
  return trips
    .filter((trip) => trip.status === 'active' || trip.service_date === today)
    .sort((a, b) => b.planned_at.localeCompare(a.planned_at))
    .map((trip) => {
      const passenger = ownPassengers.get(trip.id);
      const status = {
        scheduled: 'Trip scheduled',
        active: 'Trip started',
        completed: 'Trip completed',
        cancelled: 'Trip cancelled',
      }[trip.status];
      const detail =
        trip.status === 'cancelled' ? status :
        passenger?.status === 'alighted' ? 'Drop-off recorded' :
        passenger?.status === 'boarded' ? 'Boarding recorded' : status;
      return {
        key: JSON.stringify([trip.id, trip.status, trip.location_epoch, passenger?.status]),
        title: trip.route_name,
        detail: `${detail} · ${tripTime(trip.planned_at)} PHT · ${trip.bus_label}`,
        action: 'trip-detail',
        id: trip.id,
      };
    });
}
