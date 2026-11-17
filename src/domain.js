export function capacityFor(bus, routeId, assignments) {
  const assigned = assignments.filter((a) => a.route_id === routeId && a.status !== 'cancelled');
  return {
    assigned: assigned.length,
    boarded: assigned.filter((a) => a.status === 'boarded').length,
    available: Math.max(0, bus.capacity - assigned.length),
    capacity: bus.capacity,
  };
}

export function buildBoardingIndex(assignments, routeId) {
  return new Map(
    assignments
      .filter((a) => a.route_id === routeId && a.status !== 'cancelled')
      .map((a) => [a.student_id.toUpperCase(), a])
  );
}

export function validateBoarding(index, studentId, bus, onboard) {
  const assignment = index.get(studentId.trim().toUpperCase());
  if (!assignment) throw new Error('This student is not assigned to your route.');
  if (assignment.status === 'boarded') throw new Error('This student has already boarded.');
  if (onboard >= bus.capacity) throw new Error('This bus is full. Boarding is not allowed.');
  return assignment;
}

export function buildRouteGraph(stops) {
  const ordered = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  return new Map(
    ordered.map((stop, i) => [
      stop.id,
      { ...stop, neighbors: ordered[i + 1] ? [ordered[i + 1].id] : [] },
    ])
  );
}

export function maintenanceStatus(bus) {
  const remaining = bus.next_service_mileage - bus.current_mileage;
  return {
    remaining,
    status: remaining <= 0 ? 'overdue' : remaining <= 500 ? 'due_soon' : 'healthy',
  };
}

export function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function validCoordinates(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}
