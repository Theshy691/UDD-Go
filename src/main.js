import './styles.css';
import { mountLanding } from './landing.js';
import { mountLogin } from './login.js';
import {
  createIcons,
  LayoutDashboard,
  BusFront,
  Route,
  GraduationCap,
  Users,
  Wrench,
  Settings,
  CircleHelp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Download,
  Search,
  Bell,
  CalendarDays,
  MapPin,
  Navigation,
  LocateFixed,
  Menu,
  X,
  LogOut,
  Radio,
  CircleCheck,
  CircleAlert,
  Check,
  Clock3,
  ShieldCheck,
  Leaf,
  School,
  MoreHorizontal,
  Play,
  Pause,
  Square,
  UserRoundCheck,
  Trash2,
  ExternalLink,
  Mail,
  RefreshCw,
  Phone,
  Info,
  Gauge,
  Maximize2,
  Minimize2,
  Activity,
  CheckCheck,
} from 'lucide';
import { store, preferences, savePreferences } from './store.js';
import { tripPage, tripAction, filterTripHistory, resetTripHistory } from './trip-views.js';
import { schedulingPage, schedulingAction } from './scheduling-views.js';
import { tripCounts, schoolDate } from './trips.js';
import { capacityFor, maintenanceStatus, escapeHtml as esc, csvCell } from './domain.js';
import { FleetMap, createStopEditor, configureMap } from './map.js';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

document.documentElement.classList.toggle('native-app', Capacitor.isNativePlatform());

const iconSet = {
  LayoutDashboard,
  BusFront,
  Route,
  GraduationCap,
  Users,
  Wrench,
  Settings,
  CircleHelp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Download,
  Search,
  Bell,
  CalendarDays,
  MapPin,
  Navigation,
  LocateFixed,
  Menu,
  X,
  LogOut,
  Radio,
  CircleCheck,
  CircleAlert,
  Check,
  Clock3,
  ShieldCheck,
  Leaf,
  School,
  MoreHorizontal,
  Play,
  Pause,
  Square,
  UserRoundCheck,
  Trash2,
  ExternalLink,
  Mail,
  RefreshCw,
  Phone,
  Info,
  Gauge,
  Maximize2,
  Minimize2,
  Activity,
  CheckCheck,
};
const icon = (name) =>
  `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}"></i>`;
const mountIcons = () =>
  createIcons({ icons: iconSet, attrs: { 'aria-hidden': 'true', 'stroke-width': 1.75 } });
const app = document.querySelector('#app');
let page = 'overview',
  selectedBus = 'bus-1',
  routeFilter = '',
  busFilter = 'all',
  query = '';
let fleetMap = null,
  modalMap = null,
  modalCleanup = null,
  modalReturnFocus = null,
  toastTimer,
  gpsWatch = null,
  gpsNative = false,
  gpsRouteId = null,
  simulatedStep = 0;
let routeDraft = [],
  portalTripId = '',
  loginRole = 'admin',
  loginMethod = 'quick',
  portalExpanded = false,
  publicView = 'landing';
let destroyLanding = null;
const titles = {
  overview: 'Overview',
  trips: 'Trips & history',
  services: 'Services & calendar',
  fleet: 'Fleet management',
  routes: 'Routes & stops',
  students: 'Students',
  drivers: 'Drivers',
  maintenance: 'Maintenance',
  activity: 'Activity log',
  settings: 'Settings',
  driver: 'My route',
  student: 'My journey',
};
const statusNames = {
  active: 'On route',
  idle: 'Available',
  maintenance: 'Maintenance',
  scheduled: 'Scheduled',
  completed: 'Completed',
  boarded: 'On board',
  assigned: 'Assigned',
  overdue: 'Overdue',
  due_soon: 'Due soon',
  healthy: 'Up to date',
  expected: 'Expected',
  alighted: 'Dropped off',
  cancelled: 'Cancelled',
};
const badge = (status) =>
  `<span class="badge ${esc(status)}">${esc(statusNames[status] || status)}</span>`;
const initials = (name) =>
  name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('') || '?';
const person = (id) => store.data.users.find((u) => u.id === id);
const routeByBus = (id) => {
  const trip = store.data.trips.find((t) => t.bus_id === id && t.status === 'active');
  return trip
    ? { ...store.data.routes.find((r) => r.id === trip.route_id), ...trip, id: trip.route_id }
    : store.data.routes.find((r) => r.bus_id === id && !r.archived);
};
const stopsFor = (id) =>
  store.data.route_stops
    .filter((s) => s.route_id === id)
    .sort((a, b) => a.stop_sequence - b.stop_sequence);
const formatNumber = (n) => Number(n || 0).toLocaleString('en-PH');
const routeCapacity = (bus, routeId, assignments = store.data.student_assignments) => {
  if (!bus) return { assigned: 0, boarded: 0, available: 0, capacity: 0 };
  const trip = store.data.trips.find(
    (t) => t.route_id === routeId && t.bus_id === bus.id && t.status === 'active'
  );
  const summary = trip ? store.routeSummaries.get(trip.id) : null;
  if (summary)
    return {
      capacity: bus.capacity,
      available: Math.max(0, bus.capacity - (summary.boarded || 0)),
      ...summary,
    };
  return trip
    ? {
        ...tripCounts(store.data.trip_passengers.filter((p) => p.trip_id === trip.id)),
        capacity: bus.capacity,
        available: Math.max(
          0,
          bus.capacity - store.data.trip_passengers.filter((p) => p.trip_id === trip.id).length
        ),
      }
    : capacityFor(bus, routeId, assignments);
};
const date = () =>
  new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date());
const timeAgo = (value) => {
  const mins = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60000);
  return mins < 1
    ? 'Just now'
    : mins < 60
      ? `${mins} min ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)} hr ago`
        : `${Math.floor(mins / 1440)} days ago`;
};
const departure = (value) => {
  const [h, m] = (value || '06:30').split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const button = (label, action, { primary = false, id = '', iconName = '', className = '' } = {}) =>
  `<button class="button ${primary ? 'primary' : ''} ${className}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${iconName ? icon(iconName) : ''}${label}</button>`;
const empty = (name, text, iconName = 'BusFront') =>
  `<div class="empty">${icon(iconName)}<h3>${name}</h3><p>${text}</p></div>`;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  document.querySelector('#toast-root').innerHTML =
    `<div class="toast ${error ? 'error' : ''}">${icon(error ? 'CircleAlert' : 'CircleCheck')}<span>${esc(message)}</span></div>`;
  mountIcons();
  toastTimer = setTimeout(() => document.querySelector('#toast-root').replaceChildren(), 5000);
}

function navItem(key, name, iconName, count = '') {
  return `<button class="nav-link ${page === key ? 'selected' : ''}" data-page="${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${name}</span>${count ? `<span class="nav-badge">${count}</span>` : ''}</button>`;
}

function shell(content) {
  const admin = store.profile.role === 'admin';
  const due = store.data.buses.filter((b) => maintenanceStatus(b).status !== 'healthy').length;
  return `<div class="sidebar-overlay" data-action="close-menu"></div><aside class="sidebar" aria-label="Main navigation">
    <a class="brand" href="#" data-page="${admin ? 'overview' : store.profile.role}" aria-label="UDD Go home"><span class="brand-icon">${icon('BusFront')}</span><div>UDD<span> Go</span></div></a>
    <div class="campus-switch"><span class="campus-icon">${icon('School')}</span><div><strong>Universidad de Dagupan</strong><small>Main campus · Dagupan City</small></div>${icon('ChevronDown')}</div>
    <div class="nav-label">Workspace</div><nav class="nav-list">${admin ? `${navItem('overview', 'Overview', 'LayoutDashboard')}${navItem('fleet', 'Fleet management', 'BusFront')}${navItem('routes', 'Routes & stops', 'Route')}${navItem('services', 'Services & calendar', 'CalendarDays')}${navItem('students', 'Students', 'GraduationCap')}${navItem('drivers', 'Drivers', 'Users')}${navItem('maintenance', 'Maintenance', 'Wrench', due)}` : navItem(store.profile.role, store.profile.role === 'driver' ? 'My route' : 'My journey', store.profile.role === 'driver' ? 'Route' : 'MapPin')}
    </nav><div class="nav-separator"></div><div class="nav-label">Manage</div><nav class="nav-list">${admin ? navItem('activity', 'Activity log', 'Clock3') : ''}${navItem('trips', 'Trips & history', 'CalendarDays')}${navItem('settings', 'Settings', 'Settings')}</nav>
    <div class="sidebar-bottom"><div class="help-card"><div class="help-icon">${icon('Leaf')}</div><strong>A little care. A safer journey.</strong><p>Keep your fleet ready for the road.</p><button class="link-button" data-action="help">Visit the help center ${icon('ArrowUpRight')}</button></div>
    <div class="sidebar-profile"><div class="avatar">${esc(initials(store.profile.name))}</div><div><strong>${esc(store.profile.name)}</strong><small>${admin ? 'Fleet administrator' : store.profile.role === 'driver' ? 'School bus driver' : 'Student account'}</small></div><button class="icon-button" data-action="logout" aria-label="Sign out / Switch account">${icon('LogOut')}</button></div></div>
  </aside><div class="app-main"><header class="topbar"><div class="flex gap-8"><button class="icon-button menu-toggle" data-action="menu" aria-label="Open navigation">${icon('Menu')}</button><div class="mobile-brand">UDD<span> Go</span></div><div class="breadcrumbs">Workspace ${icon('ChevronRight')}<span class="current">${titles[page]}</span></div></div>
    <div class="top-actions">${admin ? `<label class="global-search">${icon('Search')}<input id="global-search" placeholder="Search your fleet…" aria-label="Search fleet" value="${esc(query)}"/><kbd>⌘ K</kbd></label>` : ''}${store.mode === 'demo' ? `<div class="topbar-role-pill role-${store.profile.role}"><span class="role-pill-dot"></span><span>${admin ? 'Admin' : store.profile.role === 'driver' ? 'Driver' : 'Student'}</span></div><select id="demo-role" class="demo-switch" aria-label="Switch demo role"><option value="admin" ${admin ? 'selected' : ''}>Admin view</option><option value="driver" ${store.profile.role === 'driver' ? 'selected' : ''}>Driver view</option><option value="student" ${store.profile.role === 'student' ? 'selected' : ''}>Student view</option><option value="logout">Sign out to Landing</option></select>` : `<span class="live-label">${icon('ShieldCheck')}Secure workspace</span>`}<span class="top-divider"></span><button class="icon-button" data-action="notifications" aria-label="View notifications">${icon('Bell')}${due ? '<span class="notification-dot"></span>' : ''}</button><div class="avatar">${esc(initials(store.profile.name))}</div></div></header>
    <main class="page" id="main-content">${content}<footer class="page-footer"><span>© ${new Date().getFullYear()} UDD Go. Every student. Every journey.</span><span>${store.mode === 'demo' ? `${icon('Info')} Sample data · stored in this browser` : `${icon('ShieldCheck')} Access controlled by your fleet role`}</span></footer></main></div>`;
}

function pageHeader(title, subtitle, actions = '') {
  return `<div class="page-header"><div class="page-intro"><div class="date">${icon('CalendarDays')}${date()}</div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="header-actions">${actions}</div>` : ''}</div>`;
}

function stats() {
  const { buses, student_assignments, users, routes } = store.data;
  const active = buses.filter((b) => b.status === 'active').length;
  const boarded = store.data.trip_passengers.filter(
    (p) =>
      p.status === 'boarded' &&
      store.data.trips.some((t) => t.id === p.trip_id && t.status === 'active')
  ).length;
  const students = users.filter((u) => u.role === 'student').length;
  const due = buses.filter((b) => maintenanceStatus(b).status !== 'healthy').length;
  return `<div class="summary-grid">
    ${stat('Total fleet', buses.length, 'BusFront', '', `${buses.filter((b) => b.status === 'idle').length} buses available`, 'Ready for the next journey')}
    ${stat('On the road', active, 'Navigation', 'green', `${routes.filter((r) => r.status === 'active').length} routes in progress`, 'Trips currently running')}
    ${stat('Students on board', boarded, 'GraduationCap', 'purple', `${students} registered students`, 'Across your school routes')}
    ${stat('Maintenance alerts', due, 'Wrench', 'orange', `${buses.filter((b) => maintenanceStatus(b).status === 'overdue').length} service overdue`, due ? 'A little attention needed' : 'Your fleet is up to date')}
  </div>`;
}
function stat(label, value, iconName, color, detail, foot) {
  return `<div class="summary-card"><div class="summary-top"><span>${label}</span><span class="stat-icon ${color}">${icon(iconName)}</span></div><div class="summary-value">${value}</div><div class="summary-foot"><span class="${color === 'orange' ? 'orange-text' : 'green-text'}">${detail}</span></div><div class="summary-foot">${foot}</div></div>`;
}

function trackingDetail() {
  const bus =
    store.data.buses.find(
      (b) => b.id === selectedBus && (!routeFilter || routeByBus(b.id)?.id === routeFilter)
    ) ||
    store.data.buses.find(
      (b) => b.status === 'active' && (!routeFilter || routeByBus(b.id)?.id === routeFilter)
    );
  if (!bus)
    return empty('A quieter moment', 'Start a route to see bus details here.', 'Navigation');
  selectedBus = bus.id;
  const route = routeByBus(bus.id),
    driver = person(route?.driver_id),
    capacity = route
      ? routeCapacity(bus, route.id, store.data.student_assignments)
      : { boarded: 0 };
  return `<div class="detail-label">Fleet in focus ${icon('Radio')}</div><div class="bus-title"><span class="vehicle-icon">${icon('BusFront')}</span><div><h3>${esc(bus.label)}</h3><p>${esc(bus.plate_number)}</p></div>${badge(bus.status)}</div><div class="driver-mini"><span class="avatar peach">${esc(initials(driver?.name))}</span><div><strong>${esc(driver?.name || 'Unassigned')}</strong>Assigned driver</div></div>
    <div class="occupancy"><div class="between"><span>Students on board</span><strong>${capacity.boarded} <span class="muted">/ ${bus.capacity}</span></strong></div><div class="progress"><span style="width:${Math.min(100, (capacity.boarded / bus.capacity) * 100)}%"></span></div></div>
    <div class="stop-timeline">${timeline(stopsFor(route?.id).slice(-3))}</div><div class="detail-bottom between"><span class="small muted" style="font-size:9px">${store.mode === 'demo' ? 'Simulated location' : 'Location updates via GPS'}</span><button class="link-button" data-action="bus-detail" data-id="${esc(bus.id)}">View details ${icon('ArrowRight')}</button></div>`;
}
function timeline(stops, selectedStop = '') {
  return stops
    .map(
      (s, i) =>
        `<div class="stop-item ${(selectedStop ? s.id === selectedStop : i === 0) ? 'current' : ''}"><span class="stop-dot"></span><div><strong>${esc(s.stop_name)}</strong><small>${selectedStop && s.id === selectedStop ? 'Your pickup stop' : i === stops.length - 1 ? 'Route destination' : `Stop ${s.stop_sequence}`}</small></div></div>`
    )
    .join('');
}
function mapToolbar(allowFilter = true) {
  return `<div class="map-toolbar">${
    allowFilter
      ? `<label class="map-filter">${icon('Route')}<select id="map-route-filter" aria-label="Filter map by route"><option value="">All routes</option>${store.data.routes
          .filter((r) => !r.archived)
          .map(
            (r) =>
              `<option value="${esc(r.id)}" ${r.id === routeFilter ? 'selected' : ''}>${esc(r.route_name)}</option>`
          )
          .join('')}</select>${icon('ChevronDown')}</label>`
      : '<span></span>'
  }<button class="button map-fit-button" data-action="recenter" aria-label="Fit all route stops" title="Fit all route stops">${icon('LocateFixed')}</button></div>`;
}

function overview() {
  return `${pageHeader('Every journey, in view.', 'A little oversight. A safer way to school.', `${button('<span class="export-label">Export report</span>', 'export', { iconName: 'Download', className: 'export-button' })}${button('Add bus', 'add-bus', { primary: true, iconName: 'Plus' })}`)}${stats()}
    <section class="card tracking-card"><div class="card-head tracking-head"><div><h2>Live fleet tracking <span class="count">${store.data.buses.filter((b) => b.status === 'active').length}</span></h2><p>A clear view of the road ahead.</p></div><span class="live-label" data-live-status><span class="live-dot"></span>${store.mode === 'demo' ? 'Demo simulation' : store.connected ? 'Connected' : 'Connecting…'}</span></div><div class="tracking-layout"><div class="map-wrap"><div id="fleet-map" class="fleet-map" aria-label="Interactive school bus route map"></div>${mapToolbar()}</div><aside class="tracking-detail" id="tracking-detail">${trackingDetail()}</aside></div></section>
    <div class="bottom-grid"><section class="card"><div class="card-head"><h2>Your fleet <span class="count">${store.data.buses.length}</span></h2><button class="link-button" data-page="fleet">View all buses ${icon('ArrowUpRight')}</button></div>${busTable(store.data.buses.slice(0, 4))}<div class="table-footer"><span>${Math.min(4, store.data.buses.length)} of ${store.data.buses.length} buses</span><span>Built for safer school runs</span></div></section><section class="card"><div class="card-head"><h2>Recent activity</h2><button class="icon-button" data-page="activity" aria-label="View all activity">${icon('MoreHorizontal')}</button></div><div class="activity-list">${activityItems(4)}</div></section></div>`;
}
function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#38bdf8';
}
function busTable(buses, full = false) {
  if (!buses.length) return empty('No buses found', 'Add a bus or try another search.');
  return `<div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Assigned route</th><th class="table-driver">Driver</th><th>On board</th><th>Status</th>${full ? '<th>Odometer</th>' : ''}<th><span class="sr-only">Actions</span></th></tr></thead><tbody>${buses
    .map((bus) => {
      const route = routeByBus(bus.id),
        driver = person(route?.driver_id),
        cap = route ? routeCapacity(bus, route.id, store.data.student_assignments) : { boarded: 0 };
      return `<tr><td><div class="table-person"><span class="vehicle-icon">${icon('BusFront')}</span><div><strong>${esc(bus.label)}</strong><small>${esc(bus.plate_number)}</small></div></div></td><td><span class="table-route">${route ? `<i class="route-dot" style="--c:${safeColor(route.color)}"></i>${esc(route.route_name)}` : '<span class="muted">Unassigned</span>'}</span></td><td class="table-driver"><span class="muted">${esc(driver?.name || '—')}</span></td><td><div class="table-capacity"><span><strong>${cap.boarded}</strong> / ${bus.capacity}</span><div class="progress"><span style="width:${(cap.boarded / bus.capacity) * 100}%"></span></div></div></td><td>${badge(bus.status)}</td>${full ? `<td class="muted">${formatNumber(bus.current_mileage)} km</td>` : ''}<td><button class="icon-button" data-action="bus-detail" data-id="${esc(bus.id)}" aria-label="View ${esc(bus.label)} details">${icon('MoreHorizontal')}</button></td></tr>`;
    })
    .join('')}</tbody></table></div>`;
}
function activityItems(limit = 100) {
  const events = store.data.activity.slice(0, limit);
  if (!events.length)
    return '<div class="empty"><p>Your fleet activity will appear here.</p></div>';
  return events
    .map(
      (a) =>
        `<div class="activity-item"><span class="activity-icon ${esc(a.type)}">${icon(a.type === 'boarding' ? 'UserRoundCheck' : a.type === 'route' ? 'Route' : a.type === 'maintenance' ? 'Wrench' : 'CircleCheck')}</span><div class="activity-text"><strong>${esc(a.message)}</strong>${a.detail ? `<p>${esc(a.detail)}</p>` : ''}<time datetime="${esc(a.created_at)}">${timeAgo(a.created_at)}</time></div></div>`
    )
    .join('');
}
function fleet() {
  const buses = store.data.buses.filter(
    (b) =>
      (busFilter === 'all' || b.status === busFilter) &&
      [
        b.label,
        b.plate_number,
        routeByBus(b.id)?.route_name,
        person(routeByBus(b.id)?.driver_id)?.name,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  return `${pageHeader('A fleet you can count on.', 'Manage your buses and keep every school run moving.', `${button('Export fleet', 'export', { iconName: 'Download' })}${button('Add bus', 'add-bus', { primary: true, iconName: 'Plus' })}`)}${stats()}<section class="card"><div class="card-head"><h2>All vehicles <span class="count">${store.data.buses.length}</span></h2><span class="small muted">One place for your entire fleet</span></div><div class="table-toolbar"><div class="filter-tabs">${[
    ['all', 'All buses'],
    ['active', 'On route'],
    ['idle', 'Available'],
    ['maintenance', 'Maintenance'],
  ]
    .map(
      ([key, label]) =>
        `<button class="filter-tab ${busFilter === key ? 'selected' : ''}" data-filter="${key}">${label}</button>`
    )
    .join(
      ''
    )}</div><label class="table-search">${icon('Search')}<input id="table-search" aria-label="Search buses" placeholder="Search buses…" value="${esc(query)}"/></label></div><div id="bus-table-results">${busTable(buses, true)}</div><div class="table-footer">${buses.length} ${buses.length === 1 ? 'bus' : 'buses'} found <span>Capacity is checked before assignment</span></div></section>`;
}
function routes() {
  const routes = store.data.routes.filter((r) => !r.archived);
  return `${pageHeader('Better routes. Smoother mornings.', 'Publish stop versions; services determine daily departures and allocations.', button('Create route', 'add-route', { primary: true, iconName: 'Plus' }))}<div class="route-grid">${routes.map((route) => `<article class="card route-card" style="--route-color:${safeColor(route.color)}"><div class="between">${badge(route.status)}<span class="small muted">Version ${route.version_no} · ${stopsFor(route.id).length} stops</span></div><h3>${esc(route.route_name)}</h3><p>${esc(route.area || 'Dagupan City')}</p><div class="route-meta"><div><span>Active services</span>${store.data.service_schedules.filter((s) => s.route_id === route.id && s.active).length}</div><div><span>Prepared trips</span>${store.data.trips.filter((t) => t.route_id === route.id && t.status === 'scheduled').length}</div></div><div class="trip-actions">${button('View / edit route', 'route-detail', { id: route.id })}<button class="button" data-page="services">Services & calendar</button></div></article>`).join('')}</div>${!routes.length ? `<section class="card">${empty('Your first route starts here', 'Create an ordered set of stops, then add a service.', 'Route')}</section>` : ''}`;
}

function people(role) {
  const students = role === 'student',
    users = store.data.users.filter(
      (u) =>
        u.role === role &&
        [u.name, u.student_code, u.contact_number]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
    );
  return `${pageHeader(students ? 'Every student, accounted for.' : 'The people behind every journey.', students ? 'Manage separate outbound and return service subscriptions.' : 'Drivers can serve multiple journeys when their allocations do not overlap.', button(students ? 'Add student' : 'Add driver', students ? 'add-student' : 'add-driver', { primary: true, iconName: 'Plus' }))}<section class="card"><div class="card-head"><h2>${students ? 'Student directory' : 'Driver directory'}</h2><label class="table-search"><input id="people-search" aria-label="Search ${role}s" placeholder="Search…" value="${esc(query)}"></label></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Services</th><th>Current trip</th><th>Actions</th></tr></thead><tbody>${
    users
      .map((user) => {
        const subscriptions = students
          ? store.data.student_subscriptions.filter((a) => a.student_id === user.id)
          : [];
        const services = students
          ? store.data.service_schedules.filter((s) =>
              subscriptions.some((a) => a.schedule_id === s.id)
            )
          : store.data.service_schedules.filter((s) => s.driver_id === user.id);
        const active = store.data.trips.find(
          (t) =>
            t.status === 'active' &&
            (students
              ? store.data.trip_passengers.some(
                  (p) => p.trip_id === t.id && p.student_id === user.id
                )
              : t.driver_id === user.id)
        );
        return `<tr><td><strong>${esc(user.name)}</strong><br><small>${esc(user.student_code || '')}</small></td><td>${esc(user.contact_number || '—')}</td><td>${services.map((service) => `<p>${esc(service.name)} · ${esc(service.departure_time.slice(0, 5))}</p>`).join('') || 'No subscriptions'}</td><td>${active ? button(active.route_name, 'trip-detail', { id: active.id }) : '—'}</td><td>${students ? `${button('Add service', 'subscribe-service', { id: user.id })}${subscriptions.map((a) => `<p style="margin-top:8px">${button('Remove ' + (store.data.service_schedules.find((s) => s.id === a.schedule_id)?.name || 'service'), 'unsubscribe-service', { id: a.id })}</p>`).join('')}` : button('View driver', 'person-detail', { id: user.id })}</td></tr>`;
      })
      .join('') || '<tr><td colspan="5">No profiles found.</td></tr>'
  }</tbody></table></div></section>`;
}

function maintenance() {
  const sorted = [...store.data.buses].sort(
    (a, b) => maintenanceStatus(a).remaining - maintenanceStatus(b).remaining
  );
  return `${pageHeader('Ready for the road.', 'Stay ahead of service intervals with odometer-based alerts.')}${stats()}<div class="maintenance-grid">${sorted
    .map((bus) => {
      const { remaining, status } = maintenanceStatus(bus);
      return `<article class="card maintenance-card"><div class="bus-title"><span class="vehicle-icon">${icon('Wrench')}</span><div><h3>${esc(bus.label)}</h3><p>${esc(bus.plate_number)}</p></div>${badge(status)}</div><span class="small muted">Current odometer</span><div class="mileage-value">${formatNumber(bus.current_mileage)} <small>km</small></div><div class="progress"><span style="width:${Math.min(100, (bus.current_mileage / bus.next_service_mileage) * 100)}%;background:${remaining <= 0 ? '#d6a56b' : remaining <= 500 ? '#debe80' : '#7cbaa7'}"></span></div><p class="muted small">${remaining <= 0 ? `${formatNumber(Math.abs(remaining))} km past service interval` : `${formatNumber(remaining)} km until next service`}<br/>Next service at ${formatNumber(bus.next_service_mileage)} km</p>${button('Record maintenance', 'service-bus', { id: bus.id, iconName: 'Check', className: 'full' })}</article>`;
    })
    .join('')}</div>`;
}
function settings() {
  return `${pageHeader('Make yourself at home.', 'Your workspace, connection, and notification preferences.')}<div class="settings-grid"><section class="card"><div class="card-head"><h2>Workspace</h2></div><div class="settings-body"><div class="setting-row"><div><strong>School</strong><p>Universidad de Dagupan</p></div><span class="setting-value">Main campus</span></div><div class="setting-row"><div><strong>Timezone</strong><p>All school times use Philippine Standard Time.</p></div><span class="setting-value">Asia/Manila</span></div><div class="setting-row"><div><strong>Signed in as</strong><p>${esc(store.profile.name)}</p></div><span class="setting-value">${esc(store.profile.role)}</span></div><div class="setting-row"><div><strong>Trip notifications</strong><p>Notify this device when your assigned trip starts or ends.</p></div><input id="notification-toggle" type="checkbox" class="toggle" aria-label="Trip notifications" ${preferences.notifications ? 'checked' : ''}/></div>${store.mode === 'demo' ? `<div class="setting-row"><div><strong>Preview another role</strong><p>Explore the driver or student experience.</p></div><select id="settings-role" aria-label="Switch demo role"><option value="admin" ${store.profile.role === 'admin' ? 'selected' : ''}>Administrator</option><option value="driver" ${store.profile.role === 'driver' ? 'selected' : ''}>Driver</option><option value="student" ${store.profile.role === 'student' ? 'selected' : ''}>Student</option></select></div><div class="setting-row"><div><strong>Restore sample data</strong><p>Clear demo changes and start fresh.</p></div>${button('Reset demo', 'reset-demo')}</div>` : ''}</div></section><div class="stack"><section class="card"><div class="card-head"><h2>Connection</h2>${store.mode === 'demo' ? '<span class="mode-pill">Demo mode</span>' : badge('healthy')}</div><div class="settings-body"><div class="note">${store.mode === 'demo' ? 'You are exploring sample records. Changes stay in this browser. Open a second tab to try live demo boarding and trip updates.' : 'Connected to Supabase. Your account role controls the records and location channels you can access.'}</div><div class="setting-row"><div><strong>${store.mode === 'demo' ? 'Connect your school' : 'Data refresh'}</strong><p>${store.mode === 'demo' ? 'Add your Supabase project keys to enable authentication and shared data.' : 'Fetch the latest shared records from your school.'}</p></div>${button(store.mode === 'demo' ? 'Setup guide' : 'Refresh', store.mode === 'demo' ? 'setup' : 'refresh', { iconName: store.mode === 'demo' ? 'ExternalLink' : 'RefreshCw' })}</div></div></section><section class="card"><div class="card-head"><h2>A little help goes a long way.</h2></div><div class="settings-body"><p class="muted small">Find your way around routes, boarding, and school transport.</p><div style="margin-top:18px">${button('Open help center', 'help', { iconName: 'CircleHelp' })}</div></div></section></div></div>`;
}
function studentHUDCard(trip, myPassenger, counts) {
  const isBoarded = myPassenger?.status === 'boarded';
  const isAlighted = myPassenger?.status === 'alighted';
  const isActive = trip.status === 'active';
  const pickupStop = myPassenger?.pickup_name || trip.stops?.[0]?.stop_name || 'Assigned Stop';
  const dropoffStop =
    myPassenger?.dropoff_name || trip.stops?.at(-1)?.stop_name || 'UDD Main Campus';
  const driverPhone = person(trip.driver_id)?.contact_number || '';

  return `<section class="card student-hud-card">
    <div class="card-head">
      <div>
        <h2>Live journey & safety telemetry</h2>
        <p>Real-time transit updates, your assigned pickup, and campus arrival tracking.</p>
      </div>
      <span class="live-label" data-live-status>
        <span class="live-dot"></span>
        ${isActive ? 'Bus on route' : trip.status === 'scheduled' ? 'Scheduled run' : 'Completed'}
      </span>
    </div>
    <div class="hud-body">
      <div class="hud-eta-banner ${isActive ? 'active' : ''}">
        <div class="eta-icon">${icon('Navigation')}</div>
        <div class="eta-info">
          <span class="eta-tag">${isBoarded ? 'On board vehicle' : isAlighted ? 'Safe drop-off verified' : 'Awaiting boarding'}</span>
          <strong>${isBoarded ? `En route to ${esc(dropoffStop)}` : isAlighted ? `Arrived at ${esc(dropoffStop)}` : `Pickup at ${esc(pickupStop)}`}</strong>
          <p class="small muted">${isActive ? (isBoarded ? `Bus ${esc(trip.bus_label)} is traveling safely. Destination arrival in ~8–12 mins.` : `Bus ${esc(trip.bus_label)} is approaching. Please wait safely at your designated stop area.`) : trip.status === 'scheduled' ? `Scheduled departure at ${departure(trip.planned_at?.slice(11, 16))} · Driver: ${esc(trip.driver_name)}.` : 'This journey has safely concluded at the school campus.'}</p>
        </div>
        <div class="eta-pill">
          <span>${isActive ? 'EST. TIME' : 'DEPARTURE'}</span>
          <strong>${isActive ? (isBoarded ? '~10 min' : '~5 min') : departure(trip.planned_at?.slice(11, 16))}</strong>
        </div>
      </div>

      <div class="hud-stats-grid">
        <div class="hud-stat-chip">
          <span class="stat-label">Assigned Vehicle</span>
          <strong>${esc(trip.bus_label)}</strong>
          <small class="muted">${esc(trip.plate_number)}</small>
        </div>
        <div class="hud-stat-chip">
          <span class="stat-label">Official Driver</span>
          <strong>${esc(trip.driver_name)}</strong>
          <small class="muted">${esc(driverPhone || 'UDD Fleet')}</small>
        </div>
        <div class="hud-stat-chip">
          <span class="stat-label">Your Status</span>
          <strong style="color:${isBoarded ? '#059669' : isAlighted ? '#2563eb' : '#d97706'}">${isBoarded ? 'On Board' : isAlighted ? 'Alighted' : 'Reserved Seat'}</strong>
          <small class="muted">${counts.boarded} / ${trip.capacity} passengers</small>
        </div>
        <div class="hud-stat-chip">
          <span class="stat-label">School Destination</span>
          <strong>UDD Campus</strong>
          <small class="muted">Main Hub</small>
        </div>
      </div>

      <div class="hud-action-row">
        ${driverPhone ? `<a href="tel:${esc(driverPhone.replace(/\s+/g, ''))}" class="button" title="Call assigned driver">${icon('Phone')}<span>Call driver (${esc(driverPhone)})</span></a>` : ''}
        <a href="tel:0755222496" class="button" title="Universidad de Dagupan Security Desk">${icon('ShieldCheck')}<span>UDD Security Hotline (075) 522-2496</span></a>
        ${button('View my trip manifest', 'trip-detail', { id: trip.id, iconName: 'UserRoundCheck' })}
      </div>
    </div>
  </section>`;
}

function driverHUDCard(trip, counts, passengers) {
  const stops = trip.stops || [];
  const nextStop = stops.find((s, i) => i > 0 && i < stops.length - 1) || stops[1] || stops[0];
  const waitingCount = passengers.filter(
    (p) => p.pickup_stop_id === nextStop?.id && p.status === 'expected'
  ).length;
  const isSharing = gpsWatch !== null;

  return `<section class="card driver-hud-card">
    <div class="card-head">
      <div>
        <h2>Cockpit navigation & passenger manifest HUD</h2>
        <p>Live route telematics, next stop advisory, and passenger boarding scanner.</p>
      </div>
      <span class="live-label" data-live-status>
        <span class="live-dot"></span>
        ${trip.status === 'active' ? 'Active telemetry' : trip.status === 'scheduled' ? 'Scheduled departure' : 'Trip completed'}
      </span>
    </div>
    <div class="hud-body">
      <div class="driver-cockpit-banner">
        <div class="cockpit-icon">${icon('MapPin')}</div>
        <div class="cockpit-info">
          <span class="cockpit-tag">UPCOMING ROUTE STOP</span>
          <h3>${esc(nextStop?.stop_name || 'UDD Main Campus')}</h3>
          <p class="small muted">Stop ${nextStop?.stop_sequence || 1} of ${stops.length} · ${waitingCount} student${waitingCount === 1 ? '' : 's'} assigned to board at this stop.</p>
        </div>
        <div class="cockpit-quick-action">
          ${button('Open Boarding Scanner', 'trip-detail', { id: trip.id, primary: true, iconName: 'UserRoundCheck' })}
        </div>
      </div>

      <div class="driver-telemetry-grid">
        <div class="telemetry-item">
          <span class="telemetry-label">Passenger Load</span>
          <strong>${counts.boarded} / ${trip.capacity}</strong>
          <div class="progress" style="margin-top:6px"><span style="width:${Math.min(100, (counts.boarded / trip.capacity) * 100)}%"></span></div>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">Speed Advisory</span>
          <strong>35 km/h</strong>
          <small class="muted">Max 40 km/h school zone</small>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">GPS Precision</span>
          <strong style="color:${isSharing ? '#059669' : '#0284c7'}">${isSharing ? '±2.4m High Acc.' : 'Simulated GPS'}</strong>
          <small class="muted">${isSharing ? 'Device broadcasting' : 'Tap below to share'}</small>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">Vehicle Odometer</span>
          <strong>${formatNumber(trip.start_mileage || trip.segment_start_mileage || 24320)} km</strong>
          <small class="muted">Plate: ${esc(trip.plate_number)}</small>
        </div>
      </div>

      <div class="hud-action-row">
        ${trip.status === 'active' ? button(isSharing ? 'GPS broadcasting active' : 'Enable live GPS sharing', 'enable-gps', { primary: !isSharing, id: trip.id, iconName: 'LocateFixed' }) : ''}
        ${button(trip.status === 'scheduled' ? 'Review & start trip' : 'Complete trip / cabin check', 'trip-detail', { id: trip.id, iconName: 'Check' })}
        <a href="tel:0755222496" class="button" title="UDD Dispatch Center">${icon('Phone')}<span>Contact school dispatch</span></a>
      </div>
    </div>
  </section>`;
}

function portal() {
  const isDriver = store.profile.role === 'driver';
  const choices = store
    .visibleTrips()
    .filter((t) => t.service_date === schoolDate() || t.status === 'active')
    .sort(
      (a, b) =>
        (b.status === 'active') - (a.status === 'active') ||
        a.planned_at.localeCompare(b.planned_at)
    );
  const trip = choices.find((t) => t.id === portalTripId) || choices[0];
  portalTripId = trip?.id || '';
  if (!trip)
    return `${pageHeader(`Hello, ${esc(store.profile?.name?.split(' ')[0] || 'there')}.`, 'Your dated journeys appear here when prepared.', button('Trips & history', 'open-trips'))}<section class="card">${empty('No trips prepared for today', 'Your administrator can generate trips from the service calendar.', 'CalendarDays')}</section>`;
  const passengers = store.data.trip_passengers.filter((p) => p.trip_id === trip.id),
    myPassenger = passengers.find((p) => p.student_id === store.profile.id);
  const counts = store.routeSummaries.get(trip.id) || tripCounts(passengers);
  const picker = `<section class="card" style="padding:16px;margin-bottom:20px"><div class="trip-actions">${choices.map((t) => button(`${t.direction === 'return' ? 'Return' : 'Outbound'} · ${departure(new Date(t.planned_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }))} · ${t.route_name}`, 'choose-portal-trip', { id: t.id, primary: t.id === trip.id })).join('')}</div></section>`;
  const expandButton = button(portalExpanded ? 'Normal view' : 'Enlarge map', 'toggle-portal-map', {
    iconName: portalExpanded ? 'Minimize2' : 'Maximize2',
    className: 'button subtle map-expand-btn',
  });
  return `${pageHeader(isDriver ? `Hello, ${esc(store.profile?.name?.split(' ')[0] || 'there')}.` : 'Your school journeys, connected.', 'Choose your outbound or return trip.', button('Trips & history', 'open-trips', { iconName: 'CalendarDays' }))}${picker}
  <div class="portal-grid ${isDriver ? 'driver-portal' : 'student-portal'} ${portalExpanded ? 'map-expanded' : ''}">
    <div class="portal-main-col stack">
      <section class="card portal-map">
        <div class="card-head">
          <div>
            <h2>${esc(trip.route_name)}</h2>
            <span class="small muted">${isDriver ? 'Driver navigation HUD · live route telemetry' : 'Your school bus journey map'}</span>
          </div>
          <div class="flex gap-8">
            ${badge(trip.status)}
            ${expandButton}
          </div>
        </div>
        <div class="map-wrap">
          <div id="fleet-map" class="fleet-map" aria-label="Your selected trip map"></div>
          ${mapToolbar(false)}
        </div>
      </section>
      ${isDriver ? driverHUDCard(trip, counts, passengers) : studentHUDCard(trip, myPassenger, counts)}
    </div>
    <div class="portal-sidebar">
      <section class="card trip-card">
        <h2>${esc(trip.direction === 'return' ? 'Return journey' : 'Outbound journey')}</h2>
        <div class="bus-title"><span class="vehicle-icon">${icon('BusFront')}</span><div><h3>${esc(trip.bus_label)}</h3><p>${esc(trip.plate_number)}</p></div></div>
        <div class="driver-mini"><span class="avatar peach">${esc(initials(trip.driver_name))}</span><div><strong>${esc(trip.driver_name)}</strong>${esc(person(trip.driver_id)?.contact_number || '')}</div></div>
        <div class="trip-info">
          <div class="between"><span>Service date</span><strong>${esc(trip.service_date)}</strong></div>
          <div class="between"><span>On board</span><strong>${counts.boarded} / ${trip.capacity}</strong></div>
          ${!isDriver ? `<div class="between"><span>Your status</span>${badge(myPassenger?.status || 'expected')}</div>` : ''}
        </div>
        ${
          isDriver
            ? `<div class="trip-actions">${trip.status === 'active' ? button('Enable GPS sharing', 'enable-gps', { primary: true, id: trip.id, iconName: 'LocateFixed' }) : ''}${button(trip.status === 'scheduled' ? 'Review and start trip' : 'View passengers / complete', 'trip-detail', { id: trip.id })}</div><p id="gps-status" class="muted small">${gpsWatch !== null ? 'Sharing this device’s location.' : store.mode === 'demo' ? 'Sample locations are simulated.' : 'Enable location sharing during your active trip.'}</p>`
            : `<div class="student-pass"><span>Your boarding ID</span><strong>${esc(store.profile.student_code || store.profile.id)}</strong><p>${esc(myPassenger?.pickup_name || '')} → ${esc(myPassenger?.dropoff_name || '')}</p></div>${button('View my trip record', 'trip-detail', { id: trip.id })}`
        }
      </section>
      <section class="card trip-card">
        <h2>Trip stops</h2>
        <div class="stop-timeline">${timeline(trip.stops, myPassenger?.pickup_stop_id)}</div>
      </section>
    </div>
  </div>`;
}

const tripUI = () => ({
  pageHeader,
  button,
  badge,
  showModal,
  closeModal,
  toast,
  inputField,
  selectField,
  formFooter,
});

function render() {
  destroyLanding?.();
  destroyLanding = null;
  fleetMap?.destroy();
  fleetMap = null;
  if (!store.profile) {
    if (publicView === 'login') {
      renderLogin();
    } else {
      destroyLanding = mountLanding(app, { icon, demo: store.mode === 'demo' });
      mountIcons();
    }
    document.title =
      publicView === 'login'
        ? 'Sign in · UDD Go'
        : 'UDD Go · Universidad de Dagupan Transport Operations';
    return;
  }
  if (store.profile.role !== 'admin' && ![store.profile.role, 'settings', 'trips'].includes(page))
    page = store.profile.role;
  if (store.profile.role === 'admin' && ['driver', 'student'].includes(page)) page = 'overview';
  const views = {
    overview,
    services: () => schedulingPage(tripUI()),
    trips: () => tripPage(tripUI()),
    fleet,
    routes,
    students: () => people('student'),
    drivers: () => people('driver'),
    maintenance,
    settings,
    driver: portal,
    student: portal,
    activity: () =>
      `${pageHeader('The story of your school runs.', 'Boarding, trips, and fleet updates in one place.', button('Refresh', 'refresh', { iconName: 'RefreshCw' }))}<section class="card"><div class="card-head"><h2>Fleet activity <span class="count">${store.data.activity.length}</span></h2></div><div class="activity-list">${activityItems()}</div></section>`,
  };
  app.innerHTML = shell((views[page] || overview)());
  mountIcons();
  mountMap();
  document.title = `${titles[page]} · UDD Go`;
}
function fleetMapData({ tripId = '', routeId = '' } = {}) {
  let trips = store
    .visibleTrips()
    .filter((t) =>
      tripId ? t.id === tripId : t.status === 'active' && (!routeId || t.route_id === routeId)
    );
  const routes = trips.map((t) => ({
    ...store.data.routes.find((r) => r.id === t.route_id),
    id: t.id,
    route_name: t.route_name,
    bus_id: t.bus_id,
    driver_id: t.driver_id,
    status: t.status,
    location_epoch: t.location_epoch,
  }));
  const route_stops = trips.flatMap((t) =>
    (t.stops || []).map((stop) => ({ ...stop, route_id: t.id }))
  );
  if (!trips.length && routeId) {
    const route = store.data.routes.find((r) => r.id === routeId);
    if (route) {
      routes.push(route);
      route_stops.push(...stopsFor(routeId));
    }
  }
  const buses = store.data.buses.map((b) => {
    const trip = trips.find((t) => t.bus_id === b.id);
    return {
      ...b,
      status: trip?.status === 'active' ? 'active' : 'idle',
      ...(!trip || b.position_trip_id !== trip.id || b.position_epoch !== trip.location_epoch
        ? { position_at: null }
        : {}),
    };
  });
  return { ...store.data, routes, route_stops, buses };
}
function mountMap() {
  const element = document.querySelector('#fleet-map');
  if (!element) return;
  const data = fleetMapData(
    store.profile.role === 'admin' ? { routeId: routeFilter } : { tripId: portalTripId }
  );
  fleetMap = new FleetMap(element, data, {
    selected: selectedBus,
    demo: store.mode === 'demo',
    onSelect: (id) => {
      selectedBus = id;
      fleetMap.highlight(id);
      const panel = document.querySelector('#tracking-detail');
      if (panel) {
        panel.innerHTML = trackingDetail();
        mountIcons();
      }
    },
  });
}

function navigate(next) {
  page = next;
  query = '';
  busFilter = 'all';
  routeFilter = '';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderLogin({ prefill = false } = {}) {
  mountLogin(app, {
    icon,
    demo: store.mode === 'demo',
    method: loginMethod,
    role: loginRole,
    prefill,
  });
  mountIcons();
}

function showModal(title, subtitle, body, { wide = false, onSubmit = null, cleanup = null } = {}) {
  closeModal();
  modalReturnFocus = document.activeElement;
  modalCleanup = cleanup;
  document.querySelector('#modal-root').innerHTML =
    `<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal ${wide ? 'wide' : ''}" tabindex="-1"><div class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('X')}</button></div><div class="modal-body">${body}</div></section></div>`;
  document.body.style.overflow = 'hidden';
  mountIcons();
  const form = document.querySelector('#modal-root form');
  if (form && onSubmit)
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      const error = form.querySelector('.form-error');
      error.textContent = '';
      try {
        await onSubmit(new FormData(form));
      } catch (e) {
        error.textContent = e.message;
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
  setTimeout(() => {
    const first = document.querySelector('#modal-root input,#modal-root select,#modal-root .modal');
    first?.focus();
  }, 50);
}
function closeModal() {
  modalMap?.destroy();
  modalMap = null;
  modalCleanup?.();
  modalCleanup = null;
  document.querySelector('#modal-root').replaceChildren();
  document.body.style.overflow = '';
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}
const formFooter = (label) =>
  `<div class="form-error" role="alert"></div><div class="modal-footer">${button('Cancel', 'close-modal')}<button class="button primary" type="submit">${label}${icon('Check')}</button></div>`;
const inputField = (
  label,
  name,
  {
    type = 'text',
    value = '',
    placeholder = '',
    min = '',
    max = '',
    required = true,
    help = '',
  } = {}
) =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${required ? 'required' : ''} ${min !== '' ? `min="${min}"` : ''} ${max !== '' ? `max="${max}"` : ''} ${type === 'text' ? 'maxlength="100"' : ''}/>${help ? `<small>${help}</small>` : ''}</label>`;
const selectField = (label, name, options) =>
  `<label class="field">${label}<select name="${name}" aria-label="${esc(label)}" required>${options}</select></label>`;
function addBusModal(busId = '') {
  const bus = store.data.buses.find((b) => b.id === busId);
  if (bus?.status === 'active') {
    toast('End the active trip before editing this bus.', true);
    return;
  }
  showModal(
    bus ? 'Keep your fleet up to date.' : 'A new addition to your fleet.',
    bus
      ? `Update the details for ${esc(bus.label)}.`
      : 'Add the essentials. Your bus will be ready for a route.',
    `<form>${inputField('Vehicle name', 'label', { placeholder: 'e.g. Bus 07', value: bus?.label || '' })}${inputField('Plate number', 'plate_number', { placeholder: 'e.g. NCF 7301', value: bus?.plate_number || '' })}<div class="field-row">${inputField('Seat capacity', 'capacity', { type: 'number', min: 1, max: 100, value: bus?.capacity || 30 })}${inputField('Current odometer (km)', 'current_mileage', { type: 'number', min: bus?.current_mileage || 0, max: 10000000, value: bus?.current_mileage || 0 })}</div>${inputField('Next service at (km)', 'next_service_mileage', { type: 'number', min: 1, max: 10000000, value: bus?.next_service_mileage || 5000 })}${bus ? selectField('Vehicle status', 'status', `<option value="idle" ${bus.status === 'idle' ? 'selected' : ''}>Available</option><option value="maintenance" ${bus.status === 'maintenance' ? 'selected' : ''}>In maintenance</option>`) : ''}${formFooter(bus ? 'Save changes' : 'Add bus')}</form>`,
    {
      onSubmit: async (f) => {
        await store.action(bus ? 'update_bus' : 'add_bus', {
          ...(bus ? { bus_id: bus.id, status: f.get('status') } : {}),
          label: f.get('label').trim(),
          plate_number: f.get('plate_number').trim().toUpperCase(),
          capacity: Number(f.get('capacity')),
          current_mileage: Number(f.get('current_mileage')),
          next_service_mileage: Number(f.get('next_service_mileage')),
        });
        closeModal();
        toast(bus ? 'Bus details updated.' : 'Bus added to your fleet.');
      },
    }
  );
}
function addPersonModal(role) {
  showModal(
    role === 'driver' ? 'Meet your next driver.' : 'Welcome a student aboard.',
    role === 'driver'
      ? 'Add a driver profile, then assign a route.'
      : 'Add a profile, then choose their route and pickup stop.',
    `<form>${inputField('Full name', 'name', { placeholder: role === 'driver' ? 'e.g. Juan Dela Cruz' : 'e.g. Maria Santos' })}${role === 'student' ? inputField('Student ID', 'student_code', { placeholder: 'e.g. UDD-0025' }) : ''}${inputField('Contact number', 'contact_number', { type: 'tel', placeholder: 'e.g. 0917 123 4567' })}${store.mode === 'live' ? '<div class="note">This creates a fleet profile. Link an existing Supabase Auth account to this profile using the setup guide to enable sign-in.</div>' : ''}${formFooter(role === 'driver' ? 'Add driver' : 'Add student')}</form>`,
    {
      onSubmit: async (f) => {
        await store.action('add_person', {
          role,
          name: f.get('name').trim(),
          contact_number: f.get('contact_number').trim(),
          student_code: role === 'student' ? f.get('student_code').trim().toUpperCase() : null,
        });
        closeModal();
        toast(`${role === 'driver' ? 'Driver' : 'Student'} profile added.`);
      },
    }
  );
}
function routeModal(routeId = '') {
  const editing = store.data.routes.find((r) => r.id === routeId);
  const original = editing ? stopsFor(routeId) : [];
  routeDraft = structuredClone(original);
  const buses = store.data.buses.filter((b) => b.status !== 'maintenance');
  const drivers = store.data.users.filter((u) => u.role === 'driver');
  if (!editing && (!buses.length || !drivers.length)) {
    showModal(
      'Make room for a new route.',
      'Choose default resources; service schedules determine their daily allocations.',
      `<div class="note">${!buses.length ? 'Add an available bus. ' : ''}${!drivers.length ? 'Add an unassigned driver. ' : ''}Then return here to create your route.</div><div class="modal-footer">${button('Close', 'close-modal')}${!buses.length ? button('Add bus', 'add-bus', { primary: true }) : button('Add driver', 'add-driver', { primary: true })}</div>`
    );
    return;
  }
  showModal(
    editing ? 'Publish a new route version.' : 'A better way to campus.',
    'Name your route and click the map to place stops in travel order. Prepared trips keep their snapshots.',
    `<form><div class="route-editor"><div class="stack">${inputField('Route name', 'route_name', { placeholder: 'e.g. Malasiqui morning loop', value: editing?.route_name || '' })}<div class="field-row">${inputField('Area', 'area', { placeholder: 'e.g. Malasiqui', value: editing?.area || '' })}${!editing ? inputField('Departure time', 'departure_time', { type: 'time', value: '06:30' }) : ''}</div>${!editing ? `${selectField('Assign bus', 'bus_id', buses.map((b) => `<option value="${esc(b.id)}">${esc(b.label)} · ${b.capacity} seats</option>`).join(''))}${selectField('Assign driver', 'driver_id', drivers.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join(''))}${selectField('Route color', 'color', '<option value="#2ba9e0">Sky blue</option><option value="#8b80cb">Lavender</option><option value="#4fa98d">Sage green</option><option value="#daaa52">Warm amber</option>')}` : ''}<div class="note">Connect at least two stops. Lines show stop order; drivers should use road navigation for directions.</div></div><div><p class="stop-editor-heading">Click the map to add a stop. Use the campus button for UDD.</p><div id="stop-editor-map" class="stop-editor-map"></div><div class="between" style="margin-top:9px"><span class="small muted" id="stop-count">0 stops added</span><button class="link-button" data-action="add-campus">${icon('School')}Add UDD campus</button></div><div id="stop-editor-list" class="stop-editor-list"></div><div id="stop-remapping"></div></div></div>${formFooter(editing ? 'Publish route version' : 'Create route')}</form>`,
    {
      wide: true,
      onSubmit: async (f) => {
        if (routeDraft.length < 2 || routeDraft.length > 200)
          throw new Error('Choose between two and 200 route stops.');
        if (routeDraft.some((s) => !s.stop_name.trim())) throw new Error('Give every stop a name.');
        const stop_remap = Object.fromEntries(
          [...f.entries()]
            .filter(([key]) => key.startsWith('remap:'))
            .map(([key, value]) => [key.slice(6), value])
        );
        await store.action(editing ? 'publish_route' : 'add_route', {
          ...(editing
            ? { route_id: editing.id, expected_version: editing.version_no, stop_remap }
            : {}),
          route_name: f.get('route_name').trim(),
          area: f.get('area').trim(),
          departure_time: f.get('departure_time'),
          bus_id: f.get('bus_id'),
          driver_id: f.get('driver_id'),
          color: f.get('color'),
          stops: routeDraft.map((s) => ({ ...s, stop_name: s.stop_name.trim() })),
        });
        closeModal();
        toast(
          editing ? 'Route version published.' : 'Route created. Time to welcome your students.'
        );
      },
    }
  );
  modalMap = createStopEditor(document.querySelector('#stop-editor-map'), (lat, lng) => {
    routeDraft.push({
      id: crypto.randomUUID(),
      stop_name: `Stop ${routeDraft.length + 1}`,
      latitude: lat,
      longitude: lng,
    });
    updateDraft();
  });
  routeDraft.originalStops = original;
  updateDraft();
}
function updateDraft() {
  document.querySelector('#stop-editor-list').innerHTML = routeDraft
    .map(
      (s, i) =>
        `<div class="stop-editor-row"><span>${i + 1}</span><input data-stop-index="${i}" aria-label="Name for stop ${i + 1}" value="${esc(s.stop_name)}" maxlength="100" required/><button type="button" class="icon-button" data-action="remove-stop" data-id="${i}" aria-label="Remove stop ${i + 1}">${icon('X')}</button><button type="button" class="icon-button" data-action="move-stop-up" data-id="${i}" aria-label="Move stop ${i + 1} up">↑</button><button type="button" class="icon-button" data-action="move-stop-down" data-id="${i}" aria-label="Move stop ${i + 1} down">↓</button></div>`
    )
    .join('');
  document.querySelector('#stop-remapping').innerHTML = (routeDraft.originalStops || [])
    .filter((old) => !routeDraft.some((s) => s.id === old.id))
    .map((old) =>
      selectField(
        `Remap removed stop: ${esc(old.stop_name)}`,
        `remap:${old.id}`,
        routeDraft.map((s) => `<option value="${esc(s.id)}">${esc(s.stop_name)}</option>`).join('')
      )
    )
    .join('');
  document.querySelector('#stop-count').textContent = `${routeDraft.length} stops added`;
  modalMap.update(routeDraft);
  mountIcons();
}
function busDetail(id) {
  const bus = store.data.buses.find((b) => b.id === id);
  if (!bus) return;
  const route = routeByBus(id),
    driver = person(route?.driver_id),
    cap = route
      ? routeCapacity(bus, route.id, store.data.student_assignments)
      : { assigned: 0, boarded: 0 };
  showModal(
    esc(bus.label),
    esc(bus.plate_number),
    `<div class="bus-title"><span class="vehicle-icon">${icon('BusFront')}</span><div><h3>${esc(route?.route_name || 'Ready for an assignment')}</h3><p>${esc(driver?.name || 'No driver assigned')}</p></div>${badge(bus.status)}</div><div class="modal-detail-list">${[
      ['Seat capacity', `${bus.capacity} seats`],
      ['Students assigned', cap.assigned],
      ['Students on board', cap.boarded],
      ['Current odometer', `${formatNumber(bus.current_mileage)} km`],
      ['Next service', `${formatNumber(bus.next_service_mileage)} km`],
      ['Maintenance', statusNames[maintenanceStatus(bus).status]],
    ]
      .map(([k, v]) => `<div class="setting-row"><strong>${k}</strong><span>${esc(v)}</span></div>`)
      .join(
        ''
      )}</div><div class="modal-footer">${button('Close', 'close-modal')}${store.profile.role === 'admin' ? `${!route ? button('Remove bus', 'delete-bus', { id, iconName: 'Trash2', className: 'danger' }) : button('View route', 'route-detail', { id: route.id, iconName: 'Route' })}${bus.status !== 'active' ? button('Edit bus', 'edit-bus', { id, iconName: 'Settings' }) : ''}${button('Record service', 'service-bus', { id, primary: true, iconName: 'Wrench' })}` : ''}</div>`
  );
}
function routeDetail(id) {
  const route = store.data.routes.find((r) => r.id === id);
  if (!route) return;
  const bus = store.data.buses.find((b) => b.id === route.bus_id),
    cap = routeCapacity(bus, route.id, store.data.student_assignments);
  let detailMap = null;
  showModal(
    esc(route.route_name),
    `${departure(route.departure_time)} departure · ${esc(bus?.label || 'Unassigned bus')} · ${cap.assigned} assigned students`,
    `<div class="detail-map" id="route-detail-map"></div><div class="stop-timeline">${timeline(stopsFor(id))}</div><div class="modal-footer">${button('Close', 'close-modal')}${store.profile.role === 'admin' && route.status !== 'active' ? button('Archive route', 'archive-route', { id, iconName: 'Trash2', className: 'danger' }) : ''}${store.profile.role === 'admin' && !route.archived ? button('Edit route', 'edit-route', { id }) : ''}${store.profile.role === 'admin' ? button('Monitor route', 'monitor-route', { id, primary: true, iconName: 'Navigation' }) : ''}</div>`,
    { cleanup: () => detailMap?.destroy() }
  );
  detailMap = new FleetMap(
    document.querySelector('#route-detail-map'),
    {
      ...store.data,
      routes: store.data.routes.filter((r) => r.id === id),
      buses: store.data.buses.map((b) => ({ ...b, status: 'idle' })),
    },
    { routeId: id, demo: store.mode === 'demo', showVehicles: false }
  );
}
function serviceModal(id) {
  const bus = store.data.buses.find((b) => b.id === id);
  if (bus.status === 'active') {
    toast('End the active route before recording maintenance.', true);
    return;
  }
  showModal(
    'A little care for the road ahead.',
    `Record completed maintenance for ${esc(bus.label)}.`,
    `<form>${inputField('Odometer at service (km)', 'mileage', { type: 'number', min: bus.current_mileage, max: 10000000, value: bus.current_mileage })}${inputField('Next service at (km)', 'next_service_mileage', { type: 'number', min: bus.current_mileage + 1, max: 10000000, value: bus.current_mileage + 5000 })}<div class="note">Recording service updates the odometer and marks this bus available.</div>${formFooter('Record service')}</form>`,
    {
      onSubmit: async (f) => {
        await store.action('service_bus', {
          bus_id: id,
          mileage: Number(f.get('mileage')),
          next_service_mileage: Number(f.get('next_service_mileage')),
        });
        closeModal();
        toast('Maintenance recorded. Your bus is ready.');
      },
    }
  );
}
function confirmModal(title, text, label, action) {
  showModal(title, text, `<form>${formFooter(label)}</form>`, {
    onSubmit: async () => {
      await action();
      closeModal();
    },
  });
}
function exportFleet() {
  const rows = [
    [
      'Vehicle',
      'Plate number',
      'Capacity',
      'On board',
      'Assigned students',
      'Route',
      'Driver',
      'Status',
      'Odometer (km)',
      'Next service (km)',
    ],
    ...store.data.buses.map((bus) => {
      const route = routeByBus(bus.id),
        cap = route
          ? routeCapacity(bus, route.id, store.data.student_assignments)
          : { boarded: 0, assigned: 0 };
      return [
        bus.label,
        bus.plate_number,
        bus.capacity,
        cap.boarded,
        cap.assigned,
        route?.route_name || '',
        person(route?.driver_id)?.name || '',
        statusNames[bus.status],
        bus.current_mileage,
        bus.next_service_mileage,
      ];
    }),
  ];
  const url = URL.createObjectURL(
    new Blob(['\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `udd-go-fleet-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Fleet report exported.');
}

async function enableGPS(routeId) {
  if (gpsWatch !== null) {
    toast('GPS sharing is already enabled.');
    return;
  }
  gpsRouteId = routeId;
  const epoch = store.data.trips.find((t) => t.id === routeId)?.location_epoch;
  const publish = async (position) => {
    try {
      if (store.data.trips.find((t) => t.id === routeId)?.location_epoch !== epoch) {
        await stopGPS();
        throw new Error('Trip resources changed. Enable GPS on the current vehicle.');
      }
      await store.publishPosition(routeId, position.coords);
      const status = document.querySelector('#gps-status');
      if (status)
        status.textContent = `Sharing GPS · last update ${new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}`;
    } catch (e) {
      toast(e.message, true);
    }
  };
  if (Capacitor.isNativePlatform()) {
    const permissions = await Geolocation.requestPermissions();
    if (permissions.location !== 'granted')
      throw new Error('Allow location access in device settings to share your bus location.');
    gpsNative = true;
    gpsWatch = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, minimumUpdateInterval: 5000 },
      (position, error) => {
        if (error) toast(error.message, true);
        else if (position) publish(position);
      }
    );
  } else {
    if (!navigator.geolocation) throw new Error('This device does not support geolocation.');
    gpsNative = false;
    gpsWatch = navigator.geolocation.watchPosition(
      publish,
      (error) => {
        toast(`GPS unavailable: ${error.message}`, true);
        stopGPS();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }
  toast('GPS sharing enabled for your active route.');
}
async function stopGPS() {
  if (gpsWatch === null) return;
  if (gpsNative) await Geolocation.clearWatch({ id: gpsWatch });
  else navigator.geolocation.clearWatch(gpsWatch);
  gpsWatch = null;
  gpsRouteId = null;
}

async function handleAction(action, id) {
  if (await schedulingAction(action, id, tripUI())) return;
  if (await tripAction(action, id, tripUI())) return;
  switch (action) {
    case 'open-trips':
      navigate('trips');
      break;
    case 'choose-portal-trip':
      portalTripId = id;
      render();
      break;
    case 'add-bus':
      addBusModal();
      break;
    case 'edit-bus':
      addBusModal(id);
      break;
    case 'add-route':
      routeModal();
      break;
    case 'edit-route':
      routeModal(id);
      break;
    case 'move-stop-up': {
      const i = Number(id);
      if (i > 0) [routeDraft[i - 1], routeDraft[i]] = [routeDraft[i], routeDraft[i - 1]];
      updateDraft();
      break;
    }
    case 'move-stop-down': {
      const i = Number(id);
      if (i < routeDraft.length - 1)
        [routeDraft[i + 1], routeDraft[i]] = [routeDraft[i], routeDraft[i + 1]];
      updateDraft();
      break;
    }
    case 'add-driver':
      addPersonModal('driver');
      break;
    case 'add-student':
      addPersonModal('student');
      break;
    case 'assign-student':
      await schedulingAction('subscribe-service', id, tripUI());
      break;
    case 'bus-detail':
      busDetail(id);
      break;
    case 'route-detail':
      routeDetail(id);
      break;
    case 'service-bus':
      serviceModal(id);
      break;
    case 'delete-bus':
      confirmModal(
        'Remove this bus?',
        'This unassigned bus will be removed from your fleet.',
        'Remove bus',
        async () => {
          await store.action('delete_bus', { bus_id: id });
          toast('Bus removed from your fleet.');
        }
      );
      break;
    case 'person-detail': {
      const u = person(id),
        route = store.data.routes.find((r) => r.driver_id === id);
      showModal(
        esc(u.name),
        'Driver profile',
        `<div class="modal-detail-list"><div class="setting-row"><strong>Contact number</strong><span>${esc(u.contact_number || '—')}</span></div><div class="setting-row"><strong>Assigned route</strong><span>${esc(route?.route_name || 'Unassigned')}</span></div></div><div class="modal-footer">${route ? button('View route', 'route-detail', { id: route.id, primary: true }) : button('Close', 'close-modal')}</div>`
      );
      break;
    }
    case 'monitor-route':
      routeFilter = id;
      page = 'overview';
      closeModal();
      render();
      break;
    case 'enable-gps':
      await enableGPS(id);
      break;
    case 'export':
      exportFleet();
      break;
    case 'refresh':
      resetTripHistory();
      await store.refresh();
      toast('Your fleet is up to date.');
      break;
    case 'recenter':
      fleetMap?.fit();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'menu':
      document.querySelector('.sidebar').classList.add('open');
      document.querySelector('.sidebar-overlay').classList.add('open');
      break;
    case 'close-menu':
      document.querySelector('.sidebar').classList.remove('open');
      document.querySelector('.sidebar-overlay').classList.remove('open');
      break;
    case 'profile':
      navigate('settings');
      break;
    case 'toggle-portal-map':
      portalExpanded = !portalExpanded;
      render();
      break;
    case 'go-landing':
    case 'go-login':
      publicView = action === 'go-login' ? 'login' : 'landing';
      if (publicView === 'login' && store.mode === 'live') loginMethod = 'credentials';
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      app.querySelector(publicView === 'login' ? '.udd-login-back' : '.udd-landing-brand')?.focus();
      break;
    case 'select-login-role':
      if (loginRole === id) break;
      loginRole = id;
      renderLogin();
      app.querySelector('[data-action="select-login-role"][aria-pressed="true"]')?.focus();
      break;
    case 'set-login-method':
      if (loginMethod === id) break;
      loginMethod = id;
      renderLogin();
      app.querySelector('[data-action="set-login-method"][aria-pressed="true"]')?.focus();
      break;
    case 'prefill-role':
      loginRole = id;
      renderLogin({ prefill: true });
      app.querySelector('#login-email')?.focus();
      break;
    case 'quick-login': {
      const targetRole = id || loginRole;
      publicView = 'landing';
      await stopGPS();
      store.setDemoRole(targetRole);
      portalTripId = '';
      page = targetRole === 'admin' ? 'overview' : targetRole;
      query = '';
      window.scrollTo({ top: 0, behavior: 'instant' });
      render();
      break;
    }
    case 'logout':
      publicView = 'landing';
      await stopGPS();
      await store.logout();
      break;
    case 'reset-demo':
      resetTripHistory();
      confirmModal(
        'Start fresh with sample data?',
        'This removes the demo changes saved in this browser.',
        'Reset demo',
        () => {
          store.reset();
          toast('Sample data restored.');
        }
      );
      break;
    case 'notifications':
      showModal(
        'A little heads-up.',
        'The latest updates from your fleet.',
        `<div class="activity-list notification-list">${activityItems(15)}</div><div class="modal-footer">${button('Close', 'close-modal')}</div>`
      );
      break;
    case 'add-campus':
      routeDraft.push({
        id: crypto.randomUUID(),
        stop_name: 'UDD main campus',
        latitude: 16.0436,
        longitude: 120.3417,
      });
      updateDraft();
      break;
    case 'remove-stop':
      routeDraft.splice(Number(id), 1);
      updateDraft();
      break;
    case 'setup':
      showModal(
        'Connect your school.',
        'Switch from sample data to your shared Supabase workspace.',
        `<ol class="support-list"><li>Create a Supabase project and run <code>supabase/schema.sql</code> in its SQL editor, then apply migrations <code>001_trip_history.sql</code> and <code>002_services_and_route_versions.sql</code> in numeric order.</li><li>Copy <code>.env.example</code> to <code>.env</code> and add your project URL and publishable/anon key.</li><li>Create Auth users, then link their IDs to fleet profiles. See the project README for the administrator setup query.</li><li>Disable public Realtime channels in Supabase settings and restart the app.</li></ol><div class="note">Never place a Supabase service-role key in this app. Full setup and deployment steps are in README.md.</div><div class="modal-footer">${button('Got it', 'close-modal', { primary: true })}</div>`
      );
      break;
    case 'help':
      showModal(
        'A smoother school run starts here.',
        'UDD Go · ITECC04 Data Structure and Algorithm Project.',
        `<ul class="support-list"><li><strong>Data Structures (ITECC04):</strong> Routes are modeled as directed <em>Graph Adjacency Lists</em> (O(V+E)) enforcing physical stop sequence; passenger manifests use <em>Hash Table indexing</em> (O(1)) for instantaneous boarding verification.</li><li><strong>Algorithmic Bounds:</strong> Dynamic capacity algorithm (O(N)) prevents bus overbooking; odometer threshold checks automate maintenance alerts.</li><li><strong>Fleet & Routes:</strong> Manage vehicles, assign drivers, and click the map to place ordered route stops.</li><li><strong>Drivers:</strong> Broadcast live GPS, record 1-tap boarding and alighting, and complete the post-trip cabin sweep.</li><li><strong>Students:</strong> Real-time bus arrival radar, pickup ETA, and digital boarding ID pass.</li><li><strong>Local Persistence:</strong> Built-in offline demo mode saves to browser storage without requiring external servers.</li></ul><div class="modal-footer">${button('Ready to go', 'close-modal', { primary: true })}</div>`
      );
      break;
  }
}

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-page]');
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.page);
    return;
  }
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    busFilter = filter.dataset.filter;
    render();
    return;
  }
  const target = event.target.closest('[data-action]');
  if (target) {
    event.preventDefault();
    if (target.disabled) return;
    try {
      await handleAction(target.dataset.action, target.dataset.id);
    } catch (e) {
      toast(e.message, true);
    }
  }
  if (event.target.classList.contains('modal-backdrop')) closeModal();
});
document.addEventListener('change', async (event) => {
  const target = event.target;
  if (['demo-role', 'settings-role'].includes(target.id)) {
    await stopGPS();
    if (target.value === 'logout') {
      publicView = 'landing';
      await store.logout();
      return;
    }
    portalTripId = '';
    page = target.value === 'admin' ? 'overview' : target.value;
    query = '';
    store.setDemoRole(target.value);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (target.id === 'map-route-filter') {
    routeFilter = target.value;
    render();
  }
  if (target.id === 'notification-toggle') {
    try {
      if (target.checked) {
        if (Capacitor.isNativePlatform()) {
          const result = await LocalNotifications.requestPermissions();
          if (result.display !== 'granted')
            throw new Error('Allow notifications in device settings to enable trip alerts.');
        } else if (
          !('Notification' in window) ||
          (await Notification.requestPermission()) !== 'granted'
        )
          throw new Error('Allow browser notifications to enable trip alerts.');
      }
      savePreferences({ notifications: target.checked });
      toast(target.checked ? 'Trip notifications enabled.' : 'Trip notifications turned off.');
    } catch (e) {
      target.checked = false;
      toast(e.message, true);
    }
  }
});
document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.stopIndex !== undefined) {
    routeDraft[Number(target.dataset.stopIndex)].stop_name = target.value;
    return;
  }
  if (['table-search', 'people-search', 'global-search'].includes(target.id)) {
    query = target.value;
    const caret = target.selectionStart;
    if (target.id === 'global-search' && !['fleet', 'students', 'drivers'].includes(page))
      page = 'fleet';
    const id = target.id;
    render();
    const input = document.getElementById(id);
    input?.focus();
    input?.setSelectionRange(caret, caret);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id === 'trip-history-filter') {
    event.preventDefault();
    try {
      await filterTripHistory(form);
      render();
    } catch (error) {
      toast(error.message, true);
    }
    return;
  }
  if (form.id === 'login-form') {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const f = new FormData(form);
      await store.login(f.get('email'), f.get('password'));
      page = store.profile.role === 'admin' ? 'overview' : store.profile.role;
      render();
    } catch (e) {
      form.querySelector('.form-error').textContent = e.message;
      submit.disabled = false;
    }
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault();
    document.querySelector('#global-search')?.focus();
  }
  if (event.key === 'Escape') {
    closeModal();
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('open');
  }
  if (event.key === 'Tab' && document.querySelector('[role="dialog"]')) {
    const elements = [
      ...document.querySelectorAll(
        '#modal-root button:not(:disabled),#modal-root input:not(:disabled),#modal-root select,#modal-root a[href],#modal-root textarea'
      ),
    ].filter((el) => el.offsetParent !== null);
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
store.addEventListener('change', () => {
  if (
    gpsRouteId &&
    !store.data.trips.some(
      (t) =>
        t.id === gpsRouteId &&
        t.status === 'active' &&
        (store.profile?.role === 'admin' || t.driver_id === store.profile?.id)
    )
  )
    stopGPS();
  render();
});
store.addEventListener('position', (event) => fleetMap?.update(event.detail));
store.addEventListener('connectionerror', (event) => toast(event.detail, true));
store.addEventListener('connection', (event) => {
  const status = document.querySelector('[data-live-status]');
  if (status)
    status.innerHTML = `<span class="live-dot"></span>${store.connected ? 'Connected' : event.detail === 'SUBSCRIBED' ? 'Connecting…' : 'Reconnecting…'}`;
});
store.addEventListener('trip', async ({ detail }) => {
  if (!preferences.notifications || store.profile?.role !== 'student') return;
  if (!store.visibleTrips().some((t) => t.id === detail.trip_id)) return;
  if (!['active', 'completed'].includes(detail.status)) return;
  const message =
    detail.status === 'active'
      ? 'Your school bus route has started. Be ready at your pickup stop.'
      : 'Your school bus route is complete.';
  toast(message);
  try {
    if (Capacitor.isNativePlatform())
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'UDD Go · Your journey',
            body: message,
            id: Math.floor(Date.now() / 1000) % 2147483647,
          },
        ],
      });
    else if ('Notification' in window && Notification.permission === 'granted')
      new Notification('UDD Go · Your journey', { body: message, icon: '/favicon.svg' });
  } catch {
    /* Device or browser blocked system notification; in-app toast already notified the student. */
  }
});

setInterval(() => {
  if (store.mode !== 'demo' || !store.profile || document.hidden || gpsWatch !== null) return;
  simulatedStep++;
  for (const trip of store.data.trips.filter((t) => t.status === 'active')) {
    const stops = trip.stops;
    if (stops.length < 2) continue;
    const progress = (simulatedStep * 0.015 + store.data.trips.indexOf(trip) * 0.17) % 0.92;
    const index = Math.floor(progress * (stops.length - 1)),
      ratio = progress * (stops.length - 1) - index;
    const from = stops[index],
      to = stops[index + 1];
    store.position({
      route_id: trip.route_id,
      trip_id: trip.id,
      location_epoch: trip.location_epoch,
      lat: from.latitude + (to.latitude - from.latitude) * ratio,
      lng: from.longitude + (to.longitude - from.longitude) * ratio,
      at: Date.now(),
    });
  }
}, 5000);

try {
  await store.init();
  configureMap(store.config);
  render();
} catch (error) {
  app.innerHTML = `<main class="boot-screen"><div class="empty">${icon('CircleAlert')}<h2>Let’s check your connection.</h2><p>${esc(error.message)}</p><button class="button primary" onclick="location.reload()">Try again</button></div></main>`;
  mountIcons();
}
