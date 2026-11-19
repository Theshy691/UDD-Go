export const CAMPUS = [16.0436, 120.3417];
export const SECOND_DEMO_ADMIN = { id: 'admin-2', name: 'Mariel Reyes', role: 'admin' };
export const DEMO_PASSWORD = 'demo-password';
export const DEMO_ACCOUNT_EMAILS = {
  'admin-1': 'admin@udd.edu.ph',
  'admin-2': 'admin-2@example.test',
  'driver-1': 'driver@udd.edu.ph',
  'driver-2': 'driver-2@example.test',
  'driver-3': 'driver-3@example.test',
  'UDD-0001': 'student@udd.edu.ph',
  'UDD-0007': 'student-7@example.test',
  'UDD-0013': 'student-13@example.test',
};

export function makeSeed() {
  const users = [
    { id: 'admin-1', name: 'Alex Morgan', role: 'admin', contact_number: '0917 555 0100' },
    { ...SECOND_DEMO_ADMIN },
    ...['Roberto Santos', 'Miguel Dela Cruz', 'Antonio Reyes', 'Jose Garcia', 'Eduardo Ramos'].map(
      (name, i) => ({
        id: `driver-${i + 1}`,
        name,
        role: 'driver',
        contact_number: `0917 555 010${i + 1}`,
      })
    ),
    ...[
      'Isabella Santos',
      'Gabriel Reyes',
      'Sofia Mendoza',
      'Liam Cruz',
      'Olivia Garcia',
      'Noah Torres',
      'Emma Ramos',
      'Lucas Flores',
      'Mia Aquino',
      'Ethan Lim',
      'Amelia Tan',
      'Elijah Diaz',
      'Charlotte Lee',
      'James Rivera',
      'Harper Gonzales',
      'Benjamin Co',
      'Evelyn Bautista',
      'Henry Villanueva',
      'Abigail Castillo',
      'Alexander Sy',
      'Ella Fernandez',
      'Daniel Navarro',
      'Scarlett Chua',
      'Matthew Valdez',
    ].map((name, i) => ({
      id: `UDD-${String(i + 1).padStart(4, '0')}`,
      name,
      role: 'student',
      contact_number: `0918 555 ${String(i + 1).padStart(4, '0')}`,
    })),
  ];
  const buses = [
    {
      id: 'bus-1',
      label: 'Bus 01',
      plate_number: 'NCA 2841',
      capacity: 30,
      current_mileage: 24320,
      next_service_mileage: 25000,
      status: 'active',
      current_lat: 16.0534,
      current_lng: 120.3438,
    },
    {
      id: 'bus-2',
      label: 'Bus 02',
      plate_number: 'NCA 3916',
      capacity: 24,
      current_mileage: 19680,
      next_service_mileage: 20000,
      status: 'active',
      current_lat: 16.0329,
      current_lng: 120.345,
    },
    {
      id: 'bus-3',
      label: 'Bus 03',
      plate_number: 'NDB 1728',
      capacity: 30,
      current_mileage: 32150,
      next_service_mileage: 35000,
      status: 'active',
      current_lat: 16.0421,
      current_lng: 120.3212,
    },
    {
      id: 'bus-4',
      label: 'Bus 04',
      plate_number: 'NDB 4602',
      capacity: 24,
      current_mileage: 15300,
      next_service_mileage: 20000,
      status: 'idle',
      current_lat: CAMPUS[0],
      current_lng: CAMPUS[1],
    },
    {
      id: 'bus-5',
      label: 'Bus 05',
      plate_number: 'NCE 5183',
      capacity: 30,
      current_mileage: 40320,
      next_service_mileage: 40000,
      status: 'maintenance',
      current_lat: CAMPUS[0],
      current_lng: CAMPUS[1],
    },
    {
      id: 'bus-6',
      label: 'Bus 06',
      plate_number: 'NCE 6209',
      capacity: 24,
      current_mileage: 8400,
      next_service_mileage: 10000,
      status: 'idle',
      current_lat: CAMPUS[0],
      current_lng: CAMPUS[1],
    },
  ];
  const routes = [
    {
      id: 'route-1',
      route_name: 'Bonuan morning loop',
      area: 'Bonuan',
      driver_id: 'driver-1',
      bus_id: 'bus-1',
      color: '#2ba9e0',
      departure_time: '06:30',
      status: 'active',
    },
    {
      id: 'route-2',
      route_name: 'Calasiao express',
      area: 'Calasiao',
      driver_id: 'driver-2',
      bus_id: 'bus-2',
      color: '#8b80cb',
      departure_time: '06:15',
      status: 'active',
    },
    {
      id: 'route-3',
      route_name: 'Lucao campus link',
      area: 'Lucao',
      driver_id: 'driver-3',
      bus_id: 'bus-3',
      color: '#4fa98d',
      departure_time: '06:45',
      status: 'active',
    },
    {
      id: 'route-4',
      route_name: 'Downtown afternoon',
      area: 'Downtown',
      driver_id: 'driver-4',
      bus_id: 'bus-4',
      color: '#daaa52',
      departure_time: '15:30',
      status: 'scheduled',
    },
  ];
  const coordinates = [
    [
      [16.0839, 120.3557, 'Bonuan Tondaligan'],
      [16.0711, 120.3503, 'Bonuan Gueset'],
      [16.0581, 120.3464, 'AB Fernandez East'],
      [16.0534, 120.3438, 'Arellano Street'],
      [...CAMPUS, 'UDD main campus'],
    ],
    [
      [16.0103, 120.3611, 'Calasiao town center'],
      [16.0207, 120.3526, 'Nalsian junction'],
      [16.0329, 120.345, 'Mayombo district'],
      [16.0389, 120.3436, 'Perez Boulevard'],
      [...CAMPUS, 'UDD main campus'],
    ],
    [
      [16.0357, 120.3039, 'Lucao district'],
      [16.0379, 120.3122, 'De Venecia Highway'],
      [16.0421, 120.3212, 'Tapuac junction'],
      [16.0438, 120.3316, 'Downtown Dagupan'],
      [...CAMPUS, 'UDD main campus'],
    ],
    [
      [...CAMPUS, 'UDD main campus'],
      [16.0438, 120.3316, 'Downtown Dagupan'],
      [16.0407, 120.3357, 'City plaza'],
      [16.0347, 120.3398, 'Perez Boulevard'],
    ],
  ];
  const route_stops = coordinates.flatMap((stops, r) =>
    stops.map(([latitude, longitude, stop_name], i) => ({
      id: `stop-${r + 1}-${i + 1}`,
      route_id: `route-${r + 1}`,
      stop_name,
      latitude,
      longitude,
      stop_sequence: i + 1,
    }))
  );
  const student_assignments = users
    .filter((u) => u.role === 'student')
    .map((u, i) => ({
      id: `assignment-${i + 1}`,
      student_id: u.id,
      route_id: `route-${Math.floor(i / 6) + 1}`,
      stop_id: `stop-${Math.floor(i / 6) + 1}-${(i % 3) + 1}`,
      status: i % 6 < 4 && i < 18 ? 'boarded' : 'assigned',
    }));
  const now = Date.now();
  const activity = [
    {
      id: 'event-1',
      type: 'boarding',
      message: 'Isabella Santos boarded Bus 01',
      detail: 'Bonuan morning loop',
      created_at: new Date(now - 2 * 60000).toISOString(),
    },
    {
      id: 'event-2',
      type: 'route',
      message: 'Bus 03 started its route',
      detail: 'Antonio Reyes · Lucao campus link',
      created_at: new Date(now - 7 * 60000).toISOString(),
    },
    {
      id: 'event-3',
      type: 'maintenance',
      message: 'Bus 05 is due for maintenance',
      detail: '320 km past its service interval',
      created_at: new Date(now - 18 * 60000).toISOString(),
    },
    {
      id: 'event-4',
      type: 'route',
      message: 'Bus 02 started its route',
      detail: 'Miguel Dela Cruz · Calasiao express',
      created_at: new Date(now - 31 * 60000).toISOString(),
    },
  ];
  return { version: 1, users, buses, routes, route_stops, student_assignments, activity };
}
