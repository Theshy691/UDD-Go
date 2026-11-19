import { validCoordinates } from './domain.js';
import { tripTime } from './portal-views.js';

const cache = new Map();
const cacheTime = 90_000;

export const trafficColor = (seconds) => (seconds >= 300 ? '#b42318' : '#b45309');

function routePoints(stops) {
  return stops.map(({ latitude, longitude }) => [latitude, longitude]);
}

function delayOf(summary) {
  const seconds = summary?.trafficDelayInSeconds;
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Traffic delay is unavailable.');
  return seconds;
}

async function requestTraffic(points, key) {
  const locations = points.map((point) => point.join(',')).join(':');
  const params = new URLSearchParams({
    key,
    traffic: 'true',
    travelMode: 'bus',
    routeRepresentation: 'polyline',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?${params}`,
      { signal: controller.signal }
    );
    if (!response.ok) throw new Error('Traffic feed unavailable.');
    const data = await response.json();
    const route = data.routes?.[0];
    if (route?.legs?.length !== points.length - 1) throw new Error('Traffic route incomplete.');
    const legs = route.legs.map((leg) => {
      const seconds = delayOf(leg.summary);
      const geometry = routePoints(leg.points ?? []);
      if (geometry.length < 2 || !geometry.every(([lat, lng]) => validCoordinates(lat, lng))) {
        throw new Error('Traffic route geometry unavailable.');
      }
      return { seconds, points: geometry };
    });
    return { seconds: delayOf(route.summary), legs, updatedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

function liveTraffic(points, key, refresh) {
  const route = JSON.stringify(points);
  const previous = cache.get(route);
  if (previous?.pending || (!refresh && previous && Date.now() - previous.at < cacheTime)) {
    return previous.request;
  }
  const item = { pending: true };
  item.request = requestTraffic(points, key).finally(() => {
    item.at = Date.now();
    item.pending = false;
  });
  cache.set(route, item);
  if (cache.size > 16) cache.delete(cache.keys().next().value);
  return item.request;
}

function sampleTraffic(points) {
  const legs = points.slice(1).map((point, index) => ({
    seconds: index === 1 || points.length === 2 ? 360 : index === 2 ? 120 : 0,
    points: [points[index], point],
  }));
  return { legs, seconds: legs.reduce((total, leg) => total + leg.seconds, 0) };
}

function delayText(seconds) {
  if (seconds === 0) return 'No delay reported';
  if (seconds < 60) return 'Less than 1 min extra';
  return `About ${Math.round(seconds / 60)} min extra`;
}

export function driverTrafficPanel(demo, key) {
  return `<section class="journey-traffic" aria-labelledby="traffic-title" data-driver-traffic>
    <div><h3 id="traffic-title">Route traffic</h3><span class="traffic-source">${demo ? 'Sample' : key ? '<a href="https://www.tomtom.com/">TomTom</a>' : ''}</span></div>
    <div role="status"><strong data-traffic-delay></strong><p data-traffic-detail>${demo || key ? 'Checking route traffic…' : 'Live traffic is unavailable.'}</p></div>
    <p data-traffic-caption hidden>Estimated driving delay for the full route via assigned stops.</p>
    <div class="traffic-actions">
      <button type="button" class="button" data-traffic-toggle aria-pressed="false" hidden>Show traffic on map</button>
      ${!demo && key ? '<button type="button" class="button" data-traffic-refresh>Refresh traffic</button>' : ''}
    </div>
    <p data-traffic-legend hidden><span class="traffic-swatch traffic-slow"></span>Under 5 min per stretch <span class="traffic-swatch traffic-heavy"></span>5 min or more</p>
  </section>`;
}

let trafficTripId;
let overlayEnabled = false;

export function mountDriverTraffic(root, { trip, demo, key, map }) {
  if (trafficTripId !== trip.id) {
    trafficTripId = trip.id;
    overlayEnabled = false;
  }
  const delay = root.querySelector('[data-traffic-delay]');
  const detail = root.querySelector('[data-traffic-detail]');
  const caption = root.querySelector('[data-traffic-caption]');
  const toggle = root.querySelector('[data-traffic-toggle]');
  const refresh = root.querySelector('[data-traffic-refresh]');
  const legend = root.querySelector('[data-traffic-legend]');
  const points = routePoints(trip.stops ?? []);
  let legs = [];

  function draw() {
    const visible = overlayEnabled && legs.length > 0;
    toggle.setAttribute('aria-pressed', visible);
    toggle.textContent = visible ? 'Hide traffic on map' : 'Show traffic on map';
    legend.hidden = !visible;
    map.showTraffic(visible ? legs : []);
  }

  function show(snapshot) {
    let worst = -1;
    snapshot.legs.forEach((leg, index) => {
      if (leg.seconds > (snapshot.legs[worst]?.seconds ?? 0)) worst = index;
    });
    legs = snapshot.legs.filter((leg) => leg.seconds > 0);
    delay.textContent = delayText(snapshot.seconds);
    detail.textContent = [
      worst >= 0
        ? `Most affected stretch · ${trip.stops[worst].stop_name} to ${trip.stops[worst + 1].stop_name}`
        : '',
      snapshot.updatedAt ? `Updated ${tripTime(snapshot.updatedAt)} PHT` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    caption.hidden = false;
    toggle.hidden = !legs.length;
    draw();
  }

  async function load(refreshRequested = false) {
    refresh.disabled = true;
    try {
      const snapshot = await liveTraffic(points, key, refreshRequested);
      if (root.isConnected) show(snapshot);
    } catch {
      if (!root.isConnected) return;
      delay.textContent = '';
      detail.textContent = 'Traffic data is unavailable. Try refreshing.';
      caption.hidden = true;
      legs = [];
      toggle.hidden = true;
      draw();
    } finally {
      refresh.disabled = false;
    }
  }

  if (!demo && !key) return;
  if (
    points.length < 2 ||
    points.length > 152 ||
    !points.every(([lat, lng]) => validCoordinates(lat, lng))
  ) {
    detail.textContent = 'Traffic estimates are unavailable for these route stops.';
    if (refresh) refresh.hidden = true;
    return;
  }
  toggle.addEventListener('click', () => {
    overlayEnabled = !overlayEnabled;
    draw();
  });
  if (demo) show(sampleTraffic(points));
  else {
    refresh.addEventListener('click', () => load(true));
    void load();
  }
}
