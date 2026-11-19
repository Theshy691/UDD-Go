import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { DEMO_ACCOUNT_EMAILS, DEMO_PASSWORD, makeSeed, SECOND_DEMO_ADMIN } from './seed.js';
import { TRIP_ACTIONS, schoolDate, upgradeDemoTrips, applyDemoTripAction } from './trips.js';
import {
  SCHEDULING_ACTIONS,
  schedulingActions,
  upgradeScheduling,
  applySchedulingAction,
} from './scheduling.js';
import { capacityFor, validCoordinates } from './domain.js';

const DATA_KEY = 'udd-go-demo-v1';
const PREF_KEY = 'udd-go-preferences';
const emptyData = () => ({
  users: [],
  buses: [],
  routes: [],
  route_stops: [],
  student_assignments: [],
  activity: [],
  trips: [],
  trip_passengers: [],
  service_schedules: [],
  student_subscriptions: [],
  route_versions: [],
  calendar_exceptions: [],
});
let savedPreferences = {};
try {
  savedPreferences = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
} catch {
  /* Restore defaults if browser settings were corrupted. */
}
export const preferences = savedPreferences || {};
export function savePreferences(values) {
  Object.assign(preferences, values);
  localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
}

class FleetStore extends EventTarget {
  data = emptyData();
  profile = null;
  mode = 'demo';
  client = null;
  config = {};
  routeSummaries = new Map();
  channels = new Map();
  connected = false;
  subscriptionKey = '';
  refreshTimer = null;
  refreshTask = null;
  refreshQueued = false;
  sessionGeneration = 0;
  channelStates = new Map();
  constructor() {
    super();
    this.localChannel = new BroadcastChannel('udd-go-fleet');
    this.localChannel.onmessage = ({ data }) => {
      if (this.mode !== 'demo') return;
      if (data.type === 'position') this.position(data.payload, false);
      if (data.type === 'change') {
        this.loadDemo();
        this.emit();
      }
      if (data.type === 'trip')
        this.dispatchEvent(new CustomEvent('trip', { detail: data.payload }));
    };
    window.addEventListener('storage', (event) => {
      if (event.key === DATA_KEY && this.mode === 'demo') {
        this.loadDemo();
        this.emit();
      }
    });
  }
  async init() {
    let config = {
      url: import.meta.env.VITE_SUPABASE_URL,
      key: import.meta.env.VITE_SUPABASE_ANON_KEY,
      cartoKey: import.meta.env.VITE_CARTO_API_KEY,
      trafficKey: import.meta.env.VITE_TOMTOM_TRAFFIC_KEY,
    };
    if (!config.url) {
      try {
        const response = await fetch('/api/index.php?action=config');
        if (response.ok && response.headers.get('content-type')?.includes('application/json'))
          config = await response.json();
      } catch {
        /* A static development server supports the demo without PHP. */
      }
    }
    this.config = config;
    if (config.url && config.key) {
      this.mode = 'live';
      this.client = createClient(config.url, config.key);
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (data.session) await this.loadLive();
      this.client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          this.sessionGeneration++;
          this.profile = null;
          this.data = emptyData();
          this.unsubscribe();
          this.emit();
        }
      });
    } else {
      this.loadDemo();
      const restored = this.setDemoAccount(preferences.demoAccountId, false);
      if (!restored && preferences.demoRole) {
        this.setDemoRole(preferences.demoRole, false);
      }
      this.connected = true;
    }
  }
  loadDemo() {
    try {
      const saved = JSON.parse(localStorage.getItem(DATA_KEY));
      this.data = saved?.version === 1 ? saved : makeSeed();
    } catch {
      this.data = makeSeed();
    }
    if (!this.data.users.some((user) => user.id === SECOND_DEMO_ADMIN.id)) {
      this.data.users.push({ ...SECOND_DEMO_ADMIN });
    }
    upgradeDemoTrips(this.data);
    upgradeScheduling(this.data);
    localStorage.setItem(DATA_KEY, JSON.stringify(this.data));
  }
  setDemoRole(role, emit = true) {
    const account = this.data.users.find((user) => user.role === role);
    return this.setDemoAccount(account?.id, emit);
  }
  demoAccounts() {
    if (this.mode !== 'demo') return [];
    return Object.entries(DEMO_ACCOUNT_EMAILS).flatMap(([id, email]) => {
      const user = this.data.users.find((candidate) => candidate.id === id);
      return user ? [{ id, email, role: user.role, name: user.name }] : [];
    });
  }
  setDemoAccount(id, emit = true) {
    if (this.mode !== 'demo' || !id) return false;
    const account = this.data.users.find((user) => user.id === id);
    if (!account || !['admin', 'driver', 'student'].includes(account.role)) return false;
    this.profile = account;
    savePreferences({ demoRole: account.role, demoAccountId: account.id });
    if (emit) this.emit();
    return true;
  }
  async login(email, password) {
    if (this.mode === 'demo') {
      const query = (email || '').toLowerCase().trim();
      const matched =
        this.demoAccounts().find((account) => account.email === query) ??
        this.data.users.find((user) => user.email?.toLowerCase() === query);
      if (password !== DEMO_PASSWORD || !this.setDemoAccount(matched?.id)) {
        throw new Error('Choose a sample account below or check the demo email and password.');
      }
      return;
    }
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.loadLive();
    this.emit();
  }
  async logout() {
    if (this.mode === 'live') {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
    } else {
      this.profile = null;
      savePreferences({ demoRole: null, demoAccountId: null });
      this.emit();
    }
  }
  async loadLive() {
    const generation = this.sessionGeneration;
    const {
      data: { user },
      error,
    } = await this.client.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Please sign in to continue.');
    const { data: profile, error: profileError } = await this.client
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .single();
    if (profileError)
      throw new Error(
        'Your account needs a fleet profile. Ask your administrator to link your Auth user ID.'
      );
    const next = emptyData();
    const names = [
      'users',
      'buses',
      'routes',
      'route_stops',
      'student_assignments',
      'activity',
      'service_schedules',
      'student_subscriptions',
      'calendar_exceptions',
    ];
    const [results, tripData] = await Promise.all([
      Promise.all(names.map((name) => this.readTable(name))),
      this.loadTrips(),
    ]);
    Object.assign(next, tripData);
    results.forEach((result, i) => {
      if (result.error) throw result.error;
      next[names[i]] = result.data;
    });
    const routeSummaries = new Map();
    const versionIds = [...new Set(next.service_schedules.map((s) => s.route_version_id))];
    const versions = Promise.all(
      Array.from({ length: Math.ceil(versionIds.length / 500) }, (_, i) =>
        this.client
          .from('route_versions')
          .select('*')
          .in('id', versionIds.slice(i * 500, (i + 1) * 500))
          .limit(500)
      )
    );
    const summaries = profile.role === 'student' ? Promise.all(
      next.trips
        .filter((t) => t.service_date === schoolDate() || t.status === 'active')
        .map(async (t) => {
          const { data, error } = await this.client.rpc('fleet_trip_capacity', { p_id: t.id });
          if (error) throw error;
          routeSummaries.set(t.id, data);
        })
    ) : Promise.resolve();
    const [versionResults] = await Promise.all([versions, summaries]);
    for (const result of versionResults) {
      if (result.error) throw result.error;
      next.route_versions.push(...result.data);
    }
    if (generation !== this.sessionGeneration) return;
    // Keep GPS events that arrived while the tables were loading, for the same active trip.
    if (this.profile?.id === profile.id) {
      const currentBuses = new Map(this.data.buses.map((bus) => [bus.id, bus]));
      const activeTrips = new Map(next.trips.filter((t) => t.status === 'active').map((t) => [t.bus_id, t]));
      for (const bus of next.buses) {
        const position = currentBuses.get(bus.id);
        const trip = activeTrips.get(bus.id);
        if (
          position?.position_at && trip && trip.id === position.position_trip_id &&
          trip.location_epoch === position.position_epoch
        ) {
          for (const key of ['current_lat', 'current_lng', 'position_at', 'position_trip_id', 'position_epoch'])
            bus[key] = position[key];
        }
      }
    }
    this.profile = profile;
    this.data = next;
    this.routeSummaries = routeSummaries;
    await this.subscribe();
  }
  async loadTrips() {
    const today = schoolDate(),
      from = schoolDate(new Date(Date.now() - 7 * 86400000)),
      to = schoolDate(new Date(Date.now() + 7 * 86400000));
    const { data, error } = await this.client
      .from('trips')
      .select('*')
      .or(`status.eq.active,and(service_date.gte.${from},service_date.lte.${to})`)
      .order('planned_at', { ascending: false })
      .limit(201);
    if (error)
      throw new Error(
        `Trips could not be loaded. Confirm you applied migrations 001 and 002. ${error.message}`
      );
    if (data.length > 200)
      throw new Error(
        'More than 200 trips in this window. Narrow server-side trip loading before continuing.'
      );
    // Each manifest is bounded by the enforced maximum vehicle capacity of 100.
    const manifests = await Promise.all(
      data
        .filter((t) => t.status === 'active' || t.service_date === today)
        .map((trip) => this.tripManifest(trip.id))
    );
    return { trips: data, trip_passengers: manifests.flat() };
  }
  visibleTrips() {
    if (this.mode === 'live') return this.data.trips;
    return this.data.trips.filter(
      (t) =>
        this.profile?.role === 'admin' ||
        (this.profile?.role === 'driver'
          ? t.driver_id === this.profile.id
          : this.data.trip_passengers.some(
              (p) => p.trip_id === t.id && p.student_id === this.profile?.id
            ))
    );
  }
  async tripManifest(tripId) {
    if (this.mode === 'demo') {
      if (!this.visibleTrips().some((t) => t.id === tripId))
        throw new Error('This trip is not available to your account.');
      return this.data.trip_passengers.filter(
        (p) =>
          p.trip_id === tripId &&
          (this.profile.role !== 'student' || p.student_id === this.profile.id)
      );
    }
    const { data, error } = await this.client
      .from('trip_passengers')
      .select('*')
      .eq('trip_id', tripId)
      .order('student_name')
      .limit(101);
    if (error) throw error;
    if (data.length > 100) throw new Error('Manifest exceeds supported vehicle capacity.');
    return data;
  }
  async tripResourceHistory(tripId) {
    if (this.profile.role !== 'admin') return [];
    if (this.mode === 'demo')
      return this.data.trip_resource_events.filter((e) => e.trip_id === tripId);
    const { data, error } = await this.client
      .from('trip_resource_events')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at')
      .limit(201);
    if (error) throw error;
    if (data.length > 200) throw new Error('Resource history exceeds the display limit.');
    return data;
  }
  async tripHistory(from, to) {
    if (this.mode === 'demo')
      return this.visibleTrips()
        .filter((t) => t.service_date >= from && t.service_date <= to)
        .sort((a, b) => b.planned_at.localeCompare(a.planned_at));
    const { data, error } = await this.client
      .from('trips')
      .select('*')
      .gte('service_date', from)
      .lte('service_date', to)
      .order('planned_at', { ascending: false })
      .limit(201);
    if (error) throw error;
    if (data.length > 200)
      throw new Error('More than 200 trips match. Choose a shorter date range.');
    return data;
  }
  async readTable(name) {
    if (name === 'activity')
      return this.client
        .from(name)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
    const records = [];
    let total = Infinity;
    while (records.length < total) {
      const { data, error, count } = await this.client
        .from(name)
        .select('*', { count: 'exact' })
        .order('id')
        .range(records.length, records.length + 999);
      if (error) return { error };
      if (count > 10000)
        return {
          error: new Error(
            'This workspace exceeds the 10,000-record limit. Add server-side directory pagination before using this fleet size.'
          ),
        };
      total = count ?? 0;
      if (!data.length && records.length < total)
        return { error: new Error('Fleet records changed while loading. Refresh to try again.') };
      records.push(...data);
    }
    return { data: records, error: null };
  }
  async subscribe() {
    const key = [
      this.profile.id,
      ...this.data.trips
        .filter((t) => t.status === 'active')
        .map((t) => `${t.id}:${t.location_epoch}`)
        .sort(),
    ].join(':');
    if (this.subscriptionKey === key) return;
    this.unsubscribe();
    this.subscriptionKey = key;
    await this.client.realtime.setAuth();
    if (this.subscriptionKey !== key) return;
    const topics = this.data.trips
      .filter((t) => t.status === 'active')
      .map((t) => ({ topic: `trip:${t.id}:${t.location_epoch}`, id: t.id }));
    topics.push({ topic: `user:${this.profile.id}`, id: 'profile' });
    if (this.profile.role === 'admin') topics.push({ topic: 'fleet:admin', id: 'admin' });
    this.channelStates = new Map(topics.map((topic) => [topic.id, 'CONNECTING']));
    const queueRefresh = () => {
      if (this.subscriptionKey !== key) return;
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(
        () =>
          this.refresh().catch((error) =>
            this.dispatchEvent(new CustomEvent('connectionerror', { detail: error.message }))
          ),
        200
      );
    };
    for (const topic of topics) {
      const channel = this.client.channel(topic.topic, {
        config: { private: true, broadcast: { self: false, ack: true } },
      });
      channel.on('broadcast', { event: 'position' }, ({ payload }) =>
        this.position(payload, false)
      );
      channel.on('broadcast', { event: 'data_changed' }, queueRefresh);
      channel.on('broadcast', { event: 'trip' }, ({ payload }) => {
        this.dispatchEvent(new CustomEvent('trip', { detail: payload }));
        queueRefresh();
      });
      channel.subscribe((status) => {
        if (this.subscriptionKey !== key) return;
        this.channelStates.set(topic.id, status);
        this.connected = [...this.channelStates.values()].every((value) => value === 'SUBSCRIBED');
        this.dispatchEvent(new CustomEvent('connection', { detail: status }));
      });
      this.channels.set(topic.id, channel);
    }
  }
  unsubscribe() {
    this.subscriptionKey = '';
    clearTimeout(this.refreshTimer);
    for (const channel of this.channels.values()) this.client?.removeChannel(channel);
    this.channels.clear();
    this.connected = false;
    this.channelStates.clear();
  }
  async refresh() {
    if (this.mode === 'demo') {
      this.loadDemo();
      this.emit();
      return;
    }
    if (!this.profile) return;
    this.refreshQueued = true;
    if (!this.refreshTask) {
      this.refreshTask = (async () => {
        while (this.refreshQueued && this.profile) {
          this.refreshQueued = false;
          await this.loadLive();
          this.emit();
        }
      })().finally(() => { this.refreshTask = null; });
    }
    await this.refreshTask;
  }
  emit() {
    this.dispatchEvent(new Event('change'));
  }
  position(payload, publish = true) {
    if (
      !payload ||
      !validCoordinates(payload.lat, payload.lng) ||
      !Number.isFinite(payload.at) ||
      payload.at > Date.now() + 60000
    )
      return;
    const route = this.data.routes.find((r) => r.id === payload.route_id);
    const trip = this.data.trips.find((t) => t.id === payload.trip_id && t.status === 'active');
    const bus = this.data.buses.find((b) => b.id === trip?.bus_id);
    if (!bus || !trip || payload.location_epoch !== trip.location_epoch) return;
    if (bus.position_trip_id === trip.id && bus.position_at && payload.at < bus.position_at) return;
    Object.assign(bus, {
      current_lat: payload.lat,
      current_lng: payload.lng,
      position_at: payload.at,
      position_trip_id: trip.id,
      position_epoch: trip.location_epoch,
    });
    this.dispatchEvent(new CustomEvent('position', { detail: { ...payload, bus_id: bus.id } }));
    if (publish && this.mode === 'demo')
      this.localChannel.postMessage({ type: 'position', payload });
  }
  async publishPosition(tripId, coords) {
    const trip = this.data.trips.find((t) => t.id === tripId && t.status === 'active');
    if (!trip || (this.profile.role !== 'admin' && trip.driver_id !== this.profile.id))
      throw new Error('An assigned active trip is required for location sharing.');
    const payload = {
      route_id: trip.route_id,
      trip_id: trip.id,
      location_epoch: trip.location_epoch,
      lat: coords.latitude,
      lng: coords.longitude,
      at: Date.now(),
    };
    if (this.mode === 'live') {
      const { error } = await this.client.rpc('fleet_publish_position', {
        p_trip_id: trip.id,
        p_epoch: trip.location_epoch,
        p_lat: payload.lat,
        p_lng: payload.lng,
        p_at: payload.at,
      });
      if (error) throw new Error(error.message);
    }
    this.position(payload);
  }
  async announceTrip(route, status) {
    const payload = {
      route_id: route.id,
      route_name: route.route_name,
      trip_id: route.trip_id,
      status,
    };
    if (this.mode === 'demo') this.localChannel.postMessage({ type: 'trip', payload });
    // Hosted trips are announced by the transaction's database trigger.
    if (this.mode === 'demo') this.dispatchEvent(new CustomEvent('trip', { detail: payload }));
  }
  async action(action, payload) {
    if (['start_route', 'end_route', 'board_student'].includes(action))
      throw new Error('Use a dated trip for passenger operations.');
    if (TRIP_ACTIONS.includes(action) || SCHEDULING_ACTIONS.includes(action)) {
      payload = { ...payload, operation_id: payload.operation_id || crypto.randomUUID() };
      if (this.mode === 'demo') {
        const mutate = () => {
          this.loadDemo();
          const next = structuredClone(this.data);
          const repeated = next.trip_operations.some((op) => op.id === payload.operation_id);
          const result = schedulingActions.has(action)
            ? applySchedulingAction(next, this.profile, action, payload)
            : applyDemoTripAction(next, this.profile, action, payload);
          this.data = next;
          localStorage.setItem(DATA_KEY, JSON.stringify(next));
          this.localChannel.postMessage({ type: 'change' });
          this.emit();
          if (!repeated && ['start_trip', 'complete_trip'].includes(action)) {
            const trip = next.trips.find((t) => t.id === result.id);
            this.announceTrip(
              { id: trip.route_id, route_name: trip.route_name, trip_id: trip.id },
              trip.status
            );
          }
          return result;
        };
        return navigator.locks
          ? navigator.locks.request('udd-go-demo-mutations', mutate)
          : mutate();
      }
    }

    if (this.mode === 'live') {
      let mutationResult;
      if (this.config.middleware) {
        const {
          data: { session },
        } = await this.client.auth.getSession();
        const response = await fetch('/api/index.php?action=mutate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({ p_action: action, p_payload: payload }),
        });
        const result = await response.json().catch(() => null);
        if (!result) throw new Error('The fleet service sent an unexpected response. Try again shortly.');
        mutationResult = result;
        if (!response.ok)
          throw new Error(result.message || result.error || 'Your change could not be saved.');
      } else {
        const { data, error } = await this.client.rpc('fleet_action', {
          p_action: action,
          p_payload: payload,
        });
        if (error) throw new Error(error.message);
        mutationResult = data;
      }
      await this.refresh();
      return mutationResult;
    }
    this.loadDemo();
    if (['assign_student', 'unassign_student', 'delete_route'].includes(action))
      throw new Error('Use service subscriptions and route archiving.');
    if (
      ['delete_route', 'update_bus', 'delete_bus'].includes(action) &&
      this.data.trips.some(
        (t) =>
          ['scheduled', 'active'].includes(t.status) &&
          (action === 'delete_route'
            ? t.route_id === payload.route_id
            : t.bus_id === payload.bus_id)
      )
    )
      throw new Error('Complete or cancel prepared trips before changing these resources.');
    const admin = this.profile.role === 'admin';
    if (!admin) throw new Error('Only administrators can make this change.');
    const id = () => crypto.randomUUID();
    const bus = this.data.buses.find((b) => b.id === payload.bus_id);
    const route = this.data.routes.find((r) => r.id === payload.route_id);
    const routeBus = this.data.buses.find((b) => b.id === route?.bus_id);
    const before = structuredClone({
      bus: bus || null,
      assignment: this.data.student_assignments.find((a) => a.id === payload.assignment_id) || null,
    });
    let message = '',
      type = 'update',
      detail = '';
    switch (action) {
      case 'add_bus':
      case 'update_bus': {
        if (!payload.label?.trim() || !payload.plate_number?.trim())
          throw new Error('Enter a vehicle name and plate number.');
        if (
          this.data.buses.some(
            (b) =>
              b.id !== payload.bus_id &&
              b.plate_number.toUpperCase() === payload.plate_number.toUpperCase()
          )
        )
          throw new Error('A bus with this plate number already exists.');
        if (!(payload.capacity > 0) || payload.capacity > 100 || payload.next_service_mileage <= 0)
          throw new Error('Check the capacity and next service mileage.');
        if (action === 'add_bus') {
          if (payload.next_service_mileage <= payload.current_mileage)
            throw new Error('Next service must be after the current odometer.');
          this.data.buses.push({
            id: id(),
            ...payload,
            status: 'idle',
            current_lat: 16.0436,
            current_lng: 120.3417,
          });
          message = `${payload.label} added to the fleet`;
        } else {
          if (!bus) throw new Error('Bus not found.');
          if (bus.status === 'active')
            throw new Error('End the active trip before editing this bus.');
          const assignedRoute = this.data.routes.find((r) => r.bus_id === bus.id);
          if (
            assignedRoute &&
            capacityFor(bus, assignedRoute.id, this.data.student_assignments).assigned >
              payload.capacity
          )
            throw new Error('Capacity cannot be lower than the number of assigned students.');
          if (payload.current_mileage < bus.current_mileage)
            throw new Error('The odometer cannot move backwards.');
          if (!['idle', 'maintenance'].includes(payload.status))
            throw new Error('Choose an available or maintenance status.');
          const { bus_id, ...values } = payload;
          Object.assign(bus, values);
          message = `${bus.label} details updated`;
        }
        break;
      }
      case 'delete_bus': {
        if (!bus) throw new Error('Bus not found.');
        if (this.data.routes.some((r) => r.bus_id === bus.id))
          throw new Error('This bus is assigned to a route and cannot be removed.');
        this.data.buses = this.data.buses.filter((b) => b.id !== bus.id);
        message = `${bus.label} removed`;
        break;
      }
      case 'add_person': {
        if (!payload.name?.trim()) throw new Error('Enter a full name.');
        if (!['driver', 'student'].includes(payload.role)) throw new Error('Invalid role.');
        if (payload.role === 'student' && !payload.student_code?.trim())
          throw new Error('Enter a student ID.');
        const personId = payload.role === 'student' ? payload.student_code.toUpperCase() : id();
        if (this.data.users.some((u) => u.id === personId))
          throw new Error('This student ID already exists.');
        this.data.users.push({ id: personId, ...payload });
        message = `${payload.name} added`;
        break;
      }
      case 'add_route': {
        if (!payload.route_name?.trim() || payload.stops.some((stop) => !stop.stop_name.trim()))
          throw new Error('Give the route and every stop a name.');
        if (!bus || bus.status === 'maintenance') throw new Error('Choose an available bus.');

        if (payload.stops.length < 2 || payload.stops.length > 200)
          throw new Error('Choose between two and 200 route stops.');
        const routeId = id();
        const { stops, ...values } = payload;
        this.data.routes.push({
          id: routeId,
          ...values,
          status: 'scheduled',
          version_no: 1,
          archived: false,
        });
        stops.forEach((s, i) =>
          this.data.route_stops.push({ ...s, id: id(), route_id: routeId, stop_sequence: i + 1 })
        );
        this.data.route_versions.push({
          id: id(),
          route_id: routeId,
          version_no: 1,
          route_name: payload.route_name,
          stops: structuredClone(this.data.route_stops.filter((s) => s.route_id === routeId)),
          created_at: new Date().toISOString(),
        });
        message = `New route: ${payload.route_name}`;
        type = 'route';
        break;
      }
      case 'assign_student': {
        if (
          !route ||
          !this.data.users.some((u) => u.id === payload.student_id && u.role === 'student')
        )
          throw new Error('Choose a student and route.');
        if (
          this.data.student_assignments.some(
            (a) => a.student_id === payload.student_id && a.status !== 'cancelled'
          )
        )
          throw new Error('This student already has a route assignment.');
        if (capacityFor(routeBus, route.id, this.data.student_assignments).available <= 0)
          throw new Error('This route is full. Choose a bus with available seats.');
        if (!this.data.route_stops.some((s) => s.id === payload.stop_id && s.route_id === route.id))
          throw new Error('Choose a stop on this route.');
        this.data.student_assignments.push({ id: id(), ...payload, status: 'assigned' });
        message = 'Student assigned to route';
        break;
      }
      case 'delete_route': {
        if (!route) throw new Error('Route not found.');
        if (route.status === 'active')
          throw new Error('End the active trip before removing this route.');
        this.data.student_assignments = this.data.student_assignments.filter(
          (a) => a.route_id !== route.id
        );
        this.data.route_stops = this.data.route_stops.filter((s) => s.route_id !== route.id);
        this.data.routes = this.data.routes.filter((r) => r.id !== route.id);
        if (routeBus.status !== 'maintenance') routeBus.status = 'idle';
        message = `${route.route_name} removed`;
        type = 'route';
        break;
      }
      case 'unassign_student': {
        const assignment = this.data.student_assignments.find(
          (a) => a.id === payload.assignment_id
        );
        if (!assignment) throw new Error('Assignment not found.');
        if (assignment.status === 'boarded')
          throw new Error('End the trip before removing a boarded student.');
        this.data.student_assignments = this.data.student_assignments.filter(
          (a) => a.id !== assignment.id
        );
        message = 'Student route assignment removed';
        break;
      }
      case 'service_bus': {
        if (!bus) throw new Error('Bus not found.');
        if (bus.status === 'active')
          throw new Error('End the active trip before recording maintenance.');
        if (
          payload.mileage < bus.current_mileage ||
          payload.next_service_mileage <= payload.mileage
        )
          throw new Error('Check the odometer and next service mileage.');
        Object.assign(bus, {
          current_mileage: payload.mileage,
          next_service_mileage: payload.next_service_mileage,
          status: 'idle',
        });
        message = `${bus.label} maintenance completed`;
        type = 'maintenance';
        break;
      }
      default:
        throw new Error('Unknown fleet action.');
    }
    this.data.audit_events.push({
      id: id(),
      actor_id: this.profile.id,
      action,
      created_at: new Date().toISOString(),
      detail: { request: payload, before },
    });
    this.data.activity.unshift({
      id: id(),
      message,
      detail,
      type,
      created_at: new Date().toISOString(),
    });
    this.data.activity = this.data.activity.slice(0, 200);
    localStorage.setItem(DATA_KEY, JSON.stringify(this.data));
    this.localChannel.postMessage({ type: 'change' });
    this.emit();
  }
  reset() {
    if (this.mode !== 'demo') return;
    localStorage.removeItem(DATA_KEY);
    this.loadDemo();
    this.setDemoRole('admin');
    this.localChannel.postMessage({ type: 'change' });
  }
}
export const store = new FleetStore();
