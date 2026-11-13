import './styles.css';
import { createIcons, LayoutDashboard, BusFront, Route, GraduationCap, Users, Wrench, Settings, CircleHelp, ChevronDown, ChevronRight, ChevronLeft, ArrowUpRight, ArrowRight, Plus, Download, Search, Bell, CalendarDays, MapPin, Navigation, LocateFixed, Menu, X, LogOut, Radio, CircleCheck, CircleAlert, Check, Clock3, ShieldCheck, Leaf, School, MoreHorizontal, Play, Square, UserRoundCheck, Trash2, ExternalLink, Mail, RefreshCw, Phone, Info, Gauge } from 'lucide';
import { store, preferences, savePreferences } from './store.js';
import { capacityFor, maintenanceStatus, escapeHtml as esc, csvCell } from './domain.js';
import { FleetMap, createStopEditor, configureMap } from './map.js';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

document.documentElement.classList.toggle('native-app', Capacitor.isNativePlatform());

const iconSet = { LayoutDashboard, BusFront, Route, GraduationCap, Users, Wrench, Settings, CircleHelp, ChevronDown, ChevronRight, ChevronLeft, ArrowUpRight, ArrowRight, Plus, Download, Search, Bell, CalendarDays, MapPin, Navigation, LocateFixed, Menu, X, LogOut, Radio, CircleCheck, CircleAlert, Check, Clock3, ShieldCheck, Leaf, School, MoreHorizontal, Play, Square, UserRoundCheck, Trash2, ExternalLink, Mail, RefreshCw, Phone, Info, Gauge };
const icon = name => `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g,'$1-$2').toLowerCase()}"></i>`;
const mountIcons = () => createIcons({icons:iconSet,attrs:{'aria-hidden':'true','stroke-width':1.75}});
const app = document.querySelector('#app');
let page = 'overview', selectedBus = 'bus-1', routeFilter = '', busFilter = 'all', query = '';
let fleetMap = null, modalMap = null, modalCleanup = null, modalReturnFocus = null, toastTimer, gpsWatch = null, gpsNative = false, simulatedStep = 0;
let routeDraft = [];
const titles = {overview:'Overview',fleet:'Fleet management',routes:'Routes & stops',students:'Students',drivers:'Drivers',maintenance:'Maintenance',activity:'Activity log',settings:'Settings',driver:'My route',student:'My journey'};
const statusNames = {active:'On route',idle:'Available',maintenance:'Maintenance',scheduled:'Scheduled',completed:'Completed',boarded:'On board',assigned:'Assigned',overdue:'Overdue',due_soon:'Due soon',healthy:'Up to date'};
const badge = status => `<span class="badge ${esc(status)}">${esc(statusNames[status] || status)}</span>`;
const initials = name => name?.split(' ').map(n=>n[0]).slice(0,2).join('') || '?';
const person = id => store.data.users.find(u => u.id === id);
const routeByBus = id => store.data.routes.find(r => r.bus_id === id);
const stopsFor = id => store.data.route_stops.filter(s => s.route_id === id).sort((a,b)=>a.stop_sequence-b.stop_sequence);
const formatNumber = n => Number(n || 0).toLocaleString('en-PH');
const routeCapacity = (bus,routeId,assignments=store.data.student_assignments) => store.routeSummaries.get(routeId) || capacityFor(bus,routeId,assignments);
const date = () => new Intl.DateTimeFormat('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date());
const timeAgo = value => {const mins = Math.floor(Math.max(0,Date.now()-new Date(value).getTime())/60000);return mins < 1 ? 'Just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins/60)} hr ago` : `${Math.floor(mins/1440)} days ago`;};
const departure = value => {const [h,m]=(value || '06:30').split(':').map(Number);return `${h%12 || 12}:${String(m).padStart(2,'0')} ${h>=12 ? 'PM' : 'AM'}`;};
const button = (label, action, {primary=false,id='',iconName='',className=''}={}) => `<button class="button ${primary ? 'primary' : ''} ${className}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${iconName ? icon(iconName) : ''}${label}</button>`;
const empty = (name, text, iconName='BusFront') => `<div class="empty">${icon(iconName)}<h3>${name}</h3><p>${text}</p></div>`;

function toast(message,error=false) {
  clearTimeout(toastTimer);
  document.querySelector('#toast-root').innerHTML = `<div class="toast ${error ? 'error' : ''}">${icon(error ? 'CircleAlert' : 'CircleCheck')}<span>${esc(message)}</span></div>`;
  mountIcons(); toastTimer = setTimeout(()=>document.querySelector('#toast-root').replaceChildren(),5000);
}

function navItem(key, name, iconName, count='') {
  return `<button class="nav-link ${page === key ? 'selected' : ''}" data-page="${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${name}</span>${count ? `<span class="nav-badge">${count}</span>` : ''}</button>`;
}

function shell(content) {
  const admin = store.profile.role === 'admin';
  const due = store.data.buses.filter(b=>maintenanceStatus(b).status !== 'healthy').length;
  return `<div class="sidebar-overlay" data-action="close-menu"></div><aside class="sidebar" aria-label="Main navigation">
    <a class="brand" href="#" data-page="${admin ? 'overview' : store.profile.role}" aria-label="UDD Go home"><span class="brand-icon">${icon('BusFront')}</span><div>UDD<span> Go</span></div></a>
    <div class="campus-switch"><span class="campus-icon">${icon('School')}</span><div><strong>Universidad de Dagupan</strong><small>Main campus · Dagupan City</small></div>${icon('ChevronDown')}</div>
    <div class="nav-label">Workspace</div><nav class="nav-list">${admin ? `${navItem('overview','Overview','LayoutDashboard')}${navItem('fleet','Fleet management','BusFront')}${navItem('routes','Routes & stops','Route')}${navItem('students','Students','GraduationCap')}${navItem('drivers','Drivers','Users')}${navItem('maintenance','Maintenance','Wrench',due)}` : navItem(store.profile.role,store.profile.role === 'driver' ? 'My route' : 'My journey',store.profile.role === 'driver' ? 'Route' : 'MapPin')}
    </nav><div class="nav-separator"></div><div class="nav-label">Manage</div><nav class="nav-list">${admin ? navItem('activity','Activity log','Clock3') : ''}${navItem('settings','Settings','Settings')}</nav>
    <div class="sidebar-bottom"><div class="help-card"><div class="help-icon">${icon('Leaf')}</div><strong>A little care. A safer journey.</strong><p>Keep your fleet ready for the road.</p><button class="link-button" data-action="help">Visit the help center ${icon('ArrowUpRight')}</button></div>
    <div class="sidebar-profile"><div class="avatar">${esc(initials(store.profile.name))}</div><div><strong>${esc(store.profile.name)}</strong><small>${admin ? 'Fleet administrator' : store.profile.role === 'driver' ? 'School bus driver' : 'Student account'}</small></div><button class="icon-button" data-action="${store.mode === 'demo' ? 'profile' : 'logout'}" aria-label="${store.mode === 'demo' ? 'Switch demo role' : 'Sign out'}">${icon(store.mode === 'demo' ? 'MoreHorizontal' : 'LogOut')}</button></div></div>
  </aside><div class="app-main"><header class="topbar"><div class="flex gap-8"><button class="icon-button menu-toggle" data-action="menu" aria-label="Open navigation">${icon('Menu')}</button><div class="mobile-brand">UDD<span> Go</span></div><div class="breadcrumbs">Workspace ${icon('ChevronRight')}<span class="current">${titles[page]}</span></div></div>
    <div class="top-actions">${admin ? `<label class="global-search">${icon('Search')}<input id="global-search" placeholder="Search your fleet…" aria-label="Search fleet" value="${esc(query)}"/><kbd>⌘ K</kbd></label>` : ''}${store.mode === 'demo' ? `<span class="mode-pill">${icon('Radio')}Demo mode</span><select id="demo-role" class="demo-switch" aria-label="Demo role"><option value="admin" ${admin?'selected':''}>Admin view</option><option value="driver" ${store.profile.role==='driver'?'selected':''}>Driver view</option><option value="student" ${store.profile.role==='student'?'selected':''}>Student view</option></select>` : `<span class="live-label">${icon('ShieldCheck')}Secure workspace</span>`}<span class="top-divider"></span><button class="icon-button" data-action="notifications" aria-label="View notifications">${icon('Bell')}${due ? '<span class="notification-dot"></span>' : ''}</button><div class="avatar">${esc(initials(store.profile.name))}</div></div></header>
    <main class="page" id="main-content">${content}<footer class="page-footer"><span>© ${new Date().getFullYear()} UDD Go. Every student. Every journey.</span><span>${store.mode==='demo' ? `${icon('Info')} Sample data · stored in this browser` : `${icon('ShieldCheck')} Access controlled by your fleet role`}</span></footer></main></div>`;
}

function pageHeader(title, subtitle, actions='') {
  return `<div class="page-header"><div class="page-intro"><div class="date">${icon('CalendarDays')}${date()}</div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="header-actions">${actions}</div>` : ''}</div>`;
}

function stats() {
  const {buses,student_assignments,users,routes}=store.data;
  const active = buses.filter(b=>b.status==='active').length;
  const boarded = student_assignments.filter(a=>a.status==='boarded').length;
  const students = users.filter(u=>u.role==='student').length;
  const due = buses.filter(b=>maintenanceStatus(b).status!=='healthy').length;
  return `<div class="summary-grid">
    ${stat('Total fleet',buses.length,'BusFront','',`${buses.filter(b=>b.status==='idle').length} buses available`,'Ready for the next journey')}
    ${stat('On the road',active,'Navigation','green',`${routes.filter(r=>r.status==='active').length} routes in progress`,'Trips currently running')}
    ${stat('Students on board',boarded,'GraduationCap','purple',`${students} registered students`,'Across your school routes')}
    ${stat('Maintenance alerts',due,'Wrench','orange',`${buses.filter(b=>maintenanceStatus(b).status==='overdue').length} service overdue`,due ? 'A little attention needed' : 'Your fleet is up to date')}
  </div>`;
}
function stat(label,value,iconName,color,detail,foot) {
  return `<div class="summary-card"><div class="summary-top"><span>${label}</span><span class="stat-icon ${color}">${icon(iconName)}</span></div><div class="summary-value">${value}</div><div class="summary-foot"><span class="${color==='orange'?'orange-text':'green-text'}">${detail}</span></div><div class="summary-foot">${foot}</div></div>`;
}

function trackingDetail() {
  const bus = store.data.buses.find(b=>b.id===selectedBus && (!routeFilter || routeByBus(b.id)?.id===routeFilter)) || store.data.buses.find(b=>b.status==='active' && (!routeFilter || routeByBus(b.id)?.id===routeFilter));
  if (!bus) return empty('A quieter moment','Start a route to see bus details here.','Navigation');
  selectedBus=bus.id;
  const route=routeByBus(bus.id),driver=person(route?.driver_id),capacity=route ? routeCapacity(bus,route.id,store.data.student_assignments) : {boarded:0};
  return `<div class="detail-label">Fleet in focus ${icon('Radio')}</div><div class="bus-title"><span class="vehicle-icon">${icon('BusFront')}</span><div><h3>${esc(bus.label)}</h3><p>${esc(bus.plate_number)}</p></div>${badge(bus.status)}</div><div class="driver-mini"><span class="avatar peach">${esc(initials(driver?.name))}</span><div><strong>${esc(driver?.name || 'Unassigned')}</strong>Assigned driver</div></div>
    <div class="occupancy"><div class="between"><span>Students on board</span><strong>${capacity.boarded} <span class="muted">/ ${bus.capacity}</span></strong></div><div class="progress"><span style="width:${Math.min(100,capacity.boarded/bus.capacity*100)}%"></span></div></div>
    <div class="stop-timeline">${timeline(stopsFor(route?.id).slice(-3))}</div><div class="detail-bottom between"><span class="small muted" style="font-size:9px">${store.mode==='demo'?'Simulated location':'Location updates via GPS'}</span><button class="link-button" data-action="bus-detail" data-id="${esc(bus.id)}">View details ${icon('ArrowRight')}</button></div>`;
}
function timeline(stops, selectedStop='') {
  return stops.map((s,i)=>`<div class="stop-item ${(selectedStop ? s.id===selectedStop : i===0) ? 'current' : ''}"><span class="stop-dot"></span><div><strong>${esc(s.stop_name)}</strong><small>${selectedStop && s.id===selectedStop ? 'Your pickup stop' : i===stops.length-1 ? 'Route destination' : `Stop ${s.stop_sequence}`}</small></div></div>`).join('');
}
function mapToolbar(allowFilter=true) {
  return `<div class="map-toolbar">${allowFilter ? `<select id="map-route-filter" aria-label="Filter map by route"><option value="">All routes</option>${store.data.routes.map(r=>`<option value="${esc(r.id)}" ${r.id===routeFilter?'selected':''}>${esc(r.route_name)}</option>`).join('')}</select>` : '<span></span>'}<button class="button" data-action="recenter" aria-label="Fit all route stops">${icon('LocateFixed')}</button></div>`;
}
function overview() {
  return `${pageHeader('Every journey, in view.','A little oversight. A safer way to school.',`${button('<span class="export-label">Export report</span>','export',{iconName:'Download',className:'export-button'})}${button('Add bus','add-bus',{primary:true,iconName:'Plus'})}`)}${stats()}
    <section class="card tracking-card"><div class="card-head tracking-head"><div><h2>Live fleet tracking <span class="count">${store.data.buses.filter(b=>b.status==='active').length}</span></h2><p>A clear view of the road ahead.</p></div><span class="live-label" data-live-status><span class="live-dot"></span>${store.mode==='demo'?'Demo simulation':store.connected?'Connected':'Connecting…'}</span></div><div class="tracking-layout"><div class="map-wrap"><div id="fleet-map" class="fleet-map" aria-label="Interactive school bus route map"></div>${mapToolbar()}<div class="map-legend">${store.data.routes.slice(0,3).map(r=>`<span><i style="--c:${safeColor(r.color)}"></i>${esc(r.area || r.route_name)}</span>`).join('')}</div><div class="map-disclaimer">Stop connections · not road directions</div></div><aside class="tracking-detail" id="tracking-detail">${trackingDetail()}</aside></div></section>
    <div class="bottom-grid"><section class="card"><div class="card-head"><h2>Your fleet <span class="count">${store.data.buses.length}</span></h2><button class="link-button" data-page="fleet">View all buses ${icon('ArrowUpRight')}</button></div>${busTable(store.data.buses.slice(0,4))}<div class="table-footer"><span>${Math.min(4,store.data.buses.length)} of ${store.data.buses.length} buses</span><span>Built for safer school runs</span></div></section><section class="card"><div class="card-head"><h2>Recent activity</h2><button class="icon-button" data-page="activity" aria-label="View all activity">${icon('MoreHorizontal')}</button></div><div class="activity-list">${activityItems(4)}</div></section></div>`;
}
function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(value) ? value : '#38bdf8'; }
function busTable(buses,full=false) {
  if (!buses.length) return empty('No buses found','Add a bus or try another search.');
  return `<div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Assigned route</th><th class="table-driver">Driver</th><th>On board</th><th>Status</th>${full?'<th>Odometer</th>':''}<th><span class="sr-only">Actions</span></th></tr></thead><tbody>${buses.map(bus=>{
    const route=routeByBus(bus.id),driver=person(route?.driver_id),cap=route?routeCapacity(bus,route.id,store.data.student_assignments):{boarded:0};
    return `<tr><td><div class="table-person"><span class="vehicle-icon">${icon('BusFront')}</span><div><strong>${esc(bus.label)}</strong><small>${esc(bus.plate_number)}</small></div></div></td><td><span class="table-route">${route?`<i class="route-dot" style="--c:${safeColor(route.color)}"></i>${esc(route.route_name)}`:'<span class="muted">Unassigned</span>'}</span></td><td class="table-driver"><span class="muted">${esc(driver?.name || '—')}</span></td><td><div class="table-capacity"><span><strong>${cap.boarded}</strong> / ${bus.capacity}</span><div class="progress"><span style="width:${cap.boarded/bus.capacity*100}%"></span></div></div></td><td>${badge(bus.status)}</td>${full?`<td class="muted">${formatNumber(bus.current_mileage)} km</td>`:''}<td><button class="icon-button" data-action="bus-detail" data-id="${esc(bus.id)}" aria-label="View ${esc(bus.label)} details">${icon('MoreHorizontal')}</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function activityItems(limit=100) {
  const events=store.data.activity.slice(0,limit);
  if(!events.length) return '<div class="empty"><p>Your fleet activity will appear here.</p></div>';
  return events.map(a=>`<div class="activity-item"><span class="activity-icon ${esc(a.type)}">${icon(a.type==='boarding'?'UserRoundCheck':a.type==='route'?'Route':a.type==='maintenance'?'Wrench':'CircleCheck')}</span><div class="activity-text"><strong>${esc(a.message)}</strong>${a.detail?`<p>${esc(a.detail)}</p>`:''}<time datetime="${esc(a.created_at)}">${timeAgo(a.created_at)}</time></div></div>`).join('');
}
function fleet() {
  const buses=store.data.buses.filter(b=>(busFilter==='all'||b.status===busFilter) && [b.label,b.plate_number,routeByBus(b.id)?.route_name,person(routeByBus(b.id)?.driver_id)?.name].join(' ').toLowerCase().includes(query.toLowerCase()));
  return `${pageHeader('A fleet you can count on.','Manage your buses and keep every school run moving.',`${button('Export fleet','export',{iconName:'Download'})}${button('Add bus','add-bus',{primary:true,iconName:'Plus'})}`)}${stats()}<section class="card"><div class="card-head"><h2>All vehicles <span class="count">${store.data.buses.length}</span></h2><span class="small muted">One place for your entire fleet</span></div><div class="table-toolbar"><div class="filter-tabs">${[['all','All buses'],['active','On route'],['idle','Available'],['maintenance','Maintenance']].map(([key,label])=>`<button class="filter-tab ${busFilter===key?'selected':''}" data-filter="${key}">${label}</button>`).join('')}</div><label class="table-search">${icon('Search')}<input id="table-search" aria-label="Search buses" placeholder="Search buses…" value="${esc(query)}"/></label></div><div id="bus-table-results">${busTable(buses,true)}</div><div class="table-footer">${buses.length} ${buses.length===1?'bus':'buses'} found <span>Capacity is checked before assignment</span></div></section>`;
}
function routes() {
  return `${pageHeader('Better routes. Smoother mornings.','Connect your stops, buses, drivers, and students.',button('Create route','add-route',{primary:true,iconName:'Plus'}))}<div class="route-grid">${store.data.routes.map(route=>{
    const bus=store.data.buses.find(b=>b.id===route.bus_id),driver=person(route.driver_id),cap=routeCapacity(bus,route.id,store.data.student_assignments);
    return `<article class="card route-card" style="--route-color:${safeColor(route.color)}"><div class="between">${badge(route.status)}<span class="small muted">${stopsFor(route.id).length} stops</span></div><h3>${esc(route.route_name)}</h3><p>${esc(route.area || 'Dagupan City')} · ${departure(route.departure_time)} departure</p><div class="route-meta"><div><span>Assigned bus</span>${esc(bus?.label || 'Unassigned')}</div><div><span>Driver</span>${esc(driver?.name || 'Unassigned')}</div></div><div class="occupancy"><div class="between"><span>Students assigned</span><strong>${cap.assigned} / ${bus.capacity}</strong></div><div class="progress"><span style="background:${safeColor(route.color)};width:${cap.assigned/bus.capacity*100}%"></span></div></div><div class="between"><span class="small muted">${cap.available} seats available</span><button class="link-button" data-action="route-detail" data-id="${esc(route.id)}">View route ${icon('ArrowRight')}</button></div></article>`;
  }).join('')}</div>${!store.data.routes.length?`<section class="card">${empty('Your first route starts here','Create a route and place at least two stops on the map.','Route')}</section>`:''}`;
}
function people(role) {
  const students=role==='student';
  const users=store.data.users.filter(u=>u.role===role && [u.name,u.student_code,u.id,u.contact_number].join(' ').toLowerCase().includes(query.toLowerCase()));
  return `${pageHeader(students?'Every student, accounted for.':'The people behind every journey.',students?'Assign students to routes with room to spare.':'Manage driver profiles and route assignments.',button(students?'Add student':'Add driver',students?'add-student':'add-driver',{primary:true,iconName:'Plus'}))}<section class="card"><div class="card-head"><h2>${students?'Student directory':'Your drivers'} <span class="count">${users.length}</span></h2><label class="table-search">${icon('Search')}<input id="people-search" aria-label="Search ${role}s" placeholder="Search ${role}s…" value="${esc(query)}"/></label></div>${!users.length?empty('No matching profiles',`Add a ${role} or try another search.`,students?'GraduationCap':'Users'):`<div class="table-wrap"><table><thead><tr><th>${students?'Student':'Driver'}</th><th>Contact number</th><th>Assigned route</th><th>${students?'Pickup stop':'Vehicle'}</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${users.map((user,i)=>{
    const assignment=students?store.data.student_assignments.find(a=>a.student_id===user.id && a.status!=='cancelled'):null;
    const route=students?store.data.routes.find(r=>r.id===assignment?.route_id):store.data.routes.find(r=>r.driver_id===user.id);
    const bus=store.data.buses.find(b=>b.id===route?.bus_id),stop=store.data.route_stops.find(s=>s.id===assignment?.stop_id);
    return `<tr><td><div class="table-person"><span class="avatar ${i%2?'lavender':'blue'}">${esc(initials(user.name))}</span><div><strong>${esc(user.name)}</strong><small>${students?esc(user.student_code || user.id):'School bus driver'}</small></div></div></td><td class="muted">${esc(user.contact_number || '—')}</td><td><span class="table-route">${route?`<i class="route-dot" style="--c:${safeColor(route.color)}"></i>${esc(route.route_name)}`:'Unassigned'}</span></td><td class="muted">${esc(students?stop?.stop_name || '—':bus?.label || '—')}</td><td>${badge(students?(assignment?.status || 'idle'):(route?.status==='active'?'active':'idle'))}</td><td>${students?(assignment?`<button class="icon-button" data-action="unassign-student" data-id="${esc(assignment.id)}" aria-label="Remove ${esc(user.name)} route assignment">${icon('X')}</button>`:`<button class="link-button" data-action="assign-student" data-id="${esc(user.id)}">Assign route ${icon('Plus')}</button>`):`<button class="icon-button" data-action="person-detail" data-id="${esc(user.id)}" aria-label="View ${esc(user.name)}">${icon('MoreHorizontal')}</button>`}</td></tr>`;
  }).join('')}</tbody></table></div>`}<div class="table-footer"><span>${users.length} ${students?'students':'drivers'}</span><span>${students?'Boarding requires a valid route assignment':'Each driver is assigned to one route'}</span></div></section>`;
}
function maintenance() {
  const sorted=[...store.data.buses].sort((a,b)=>maintenanceStatus(a).remaining-maintenanceStatus(b).remaining);
  return `${pageHeader('Ready for the road.','Stay ahead of service intervals with odometer-based alerts.')}${stats()}<div class="maintenance-grid">${sorted.map(bus=>{
    const {remaining,status}=maintenanceStatus(bus);
    return `<article class="card maintenance-card"><div class="bus-title"><span class="vehicle-icon">${icon('Wrench')}</span><div><h3>${esc(bus.label)}</h3><p>${esc(bus.plate_number)}</p></div>${badge(status)}</div><span class="small muted">Current odometer</span><div class="mileage-value">${formatNumber(bus.current_mileage)} <small>km</small></div><div class="progress"><span style="width:${Math.min(100,bus.current_mileage/bus.next_service_mileage*100)}%;background:${remaining<=0?'#d6a56b':remaining<=500?'#debe80':'#7cbaa7'}"></span></div><p class="muted small">${remaining<=0?`${formatNumber(Math.abs(remaining))} km past service interval`:`${formatNumber(remaining)} km until next service`}<br/>Next service at ${formatNumber(bus.next_service_mileage)} km</p>${button('Record maintenance','service-bus',{id:bus.id,iconName:'Check',className:'full'})}</article>`;
  }).join('')}</div>`;
}
function settings() {
  return `${pageHeader('Make yourself at home.','Your workspace, connection, and notification preferences.')}<div class="settings-grid"><section class="card"><div class="card-head"><h2>Workspace</h2></div><div class="settings-body"><div class="setting-row"><div><strong>School</strong><p>Universidad de Dagupan</p></div><span class="setting-value">Main campus</span></div><div class="setting-row"><div><strong>Timezone</strong><p>All school times use Philippine Standard Time.</p></div><span class="setting-value">Asia/Manila</span></div><div class="setting-row"><div><strong>Signed in as</strong><p>${esc(store.profile.name)}</p></div><span class="setting-value">${esc(store.profile.role)}</span></div><div class="setting-row"><div><strong>Trip notifications</strong><p>Notify this device when your assigned trip starts or ends.</p></div><input id="notification-toggle" type="checkbox" class="toggle" aria-label="Trip notifications" ${preferences.notifications?'checked':''}/></div>${store.mode==='demo'?`<div class="setting-row"><div><strong>Preview another role</strong><p>Explore the driver or student experience.</p></div><select id="settings-role" aria-label="Switch demo role"><option value="admin" ${store.profile.role==='admin'?'selected':''}>Administrator</option><option value="driver" ${store.profile.role==='driver'?'selected':''}>Driver</option><option value="student" ${store.profile.role==='student'?'selected':''}>Student</option></select></div><div class="setting-row"><div><strong>Restore sample data</strong><p>Clear demo changes and start fresh.</p></div>${button('Reset demo','reset-demo')}</div>`:''}</div></section><div class="stack"><section class="card"><div class="card-head"><h2>Connection</h2>${store.mode==='demo'?'<span class="mode-pill">Demo mode</span>':badge('healthy')}</div><div class="settings-body"><div class="note">${store.mode==='demo'?'You are exploring sample records. Changes stay in this browser. Open a second tab to try live demo boarding and trip updates.':'Connected to Supabase. Your account role controls the records and location channels you can access.'}</div><div class="setting-row"><div><strong>${store.mode==='demo'?'Connect your school':'Data refresh'}</strong><p>${store.mode==='demo'?'Add your Supabase project keys to enable authentication and shared data.':'Fetch the latest shared records from your school.'}</p></div>${button(store.mode==='demo'?'Setup guide':'Refresh',store.mode==='demo'?'setup':'refresh',{iconName:store.mode==='demo'?'ExternalLink':'RefreshCw'})}</div></div></section><section class="card"><div class="card-head"><h2>A little help goes a long way.</h2></div><div class="settings-body"><p class="muted small">Find your way around routes, boarding, and school transport.</p><div style="margin-top:18px">${button('Open help center','help',{iconName:'CircleHelp'})}</div></div></section></div></div>`;
}
function portal() {
  const isDriver=store.profile.role==='driver';
  const assignment=!isDriver?store.data.student_assignments.find(a=>a.student_id===store.profile.id && a.status!=='cancelled'):null;
  const route=isDriver?store.data.routes.find(r=>r.driver_id===store.profile.id):store.data.routes.find(r=>r.id===assignment?.route_id);
  if(!route) return `${pageHeader(`Hello, ${esc(store.profile.name.split(' ')[0])}.`,isDriver?'Your next school run starts here.':'A safer way to school.')}<section class="card">${empty('Your route is on its way',`Ask your fleet administrator to assign ${isDriver?'a bus and route':'your pickup stop and route'}.`,'Route')}</section>`;
  const bus=store.data.buses.find(b=>b.id===route.bus_id),driver=person(route.driver_id),cap=routeCapacity(bus,route.id,store.data.student_assignments);
  return `${pageHeader(isDriver?`Hello, ${esc(store.profile.name.split(' ')[0])}.`:'Your school journey, connected.',isDriver?'A smooth school run starts with you.':'Follow your bus and keep your morning a little calmer.')}<div class="portal-grid"><section class="card portal-map"><div class="card-head"><div><h2>${esc(route.route_name)}</h2><p>${isDriver?'Your assigned school route':'Your bus location and pickup stops'}</p></div>${badge(route.status)}</div><div class="map-wrap"><div id="fleet-map" class="fleet-map" aria-label="Your assigned bus route map"></div>${mapToolbar(false)}<div class="map-disclaimer">${store.mode==='demo'?'Demo simulation · ':''}Stop connections · not road directions</div></div></section><div class="portal-sidebar"><section class="card trip-card"><h2>${isDriver?'Your trip at a glance':'Your ride to campus'}</h2><div class="bus-title"><span class="vehicle-icon">${icon('BusFront')}</span><div><h3>${esc(bus.label)}</h3><p>${esc(bus.plate_number)}</p></div>${badge(bus.status)}</div><div class="driver-mini"><span class="avatar peach">${esc(initials(driver?.name))}</span><div><strong>${esc(driver?.name || 'Your driver')}</strong>${esc(driver?.contact_number || 'School bus driver')}</div></div><div class="trip-info"><div class="between"><span>Departure</span><strong>${departure(route.departure_time)}</strong></div><div class="between"><span>Students on board</span><strong>${cap.boarded} / ${bus.capacity}</strong></div><div class="between"><span>Route stops</span><strong>${stopsFor(route.id).length} stops</strong></div>${!isDriver?`<div class="between"><span>Your status</span>${badge(assignment.status)}</div>`:''}</div>
    ${isDriver?`<div class="trip-actions">${route.status==='active'?`${button('Enable GPS sharing','enable-gps',{primary:true,id:route.id,iconName:'LocateFixed'})}${button('End route','end-route',{id:route.id,iconName:'Square'})}`:button('Start route','start-route',{primary:true,id:route.id,iconName:'Play'})}</div><p id="gps-status" class="muted small" style="font-size:10px;margin-top:10px">${gpsWatch!==null?'Sharing this device’s location.':store.mode==='demo'?'Sample bus locations are simulated. GPS sharing uses this device when enabled.':'Enable GPS sharing during your active trip.'}</p><div class="boarding-form"><h3>Student boarding</h3><p>Enter a student ID to verify their route.</p><form id="boarding-form" data-route="${esc(route.id)}"><input name="student_code" aria-label="Student ID" placeholder="e.g. UDD-0005" required maxlength="40" autocomplete="off" ${route.status!=='active'?'disabled':''}/><button class="button primary" type="submit" ${route.status!=='active'?'disabled':''}>${icon('UserRoundCheck')}Board</button></form></div>`:`<div class="note">${route.status==='active'?'Your bus is on the road. Be ready at your assigned pickup stop.':'Your trip has not started. Your bus will appear when your driver starts the route.'}</div><div class="student-pass"><span>Your student boarding ID</span><strong>${esc(store.profile.student_code || store.profile.id)}</strong><p>Share this ID with your driver when boarding.</p></div>`}</section><section class="card trip-card"><h2>${isDriver?'Your route stops':'Your pickup & destination'}</h2><div class="stop-timeline">${timeline(stopsFor(route.id),assignment?.stop_id)}</div></section></div></div>${isDriver?`<section class="card" style="margin-top:22px"><div class="card-head"><h2>Passenger list <span class="count">${cap.assigned}</span></h2><span class="small muted">${cap.boarded} students on board</span></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Boarding ID</th><th>Pickup stop</th><th>Status</th></tr></thead><tbody>${store.data.student_assignments.filter(a=>a.route_id===route.id && a.status!=='cancelled').map(a=>{const u=person(a.student_id);return `<tr><td>${esc(u?.name || 'Student')}</td><td class="muted">${esc(u?.student_code || u?.id)}</td><td class="muted">${esc(store.data.route_stops.find(s=>s.id===a.stop_id)?.stop_name || '—')}</td><td>${badge(a.status)}</td></tr>`;}).join('')}</tbody></table></div></section>`:''}`;
}

function render() {
  fleetMap?.destroy();fleetMap=null;
  if(!store.profile) { renderLogin();return; }
  if(store.profile.role!=='admin' && ![store.profile.role,'settings'].includes(page)) page=store.profile.role;
  if(store.profile.role==='admin' && ['driver','student'].includes(page)) page='overview';
  const views={overview,fleet,routes,students:()=>people('student'),drivers:()=>people('driver'),maintenance,settings,driver:portal,student:portal,activity:()=>`${pageHeader('The story of your school runs.','Boarding, trips, and fleet updates in one place.',button('Refresh','refresh',{iconName:'RefreshCw'}))}<section class="card"><div class="card-head"><h2>Fleet activity <span class="count">${store.data.activity.length}</span></h2></div><div class="activity-list">${activityItems()}</div></section>`};
  app.innerHTML=shell((views[page] || overview)());
  mountIcons();mountMap();
  document.title=`${titles[page]} · UDD Go`;
}
function mountMap() {
  const element=document.querySelector('#fleet-map');
  if(!element)return;
  let ownRoute=routeFilter;
  if(store.profile.role==='driver')ownRoute=store.data.routes.find(r=>r.driver_id===store.profile.id)?.id;
  if(store.profile.role==='student')ownRoute=store.data.student_assignments.find(a=>a.student_id===store.profile.id)?.route_id;
  fleetMap=new FleetMap(element,store.data,{selected:selectedBus,demo:store.mode==='demo',routeId:page==='overview'?routeFilter:ownRoute,onSelect:id=>{
    selectedBus=id;fleetMap.highlight(id);
    const panel=document.querySelector('#tracking-detail');if(panel){panel.innerHTML=trackingDetail();mountIcons();}
  }});
}
function navigate(next) {
  page=next;query='';busFilter='all';routeFilter='';render();window.scrollTo({top:0,behavior:'instant'});
}

function renderLogin() {
  app.innerHTML=`<main class="login-page"><div class="login-brand-panel"><div class="brand"><span class="brand-icon">${icon('BusFront')}</span><div>UDD<span> Go</span></div></div><div><h1>Every student.<br/>A safer journey.</h1><p>School transport, connected. One place for your fleet, your routes, and the people who make it all move.</p></div><p class="small">Universidad de Dagupan · School transport</p></div><div class="login-panel"><h2>Good to see you.</h2><p>Sign in to your school transport workspace.</p><form id="login-form"><label class="field">School email<input type="email" name="email" autocomplete="username" placeholder="you@school.edu.ph" required/></label><label class="field">Password<input type="password" name="password" autocomplete="current-password" minlength="6" required/></label><div class="form-error" role="alert"></div><button type="submit" class="button primary full">Sign in ${icon('ArrowRight')}</button><p class="muted small">Need an account? Contact your fleet administrator.</p></form></div></main>`;mountIcons();
}

function showModal(title,subtitle,body,{wide=false,onSubmit=null,cleanup=null}={}) {
  closeModal();modalReturnFocus=document.activeElement;modalCleanup=cleanup;
  document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal ${wide?'wide':''}" tabindex="-1"><div class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('X')}</button></div><div class="modal-body">${body}</div></section></div>`;
  document.body.style.overflow='hidden';mountIcons();
  const form=document.querySelector('#modal-root form');
  if(form && onSubmit)form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    const error=form.querySelector('.form-error');error.textContent='';
    try{await onSubmit(new FormData(form));}catch(e){error.textContent=e.message;}finally{if(submit.isConnected)submit.disabled=false;}
  });
  setTimeout(()=>{const first=document.querySelector('#modal-root input,#modal-root select,#modal-root .modal');first?.focus();},50);
}
function closeModal() {
  modalMap?.destroy();modalMap=null;modalCleanup?.();modalCleanup=null;
  document.querySelector('#modal-root').replaceChildren();document.body.style.overflow='';
  if(modalReturnFocus?.isConnected)modalReturnFocus.focus();modalReturnFocus=null;
}
const formFooter = label => `<div class="form-error" role="alert"></div><div class="modal-footer">${button('Cancel','close-modal')}<button class="button primary" type="submit">${label}${icon('Check')}</button></div>`;
const inputField = (label,name,{type='text',value='',placeholder='',min='',max='',required=true,help=''}={})=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${required?'required':''} ${min!==''?`min="${min}"`:''} ${max!==''?`max="${max}"`:''} ${type==='text'?'maxlength="100"':''}/>${help?`<small>${help}</small>`:''}</label>`;
const selectField=(label,name,options)=>`<label class="field">${label}<select name="${name}" required>${options}</select></label>`;
function addBusModal(busId='') {
  const bus=store.data.buses.find(b=>b.id===busId);
  if(bus?.status==='active'){toast('End the active trip before editing this bus.',true);return;}
  showModal(bus?'Keep your fleet up to date.':'A new addition to your fleet.',bus?`Update the details for ${esc(bus.label)}.`:'Add the essentials. Your bus will be ready for a route.',`<form>${inputField('Vehicle name','label',{placeholder:'e.g. Bus 07',value:bus?.label || ''})}${inputField('Plate number','plate_number',{placeholder:'e.g. NCF 7301',value:bus?.plate_number || ''})}<div class="field-row">${inputField('Seat capacity','capacity',{type:'number',min:1,max:100,value:bus?.capacity || 30})}${inputField('Current odometer (km)','current_mileage',{type:'number',min:bus?.current_mileage || 0,max:10000000,value:bus?.current_mileage || 0})}</div>${inputField('Next service at (km)','next_service_mileage',{type:'number',min:1,max:10000000,value:bus?.next_service_mileage || 5000})}${bus?selectField('Vehicle status','status',`<option value="idle" ${bus.status==='idle'?'selected':''}>Available</option><option value="maintenance" ${bus.status==='maintenance'?'selected':''}>In maintenance</option>`):''}${formFooter(bus?'Save changes':'Add bus')}</form>`,{onSubmit:async f=>{await store.action(bus?'update_bus':'add_bus',{...(bus?{bus_id:bus.id,status:f.get('status')}:{}),label:f.get('label').trim(),plate_number:f.get('plate_number').trim().toUpperCase(),capacity:Number(f.get('capacity')),current_mileage:Number(f.get('current_mileage')),next_service_mileage:Number(f.get('next_service_mileage'))});closeModal();toast(bus?'Bus details updated.':'Bus added to your fleet.');}});
}
function addPersonModal(role) {
  showModal(role==='driver'?'Meet your next driver.':'Welcome a student aboard.',role==='driver'?'Add a driver profile, then assign a route.':'Add a profile, then choose their route and pickup stop.',`<form>${inputField('Full name','name',{placeholder:role==='driver'?'e.g. Juan Dela Cruz':'e.g. Maria Santos'})}${role==='student'?inputField('Student ID','student_code',{placeholder:'e.g. UDD-0025'}):''}${inputField('Contact number','contact_number',{type:'tel',placeholder:'e.g. 0917 123 4567'})}${store.mode==='live'?'<div class="note">This creates a fleet profile. Link an existing Supabase Auth account to this profile using the setup guide to enable sign-in.</div>':''}${formFooter(role==='driver'?'Add driver':'Add student')}</form>`,{onSubmit:async f=>{await store.action('add_person',{role,name:f.get('name').trim(),contact_number:f.get('contact_number').trim(),student_code:role==='student'?f.get('student_code').trim().toUpperCase():null});closeModal();toast(`${role==='driver'?'Driver':'Student'} profile added.`);}});
}
function routeModal() {
  routeDraft=[];
  const buses=store.data.buses.filter(b=>b.status!=='maintenance' && !routeByBus(b.id));
  const drivers=store.data.users.filter(u=>u.role==='driver' && !store.data.routes.some(r=>r.driver_id===u.id));
  if(!buses.length || !drivers.length){showModal('Make room for a new route.','Every route needs its own bus and driver.',`<div class="note">${!buses.length?'Add an available bus. ':''}${!drivers.length?'Add an unassigned driver. ':''}Then return here to create your route.</div><div class="modal-footer">${button('Close','close-modal')}${!buses.length?button('Add bus','add-bus',{primary:true}):button('Add driver','add-driver',{primary:true})}</div>`);return;}
  showModal('A better way to campus.','Name your route and click the map to place stops in travel order.',`<form><div class="route-editor"><div class="stack">${inputField('Route name','route_name',{placeholder:'e.g. Malasiqui morning loop'})}<div class="field-row">${inputField('Area','area',{placeholder:'e.g. Malasiqui'})}${inputField('Departure time','departure_time',{type:'time',value:'06:30'})}</div>${selectField('Assign bus','bus_id',buses.map(b=>`<option value="${esc(b.id)}">${esc(b.label)} · ${b.capacity} seats</option>`).join(''))}${selectField('Assign driver','driver_id',drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join(''))}${selectField('Route color','color','<option value="#2ba9e0">Sky blue</option><option value="#8b80cb">Lavender</option><option value="#4fa98d">Sage green</option><option value="#daaa52">Warm amber</option>')}<div class="note">Connect at least two stops. Lines show stop order; drivers should use road navigation for directions.</div></div><div><p class="stop-editor-heading">Click the map to add a stop. Use the campus button for UDD.</p><div id="stop-editor-map" class="stop-editor-map"></div><div class="between" style="margin-top:9px"><span class="small muted" id="stop-count">0 stops added</span><button class="link-button" data-action="add-campus">${icon('School')}Add UDD campus</button></div><div id="stop-editor-list" class="stop-editor-list"></div></div></div>${formFooter('Create route')}</form>`,{wide:true,onSubmit:async f=>{
    if(routeDraft.length<2)throw new Error('Add at least two stops to the map.');
    if(routeDraft.some(s=>!s.stop_name.trim()))throw new Error('Give every stop a name.');
    await store.action('add_route',{route_name:f.get('route_name').trim(),area:f.get('area').trim(),departure_time:f.get('departure_time'),bus_id:f.get('bus_id'),driver_id:f.get('driver_id'),color:f.get('color'),stops:routeDraft.map(s=>({...s,stop_name:s.stop_name.trim()}))});closeModal();toast('Route created. Time to welcome your students.');
  }});
  modalMap=createStopEditor(document.querySelector('#stop-editor-map'),(lat,lng)=>{routeDraft.push({stop_name:`Stop ${routeDraft.length+1}`,latitude:lat,longitude:lng});updateDraft();});
}
function updateDraft() {
  document.querySelector('#stop-editor-list').innerHTML=routeDraft.map((s,i)=>`<div class="stop-editor-row"><span>${i+1}</span><input data-stop-index="${i}" aria-label="Name for stop ${i+1}" value="${esc(s.stop_name)}" maxlength="100" required/><button type="button" class="icon-button" data-action="remove-stop" data-id="${i}" aria-label="Remove stop ${i+1}">${icon('X')}</button></div>`).join('');
  document.querySelector('#stop-count').textContent=`${routeDraft.length} stops added`;modalMap.update(routeDraft);mountIcons();
}
function assignModal(studentId) {
  const routes=store.data.routes.filter(r=>routeCapacity(store.data.buses.find(b=>b.id===r.bus_id),r.id,store.data.student_assignments).available>0);
  if(!routes.length){showModal('A seat is worth waiting for.','There are no routes with available seats.',`<div class="note">Create a route with an available bus before assigning this student.</div><div class="modal-footer">${button('Close','close-modal')}${button('Create route','add-route',{primary:true})}</div>`);return;}
  showModal('Find their way to school.',`Assign a route and pickup stop for ${esc(person(studentId)?.name)}.`,`<form>${selectField('Route','route_id',routes.map(r=>`<option value="${esc(r.id)}">${esc(r.route_name)}</option>`).join(''))}<div id="assign-stop-field"></div><div class="note" id="assignment-capacity"></div>${formFooter('Assign student')}</form>`,{onSubmit:async f=>{await store.action('assign_student',{student_id:studentId,route_id:f.get('route_id'),stop_id:f.get('stop_id')});closeModal();toast('Student assigned to their route.');}});
  const update=()=>{
    const routeId=document.querySelector('[name="route_id"]').value;
    const route=store.data.routes.find(r=>r.id===routeId),bus=store.data.buses.find(b=>b.id===route.bus_id),cap=routeCapacity(bus,route.id,store.data.student_assignments);
    document.querySelector('#assign-stop-field').innerHTML=selectField('Pickup stop','stop_id',stopsFor(routeId).map(s=>`<option value="${esc(s.id)}">${esc(s.stop_name)}</option>`).join(''));
    document.querySelector('#assignment-capacity').textContent=`${bus.label} has ${cap.available} of ${bus.capacity} seats available.`;
  };update();document.querySelector('[name="route_id"]').addEventListener('change',update);
}
function busDetail(id) {
  const bus=store.data.buses.find(b=>b.id===id);if(!bus)return;
  const route=routeByBus(id),driver=person(route?.driver_id),cap=route?routeCapacity(bus,route.id,store.data.student_assignments):{assigned:0,boarded:0};
  showModal(esc(bus.label),esc(bus.plate_number),`<div class="bus-title"><span class="vehicle-icon">${icon('BusFront')}</span><div><h3>${esc(route?.route_name || 'Ready for an assignment')}</h3><p>${esc(driver?.name || 'No driver assigned')}</p></div>${badge(bus.status)}</div><div class="modal-detail-list">${[['Seat capacity',`${bus.capacity} seats`],['Students assigned',cap.assigned],['Students on board',cap.boarded],['Current odometer',`${formatNumber(bus.current_mileage)} km`],['Next service',`${formatNumber(bus.next_service_mileage)} km`],['Maintenance',statusNames[maintenanceStatus(bus).status]]].map(([k,v])=>`<div class="setting-row"><strong>${k}</strong><span>${esc(v)}</span></div>`).join('')}</div><div class="modal-footer">${store.profile.role==='admin'?`${!route?button('Remove bus','delete-bus',{id,iconName:'Trash2',className:'danger'}):button('View route','route-detail',{id:route.id,iconName:'Route'})}${bus.status!=='active'?button('Edit bus','edit-bus',{id,iconName:'Settings'}):''}${button('Record service','service-bus',{id,primary:true,iconName:'Wrench'})}`:button('Close','close-modal')}</div>`);
}
function routeDetail(id) {
  const route=store.data.routes.find(r=>r.id===id);if(!route)return;
  const bus=store.data.buses.find(b=>b.id===route.bus_id),cap=routeCapacity(bus,route.id,store.data.student_assignments);
  showModal(esc(route.route_name),`${departure(route.departure_time)} departure · ${esc(bus?.label)} · ${cap.assigned} assigned students`,`<div class="detail-map" id="route-detail-map"></div><div class="stop-timeline">${timeline(stopsFor(id))}</div><div class="modal-footer">${store.profile.role==='admin' && route.status!=='active'?button('Remove route','delete-route',{id,iconName:'Trash2',className:'danger'}):button('Close','close-modal')}${store.profile.role==='admin'?button('Monitor route','monitor-route',{id,primary:true,iconName:'Navigation'}):''}</div>`,{cleanup:()=>detailMap.destroy()});
  const detailMap=new FleetMap(document.querySelector('#route-detail-map'),store.data,{routeId:id,demo:store.mode==='demo'});
}
function serviceModal(id) {
  const bus=store.data.buses.find(b=>b.id===id);
  if(bus.status==='active'){toast('End the active route before recording maintenance.',true);return;}
  showModal('A little care for the road ahead.',`Record completed maintenance for ${esc(bus.label)}.`,`<form>${inputField('Odometer at service (km)','mileage',{type:'number',min:bus.current_mileage,max:10000000,value:bus.current_mileage})}${inputField('Next service at (km)','next_service_mileage',{type:'number',min:bus.current_mileage+1,max:10000000,value:bus.current_mileage+5000})}<div class="note">Recording service updates the odometer and marks this bus available.</div>${formFooter('Record service')}</form>`,{onSubmit:async f=>{await store.action('service_bus',{bus_id:id,mileage:Number(f.get('mileage')),next_service_mileage:Number(f.get('next_service_mileage'))});closeModal();toast('Maintenance recorded. Your bus is ready.');}});
}
function endRouteModal(id) {
  const route=store.data.routes.find(r=>r.id===id),bus=store.data.buses.find(b=>b.id===route.bus_id);
  showModal('Another journey, safely finished.',`Complete ${esc(route.route_name)} and update your odometer.`,`<form>${inputField('Final odometer reading (km)','mileage',{type:'number',min:bus.current_mileage,max:10000000,value:bus.current_mileage})}<div class="note">Current reading: ${formatNumber(bus.current_mileage)} km. Your service interval will be checked automatically. All boarded students will be marked off the bus.</div>${formFooter('End route')}</form>`,{onSubmit:async f=>{await store.action('end_route',{route_id:id,mileage:Number(f.get('mileage'))});await stopGPS();await store.announceTrip(route,'completed');closeModal();toast('Route completed. Thank you for a safe journey.');}});
}
function confirmModal(title,text,label,action) {
  showModal(title,text,`<form>${formFooter(label)}</form>`,{onSubmit:async()=>{await action();closeModal();}});
}
function exportFleet() {
  const rows=[['Vehicle','Plate number','Capacity','On board','Assigned students','Route','Driver','Status','Odometer (km)','Next service (km)'],...store.data.buses.map(bus=>{
    const route=routeByBus(bus.id),cap=route?routeCapacity(bus,route.id,store.data.student_assignments):{boarded:0,assigned:0};
    return [bus.label,bus.plate_number,bus.capacity,cap.boarded,cap.assigned,route?.route_name || '',person(route?.driver_id)?.name || '',statusNames[bus.status],bus.current_mileage,bus.next_service_mileage];
  })];
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`udd-go-fleet-${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date())}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Fleet report exported.');
}

async function enableGPS(routeId) {
  if(gpsWatch!==null){toast('GPS sharing is already enabled.');return;}
  const publish=async position=>{
    try{await store.publishPosition(routeId,position.coords);const status=document.querySelector('#gps-status');if(status)status.textContent=`Sharing GPS · last update ${new Date().toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})}`;}
    catch(e){toast(e.message,true);}
  };
  if(Capacitor.isNativePlatform()){
    const permissions=await Geolocation.requestPermissions();
    if(permissions.location!=='granted')throw new Error('Allow location access in device settings to share your bus location.');
    gpsNative=true;
    gpsWatch=await Geolocation.watchPosition({enableHighAccuracy:true,timeout:15000,minimumUpdateInterval:5000},(position,error)=>{if(error)toast(error.message,true);else if(position)publish(position);});
  }else{
    if(!navigator.geolocation)throw new Error('This device does not support geolocation.');
    gpsNative=false;
    gpsWatch=navigator.geolocation.watchPosition(publish,error=>{toast(`GPS unavailable: ${error.message}`,true);stopGPS();},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }
  toast('GPS sharing enabled for your active route.');
}
async function stopGPS(){if(gpsWatch===null)return;if(gpsNative)await Geolocation.clearWatch({id:gpsWatch});else navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;}

async function handleAction(action,id) {
  switch(action){
    case 'add-bus':addBusModal();break;
    case 'edit-bus':addBusModal(id);break;
    case 'add-route':routeModal();break;
    case 'add-driver':addPersonModal('driver');break;
    case 'add-student':addPersonModal('student');break;
    case 'assign-student':assignModal(id);break;
    case 'unassign-student':confirmModal('Remove this route assignment?','The student will need a new route before boarding.','Remove assignment',async()=>{await store.action('unassign_student',{assignment_id:id});toast('Route assignment removed.');});break;
    case 'bus-detail':busDetail(id);break;
    case 'route-detail':routeDetail(id);break;
    case 'delete-route':confirmModal('Remove this route?','This removes its stops and student assignments, and frees its bus and driver. Activity history is retained.','Remove route',async()=>{await store.action('delete_route',{route_id:id});toast('Route removed. Its bus and driver are available.');});break;
    case 'service-bus':serviceModal(id);break;
    case 'delete-bus':confirmModal('Remove this bus?','This unassigned bus will be removed from your fleet.','Remove bus',async()=>{await store.action('delete_bus',{bus_id:id});toast('Bus removed from your fleet.');});break;
    case 'person-detail':{const u=person(id),route=store.data.routes.find(r=>r.driver_id===id);showModal(esc(u.name),'Driver profile',`<div class="modal-detail-list"><div class="setting-row"><strong>Contact number</strong><span>${esc(u.contact_number || '—')}</span></div><div class="setting-row"><strong>Assigned route</strong><span>${esc(route?.route_name || 'Unassigned')}</span></div></div><div class="modal-footer">${route?button('View route','route-detail',{id:route.id,primary:true}):button('Close','close-modal')}</div>`);break;}
    case 'monitor-route':routeFilter=id;page='overview';closeModal();render();break;
    case 'start-route':{const route=store.data.routes.find(r=>r.id===id);await store.action('start_route',{route_id:id});await store.announceTrip(route,'active');toast('Route started. Enable GPS sharing to broadcast your location.');break;}
    case 'end-route':endRouteModal(id);break;
    case 'enable-gps':await enableGPS(id);break;
    case 'export':exportFleet();break;
    case 'refresh':await store.refresh();toast('Your fleet is up to date.');break;
    case 'recenter':fleetMap?.fit(routeFilter || undefined);break;
    case 'close-modal':closeModal();break;
    case 'menu':document.querySelector('.sidebar').classList.add('open');document.querySelector('.sidebar-overlay').classList.add('open');break;
    case 'close-menu':document.querySelector('.sidebar').classList.remove('open');document.querySelector('.sidebar-overlay').classList.remove('open');break;
    case 'profile':navigate('settings');break;
    case 'logout':await stopGPS();await store.logout();break;
    case 'reset-demo':confirmModal('Start fresh with sample data?','This removes the demo changes saved in this browser.','Reset demo',()=>{store.reset();toast('Sample data restored.');});break;
    case 'notifications':showModal('A little heads-up.','The latest updates from your fleet.',`<div class="activity-list notification-list">${activityItems(15)}</div><div class="modal-footer">${button('Close','close-modal')}</div>`);break;
    case 'add-campus':routeDraft.push({stop_name:'UDD main campus',latitude:16.0436,longitude:120.3417});updateDraft();break;
    case 'remove-stop':routeDraft.splice(Number(id),1);updateDraft();break;
    case 'setup':showModal('Connect your school.','Switch from sample data to your shared Supabase workspace.',`<ol class="support-list"><li>Create a Supabase project and run <code>supabase/schema.sql</code> in its SQL editor.</li><li>Copy <code>.env.example</code> to <code>.env</code> and add your project URL and publishable/anon key.</li><li>Create Auth users, then link their IDs to fleet profiles. See the project README for the administrator setup query.</li><li>Disable public Realtime channels in Supabase settings and restart the app.</li></ol><div class="note">Never place a Supabase service-role key in this app. Full setup and deployment steps are in README.md.</div><div class="modal-footer">${button('Got it','close-modal',{primary:true})}</div>`);break;
    case 'help':showModal('A smoother school run starts here.','A quick guide to UDD Go.',`<ul class="support-list"><li><strong>Fleet:</strong> Add buses and keep their capacity and service intervals up to date.</li><li><strong>Routes:</strong> Assign an available bus and driver, then click the map to build a sequence of stops.</li><li><strong>Students:</strong> Add profiles, then assign a route and pickup stop. Full buses cannot accept more assignments.</li><li><strong>Drivers:</strong> Start your route, enable GPS sharing, and enter student IDs to record boarding. End the route with the final odometer.</li><li><strong>Students:</strong> Follow your assigned bus and keep your boarding ID ready.</li><li><strong>Demo:</strong> Use the role selector to try each experience. Sample data stays in this browser.</li></ul><div class="modal-footer">${button('Ready to go','close-modal',{primary:true})}</div>`);break;
  }
}

document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-page]');if(nav){event.preventDefault();navigate(nav.dataset.page);return;}
  const filter=event.target.closest('[data-filter]');if(filter){busFilter=filter.dataset.filter;render();return;}
  const target=event.target.closest('[data-action]');
  if(target){event.preventDefault();if(target.disabled)return;try{await handleAction(target.dataset.action,target.dataset.id);}catch(e){toast(e.message,true);}}
  if(event.target.classList.contains('modal-backdrop'))closeModal();
});
document.addEventListener('change',async event=>{
  const target=event.target;
  if(['demo-role','settings-role'].includes(target.id)){await stopGPS();page=target.value==='admin'?'overview':target.value;query='';store.setDemoRole(target.value);window.scrollTo({top:0,behavior:'instant'});}
  if(target.id==='map-route-filter'){routeFilter=target.value;render();}
  if(target.id==='notification-toggle'){
    try{
      if(target.checked){
        if(Capacitor.isNativePlatform()){const result=await LocalNotifications.requestPermissions();if(result.display!=='granted')throw new Error('Allow notifications in device settings to enable trip alerts.');}
        else if(!('Notification' in window) || await Notification.requestPermission()!=='granted')throw new Error('Allow browser notifications to enable trip alerts.');
      }
      savePreferences({notifications:target.checked});toast(target.checked?'Trip notifications enabled.':'Trip notifications turned off.');
    }catch(e){target.checked=false;toast(e.message,true);}
  }
});
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.dataset.stopIndex!==undefined){routeDraft[Number(target.dataset.stopIndex)].stop_name=target.value;return;}
  if(['table-search','people-search','global-search'].includes(target.id)){
    query=target.value;const caret=target.selectionStart;
    if(target.id==='global-search' && !['fleet','students','drivers'].includes(page))page='fleet';
    const id=target.id;render();const input=document.getElementById(id);input?.focus();input?.setSelectionRange(caret,caret);
  }
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(form.id==='login-form'){
    event.preventDefault();const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{const f=new FormData(form);await store.login(f.get('email'),f.get('password'));page=store.profile.role==='admin'?'overview':store.profile.role;render();}
    catch(e){form.querySelector('.form-error').textContent=e.message;submit.disabled=false;}
  }
  if(form.id==='boarding-form'){
    event.preventDefault();const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{const student_code=new FormData(form).get('student_code').trim().toUpperCase();await store.action('board_student',{route_id:form.dataset.route,student_code});toast('Student verified and boarded.');document.querySelector('#boarding-form input')?.focus();}
    catch(e){toast(e.message,true);submit.disabled=false;}
  }
});
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();document.querySelector('#global-search')?.focus();}
  if(event.key==='Escape'){closeModal();document.querySelector('.sidebar')?.classList.remove('open');document.querySelector('.sidebar-overlay')?.classList.remove('open');}
  if(event.key==='Tab' && document.querySelector('[role="dialog"]')){
    const elements=[...document.querySelectorAll('#modal-root button:not(:disabled),#modal-root input:not(:disabled),#modal-root select,#modal-root a[href],#modal-root textarea')].filter(el=>el.offsetParent!==null);
    const first=elements[0],last=elements.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }
});
store.addEventListener('change',render);
store.addEventListener('position',event=>fleetMap?.update(event.detail));
store.addEventListener('connectionerror',event=>toast(event.detail,true));
store.addEventListener('connection',event=>{
  const status=document.querySelector('[data-live-status]');
  if(status)status.innerHTML=`<span class="live-dot"></span>${store.connected?'Connected':event.detail==='SUBSCRIBED'?'Connecting…':'Reconnecting…'}`;
});
store.addEventListener('trip',async({detail})=>{
  if(!preferences.notifications || store.profile?.role!=='student')return;
  const assignment=store.data.student_assignments.find(a=>a.student_id===store.profile.id);
  if(assignment?.route_id!==detail.route_id)return;
  const message=detail.status==='active'?'Your school bus route has started. Be ready at your pickup stop.':'Your school bus route is complete.';
  toast(message);
  if(Capacitor.isNativePlatform())await LocalNotifications.schedule({notifications:[{title:'UDD Go · Your journey',body:message,id:Math.floor(Date.now()/1000)%2147483647}]});
  else if('Notification' in window && Notification.permission==='granted')new Notification('UDD Go · Your journey',{body:message,icon:'/favicon.svg'});
});

setInterval(()=>{
  if(store.mode!=='demo' || !store.profile || document.hidden || gpsWatch!==null)return;
  simulatedStep++;
  for(const route of store.data.routes.filter(r=>r.status==='active')){
    const stops=stopsFor(route.id);if(stops.length<2)continue;
    const progress=(simulatedStep*.015+(store.data.routes.indexOf(route)*.17))%.92;
    const index=Math.floor(progress*(stops.length-1));const ratio=progress*(stops.length-1)-index;
    const from=stops[index],to=stops[index+1];
    store.position({route_id:route.id,lat:from.latitude+(to.latitude-from.latitude)*ratio,lng:from.longitude+(to.longitude-from.longitude)*ratio,at:Date.now()});
  }
},5000);

try {await store.init();configureMap(store.config);render();}catch(error){app.innerHTML=`<main class="boot-screen"><div class="empty">${icon('CircleAlert')}<h2>Let’s check your connection.</h2><p>${esc(error.message)}</p><button class="button primary" onclick="location.reload()">Try again</button></div></main>`;mountIcons();}
