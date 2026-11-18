import { escapeHtml } from './domain.js';
import { CAMPUS, makeSeed } from './seed.js';

const sample = makeSeed();
const routeColors = ['#0369a1', '#6d55a5', '#187662', '#a05b14'];
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
const segmentDuration = 2300;

export function routePreview(icon) {
  return `<figure class="udd-route-preview" id="routes" aria-labelledby="preview-title">
    <figcaption class="udd-route-caption">
      <h2 id="preview-title">${icon('Route')} Dagupan route map</h2>
      <span class="udd-route-sample">Sample routes</span>
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
    <div class="udd-route-body">
      <div class="udd-route-map">
        <canvas aria-hidden="true"></canvas>
        <div class="udd-route-bus" aria-hidden="true">${icon('BusFront')}</div>
      </div>
      <div class="udd-route-controls">
        <div class="udd-route-controls-row">
          <button class="udd-route-play" type="button" data-state="ready">
            <span class="udd-route-play-icon" aria-hidden="true">${icon('Play')}</span>
            <span class="udd-route-pause-icon" aria-hidden="true">${icon('Pause')}</span>
            <span class="udd-route-replay-icon" aria-hidden="true">${icon('RefreshCw')}</span>
            <span class="udd-route-play-label">Play trip</span>
          </button>
          <div class="udd-route-status" role="status" aria-atomic="true">
            <strong></strong>
            <span></span>
          </div>
        </div>
        <ol class="udd-route-stops" aria-label="Sample trip stops"></ol>
        <p class="udd-route-hint">Play the trip or select a stop to jump ahead.</p>
      </div>
    </div>
  </figure>`;
}

function drawNetwork(canvas, selected, width, height) {
  const context = canvas.getContext('2d');
  const insetX = width < 400 ? 25 : 48;
  const insetY = 30;
  const project = (latitude, longitude) => [
    insetX + ((longitude - minLon) / (maxLon - minLon)) * (width - insetX * 2),
    insetY + ((maxLat - latitude) / (maxLat - minLat)) * (height - insetY * 2),
  ];
  const stopPoint = (stop) => project(stop.latitude, stop.longitude);
  const selectedPositions = selected.stops.map(stopPoint);
  if (!context || !width || !height) return selectedPositions;

  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.scale(scale, scale);

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
      context.fillStyle = '#fff';
      context.fill();
      context.lineWidth = active ? 2.5 : 1.5;
      context.stroke();
    }
  }

  context.globalAlpha = 1;
  const [campusX, campusY] = project(...CAMPUS);
  context.fillStyle = '#263748';
  context.fillRect(campusX - 3.5, campusY - 3.5, 7, 7);
  context.font = '700 11px "DM Sans", sans-serif';
  context.textBaseline = 'middle';
  const label = 'UDD campus';
  const labelX = campusX + 14;
  const labelY = campusY - 16;
  context.strokeStyle = '#fff';
  context.lineWidth = 3;
  context.strokeText(label, labelX, labelY);
  context.fillText(label, labelX, labelY);
  return selectedPositions;
}

export function mountRoutePreview(root) {
  const canvas = root.querySelector('canvas');
  const bus = root.querySelector('.udd-route-bus');
  const buttons = [...root.querySelectorAll('[data-route-index]')];
  const play = root.querySelector('.udd-route-play');
  const playLabel = root.querySelector('.udd-route-play-label');
  const stopName = root.querySelector('.udd-route-status strong');
  const stopCount = root.querySelector('.udd-route-status span');
  const timeline = root.querySelector('.udd-route-stops');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = routes[0];
  let positions = [];
  let stopButtons = [];
  let progress = 0;
  let lastReported = -1;
  let frame = null;

  function renderProgress() {
    const current = Math.floor(progress);
    const from = positions[current];
    const to = positions[current + 1] ?? from;
    const visibleProgress = reducedMotion.matches ? current : progress;
    const fraction = visibleProgress - current;
    bus.style.transform = `translate(${from[0] + (to[0] - from[0]) * fraction}px, ${from[1] + (to[1] - from[1]) * fraction}px) translate(-50%, -50%)`;
    timeline.style.setProperty('--stop-progress', visibleProgress / (positions.length - 1));
    if (current === lastReported) return;

    lastReported = current;
    stopName.textContent = selected.stops[current].stop_name;
    stopCount.textContent = `Stop ${current + 1} of ${positions.length}`;
    stopButtons.forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }

  function redraw() {
    const { width, height } = canvas.getBoundingClientRect();
    positions = drawNetwork(canvas, selected, width, height);
    renderProgress();
  }

  function updatePlayButton() {
    const state =
      frame !== null ? 'playing' : progress === selected.stops.length - 1 ? 'finished' : 'ready';
    play.dataset.state = state;
    playLabel.textContent = { playing: 'Pause trip', finished: 'Replay trip', ready: 'Play trip' }[
      state
    ];
  }

  function pause() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    updatePlayButton();
  }

  function selectRoute(route, activeIndex) {
    pause();
    selected = route;
    progress = 0;
    lastReported = -1;
    root.style.setProperty('--trip-color', route.color);
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', index === activeIndex));
    timeline.innerHTML = route.stops
      .map((stop, index) => {
        const name = escapeHtml(stop.stop_name);
        return `<li><button type="button" data-stop-index="${index}" aria-label="Stop ${index + 1}: ${name}" title="${name}"><span>${name}</span></button></li>`;
      })
      .join('');
    stopButtons = [...timeline.querySelectorAll('button')];
    updatePlayButton();
    redraw();
  }

  play.addEventListener('click', () => {
    if (frame !== null) {
      pause();
      return;
    }

    const end = selected.stops.length - 1;
    if (progress === end) progress = 0;
    const start = progress;
    const startedAt = performance.now();
    const tick = (now) => {
      progress = Math.min(end, start + Math.max(0, now - startedAt) / segmentDuration);
      renderProgress();
      if (progress === end) {
        frame = null;
        updatePlayButton();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    updatePlayButton();
  });

  timeline.addEventListener('click', (event) => {
    const stop = event.target.closest('[data-stop-index]');
    if (!stop) return;
    progress = Number(stop.dataset.stopIndex);
    pause();
    renderProgress();
  });

  buttons.forEach((button, index) =>
    button.addEventListener('click', () => {
      if (routes[index] !== selected) selectRoute(routes[index], index);
    })
  );
  const resize = new ResizeObserver(redraw);
  resize.observe(canvas);
  selectRoute(selected, 0);

  return () => {
    resize.disconnect();
    pause();
  };
}
