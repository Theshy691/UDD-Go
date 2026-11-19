export const reportReasons = {
  missed_pickup: 'Bus didn’t stop',
  wrong_pickup: 'Pickup info is wrong',
  missing_boarding: 'Boarding wasn’t recorded',
  other: 'Something else',
};

export const reportStatuses = { submitted: 'Sent', received: 'Received', resolved: 'Resolved' };
export const REPORT_ACTIONS = ['submit_trip_report', 'update_trip_report'];

export function applyDemoReportAction(data, actor, action, payload) {
  if (action === 'update_trip_report') {
    if (actor.role !== 'admin') throw new Error('Only fleet admins can update reports.');
    if (!['received', 'resolved'].includes(payload.status))
      throw new Error('Choose Received or Resolved.');
    const report = data.trip_reports.find((item) => item.id === payload.report_id);
    if (!report) throw new Error('This report is unavailable.');
    if (report.status !== 'resolved') report.status = payload.status;
    return { id: report.id };
  }

  if (actor.role !== 'student') throw new Error('Only students can report a trip issue.');
  const trip = data.trips.find((item) => item.id === payload.trip_id);
  const passenger = data.trip_passengers.find(
    (p) => p.trip_id === trip?.id && p.student_id === actor.id
  );
  if (!passenger) throw new Error('Only your assigned trips can be reported.');
  const { reason, operation_id: id } = payload;
  const note = (payload.note || '').trim();
  if (!Object.hasOwn(reportReasons, reason)) throw new Error('Choose a report reason.');
  if (Array.from(note).length > 500) throw new Error('Keep your note to 500 characters.');
  const existing = data.trip_reports.find(
    (report) =>
      report.id === id ||
      (report.trip_id === trip.id && report.student_id === actor.id && report.reason === reason)
  );
  if (existing) {
    if (
      existing.id === id &&
      existing.trip_id === trip.id &&
      existing.student_id === actor.id &&
      existing.reason === reason &&
      existing.note === note
    )
      return { id };
    throw new Error('You already reported this issue for this trip.');
  }
  data.trip_reports.unshift({
    id,
    trip_id: trip.id,
    student_id: actor.id,
    student_name: passenger.student_name,
    route_name: trip.route_name,
    bus_label: trip.bus_label,
    pickup_name: passenger.pickup_name,
    service_date: trip.service_date,
    reason,
    note,
    status: 'submitted',
    created_at: new Date().toISOString(),
  });
  return { id };
}
