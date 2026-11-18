import { escapeHtml } from './domain.js';
import { CAMPUS, makeSeed } from './seed.js';

const sample = makeSeed();
const routeColors = ['#ffce78', '#7bdbc5', '#bdb6ff', '#86bcff'];
const routes = sample.routes.map((route, index) => ({
  name: route.area,
  color: routeColors[index],
  stops: sample.route_stops.filter((stop) => stop.route_id === route.id),
}));
const points = routes.flatMap((route) => route.stops);
const minLon = Math.min(...points.map((point) => point.longitude));
const maxLon = Math.max(...points.map((point) => point.longitude));
const minLat = Math.min(...points.map((point) => point.latitude));
const maxLat = Math.max(...points.map((point) => point.latitude));

export function routePreview(icon) {
  return `<figure class="udd-route-preview" id="routes" aria-labelledby="preview-title">
    <figcaption class="udd-route-caption">
      <h2 id="preview-title">${icon('Route')} Dagupan route map</h2>
      <span>Sample routes</span>
    </figcaption>
    <div class="udd-route-filters" role="group" aria-label="Choose a sample route">
      ${routes
        .map(
          (
            route,
            index
          ) => `<button type="button" data-route-index="${index}" aria-pressed="${index === 0}"
            style="--route-color: ${route.color}">
            <span></span>${escapeHtml(route.name)}
          </button>`
        )
        .join('')}
    </div>
    <div class="udd-route-map">
      <canvas aria-hidden="true"></canvas>
    </div>
    <div class="udd-route-status" aria-live="polite"></div>
  </figure>`;
}

function drawNetwork(canvas, selected) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.scale(scale, scale);

  const insetX = width < 400 ? 25 : 48;
  const insetY = 30;
  const project = (latitude, longitude) => [
    insetX + ((longitude - minLon) / (maxLon - minLon)) * (width - insetX * 2),
    insetY + ((maxLat - latitude) / (maxLat - minLat)) * (height - insetY * 2),
  ];
  const stopPoint = (stop) => project(stop.latitude, stop.longitude);

  for (const route of [...routes.filter((route) => route !== selected), selected]) {
    const active = route === selected;
    const positions = route.stops.map(stopPoint);
    context.strokeStyle = route.color;
    context.lineWidth = active ? 4 : 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.globalAlpha = active ? 1 : 0.48;
    context.beginPath();
    positions.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    for (const [x, y] of positions) {
      context.beginPath();
      context.arc(x, y, active ? 4.5 : 3, 0, Math.PI * 2);
      context.fillStyle = '#182348';
      context.fill();
      context.lineWidth = active ? 2.5 : 1.5;
      context.stroke();
    }
  }

  context.globalAlpha = 1;
  const [campusX, campusY] = project(...CAMPUS);
  context.fillStyle = '#fff';
  context.fillRect(campusX - 3.5, campusY - 3.5, 7, 7);
  context.font = '700 11px "DM Sans", sans-serif';
  context.textBaseline = 'middle';
  context.fillText('UDD campus', campusX + 13, campusY - 10);
}

export function mountRoutePreview(root) {
  const canvas = root.querySelector('canvas');
  const buttons = [...root.querySelectorAll('[data-route-index]')];
  const status = root.querySelector('.udd-route-status');
  let selected = routes[0];

  function selectRoute(route) {
    selected = route;
    buttons.forEach((button, index) =>
      button.setAttribute('aria-pressed', routes[index] === selected)
    );
    const first = escapeHtml(route.stops[0].stop_name);
    const last = escapeHtml(route.stops.at(-1).stop_name);
    status.innerHTML = `<strong>${first} → ${last}</strong><span>${route.stops.length} stops</span>`;
    drawNetwork(canvas, selected);
  }

  buttons.forEach((button, index) =>
    button.addEventListener('click', () => selectRoute(routes[index]))
  );
  const resize = new ResizeObserver(() => drawNetwork(canvas, selected));
  resize.observe(canvas);
  selectRoute(selected);

  return () => resize.disconnect();
}
