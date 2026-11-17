// Trip rules shared by the local demo, views, and domain tests.
export const TRIP_ACTIONS = [
  'create_trip',
  'start_trip',
  'record_boarding',
  'record_alighting',
  'complete_trip',
  'cancel_trip',
];
export const schoolDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export function tripCounts(passengers) {
  return {
    assigned: passengers.length,
    boarded: passengers.filter((p) => p.status === 'boarded').length,
    alighted: passengers.filter((p) => p.status === 'alighted').length,
    expected: passengers.filter((p) => p.status === 'expected').length,
  };
}
export function validateCompletion(trip, passengers, mileage, cabinChecked) {
  if (trip.status !== 'active') throw new Error('This trip is not active.');
  if (!Number.isSafeInteger(mileage) || mileage < trip.start_mileage || mileage > 10000000)
    throw new Error(
      'Final mileage cannot be below the current odometer or outside its allowed range.'
    );
  if (passengers.some((p) => p.status === 'boarded'))
    throw new Error('Confirm drop-off for every student on board before completing this trip.');
  if (cabinChecked !== true)
    throw new Error('Confirm the final cabin check before completing this trip.');
}
export function createTripSnapshot(
  data,
  route,
  serviceDate,
  departureTime,
  id = () => crypto.randomUUID()
) {
  const planned = new Date(`${serviceDate}T${departureTime}+08:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(departureTime) ||
    !Number.isFinite(+planned) ||
    schoolDate(planned) !== serviceDate
  )
    throw new Error('Choose a valid service date and departure time.');
  const bus = data.buses.find((b) => b.id === route.bus_id),
    driver = data.users.find((u) => u.id === route.driver_id);
  if (!bus || !driver || bus.status === 'maintenance')
    throw new Error('Choose an available bus and driver.');
  const stops = data.route_stops
    .filter((s) => s.route_id === route.id)
    .sort((a, b) => a.stop_sequence - b.stop_sequence)
    .map((s) => ({ ...s }));
  if (stops.length < 2) throw new Error('A trip needs at least two stops.');
  const assignments = data.student_assignments.filter(
    (a) => a.route_id === route.id && a.status !== 'cancelled'
  );
  if (assignments.length > bus.capacity) throw new Error('This trip exceeds bus capacity.');
  const trip = {
    id: id(),
    route_id: route.id,
    route_name: route.route_name,
    bus_id: bus.id,
    bus_label: bus.label,
    plate_number: bus.plate_number,
    driver_id: driver.id,
    driver_name: driver.name,
    capacity: bus.capacity,
    service_date: serviceDate,
    planned_at: planned.toISOString(),
    status: 'scheduled',
    stops,
    start_mileage: null,
    final_mileage: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
  };
  const passengers = assignments.map((a) => {
    const u = data.users.find((u) => u.id === a.student_id);
    return {
      id: id(),
      trip_id: trip.id,
      student_id: a.student_id,
      student_name: u?.name || 'Student',
      student_code: u?.student_code || u?.id,
      pickup_stop_id: a.stop_id,
      pickup_name: stops.find((s) => s.id === a.stop_id)?.stop_name,
      dropoff_stop_id: stops.at(-1).id,
      dropoff_name: stops.at(-1).stop_name,
      status: 'expected',
      boarded_at: null,
      alighted_at: null,
    };
  });
  return { trip, passengers };
}

// Upgrade only the current demo state. Unknown legacy boarding times stay null.
export function upgradeDemoTrips(data) {
  if (data.trips) return data;
  Object.assign(data, {
    trips: [],
    trip_passengers: [],
    passenger_events: [],
    audit_events: [],
    trip_operations: [],
  });
  for (const route of data.routes.filter((r) => r.status === 'active')) {
    const { trip, passengers } = createTripSnapshot(
      data,
      route,
      schoolDate(),
      route.departure_time
    );
    Object.assign(trip, {
      status: 'active',
      start_mileage: data.buses.find((b) => b.id === route.bus_id).current_mileage,
      legacy_import: true,
    });
    for (const p of passengers)
      if (
        data.student_assignments.some(
          (a) => a.student_id === p.student_id && a.status === 'boarded'
        )
      )
        p.status = 'boarded';
    data.trips.push(trip);
    data.trip_passengers.push(...passengers);
  }
  return data;
}

export function applyDemoTripAction(data, actor, action, payload) {
  if (!TRIP_ACTIONS.includes(action)) throw new Error('Unknown trip action.');
  if (!payload.operation_id) throw new Error('An operation ID is required.');
  const request = JSON.stringify(payload, Object.keys(payload).sort());
  const previous = data.trip_operations.find((o) => o.id === payload.operation_id);
  if (previous) {
    if (
      previous.actor_id !== actor.id ||
      previous.action !== action ||
      previous.request !== request
    )
      throw new Error('Operation ID has already been used for another request.');
    return previous.result;
  }
  let trip = data.trips.find((t) => t.id === payload.trip_id);
  const admin = actor.role === 'admin';
  if (action === 'create_trip') {
    if (!admin) throw new Error('Only administrators can prepare trips.');
    const route = data.routes.find((r) => r.id === payload.route_id);
    if (!route) throw new Error('Route not found.');
    const snapshot = createTripSnapshot(data, route, payload.service_date, payload.departure_time);
    if (
      data.trips.some(
        (t) =>
          t.route_id === route.id &&
          t.planned_at === snapshot.trip.planned_at &&
          t.status !== 'cancelled'
      )
    )
      throw new Error('A trip is already prepared for this route and departure.');
    trip = snapshot.trip;
    data.trips.push(trip);
    data.trip_passengers.push(...snapshot.passengers);
  } else {
    if (!trip || (!admin && (actor.role !== 'driver' || trip.driver_id !== actor.id)))
      throw new Error('This trip is not assigned to you.');
    const bus = data.buses.find((b) => b.id === trip.bus_id),
      route = data.routes.find((r) => r.id === trip.route_id);
    const passengers = data.trip_passengers.filter((p) => p.trip_id === trip.id);
    if (action === 'start_trip') {
      if (trip.status !== 'scheduled') throw new Error('Only a scheduled trip can start.');
      if (trip.service_date !== schoolDate()) throw new Error('Only today’s trips can start.');
      if (!bus || bus.status === 'maintenance') throw new Error('This bus is in maintenance.');
      if (
        data.trips.some(
          (t) =>
            t.id !== trip.id &&
            t.status === 'active' &&
            (t.bus_id === trip.bus_id ||
              t.driver_id === trip.driver_id ||
              t.route_id === trip.route_id)
        )
      )
        throw new Error('This bus, driver, or route has an active trip.');
      if (passengers.length > bus.capacity) throw new Error('This trip exceeds bus capacity.');
      Object.assign(trip, {
        status: 'active',
        started_at: new Date().toISOString(),
        start_mileage: bus.current_mileage,
      });
      bus.status = 'active';
      if (route) route.status = 'active';
      data.student_assignments
        .filter((a) => a.route_id === trip.route_id && a.status !== 'cancelled')
        .forEach((a) => {
          a.status = 'assigned';
          a.boarded_at = null;
        });
    } else if (action === 'cancel_trip') {
      if (!admin || trip.status !== 'scheduled')
        throw new Error('Only administrators can cancel scheduled trips.');
      if (!payload.reason?.trim() || payload.reason.trim().length > 500)
        throw new Error('Enter a cancellation reason (up to 500 characters).');
      Object.assign(trip, { status: 'cancelled', cancellation_reason: payload.reason.trim() });
    } else if (action === 'complete_trip') {
      validateCompletion(trip, passengers, payload.mileage, payload.cabin_checked);
      if (payload.mileage < bus.current_mileage)
        throw new Error('The odometer cannot move backwards.');
      Object.assign(trip, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        final_mileage: payload.mileage,
        cabin_checked: true,
      });
      bus.status = 'idle';
      bus.current_mileage = payload.mileage;
      if (route) route.status = 'completed';
    } else {
      if (trip.status !== 'active')
        throw new Error('Start this trip before recording passenger movement.');
      const index = new Map(passengers.map((p) => [p.student_code, p]));
      const passenger = index.get(payload.student_code?.trim().toUpperCase());
      if (!passenger) throw new Error('This student is not assigned to this trip.');
      if (action === 'record_boarding' && passenger.status !== 'expected')
        throw new Error('This student has already boarded.');
      if (action === 'record_alighting' && passenger.status !== 'boarded')
        throw new Error('Only a student on board can be dropped off.');
      if (
        action === 'record_boarding' &&
        tripCounts(passengers).boarded >= Math.min(trip.capacity, bus.capacity)
      )
        throw new Error('This bus is full.');
      const stop = trip.stops.find((s) => s.id === payload.stop_id);
      const expectedStop =
        action === 'record_boarding' ? passenger.pickup_stop_id : passenger.dropoff_stop_id;
      if (!stop || stop.id !== expectedStop) throw new Error('Choose the student’s assigned stop.');
      const at = new Date().toISOString();
      passenger.status = action === 'record_boarding' ? 'boarded' : 'alighted';
      passenger[action === 'record_boarding' ? 'boarded_at' : 'alighted_at'] = at;
      data.passenger_events.push({
        id: crypto.randomUUID(),
        trip_id: trip.id,
        student_id: passenger.student_id,
        actor_id: actor.id,
        type: passenger.status,
        stop_id: stop.id,
        created_at: at,
        operation_id: payload.operation_id,
      });
      const assignment = data.student_assignments.find(
        (a) => a.student_id === passenger.student_id && a.route_id === trip.route_id
      );
      if (assignment) {
        assignment.status = passenger.status === 'boarded' ? 'boarded' : 'assigned';
        assignment.boarded_at = passenger.status === 'boarded' ? at : null;
      }
    }
  }
  const result = { ok: true, id: trip.id };
  data.audit_events.push({
    id: crypto.randomUUID(),
    actor_id: actor.id,
    action,
    trip_id: trip.id,
    operation_id: payload.operation_id,
    created_at: new Date().toISOString(),
    detail: { ...payload },
  });
  data.trip_operations.push({
    id: payload.operation_id,
    actor_id: actor.id,
    action,
    request,
    result,
  });
  return result;
}
