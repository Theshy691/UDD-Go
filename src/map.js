import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CAMPUS } from './seed.js';
import { escapeHtml, buildRouteGraph } from './domain.js';

const busSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6m8-6v6M5 6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v12H5V6Z"/><path d="M5 12h14M7 18v3m10-3v3M8 15h.01M16 15h.01M3 8v4m18-4v4"/></svg>';
let cartoKey = import.meta.env.VITE_CARTO_API_KEY;
export function configureMap(config) {cartoKey=config.cartoKey || cartoKey;}
function baseLayer() {
  return cartoKey
    ? L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',maxZoom:19})
    : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19,className:'osm-tiles'});
}
export class FleetMap {
  constructor(element, data, {selected, routeId = '', demo = true, onSelect = () => {}} = {}) {
    this.data = data; this.markers = new Map(); this.layers = []; this.routeId = routeId; this.onSelect = onSelect; this.element = element;
    this.map = L.map(element,{zoomControl:false,scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView(CAMPUS,13);
    L.control.zoom({position:'bottomright'}).addTo(this.map);
    let errors = 0;
    baseLayer().on('tileerror',() => {
      if (++errors === 8 && !element.querySelector('.map-fallback')) element.insertAdjacentHTML('beforeend','<div class="map-fallback">Map tiles unavailable. Check your internet connection.</div>');
    }).addTo(this.map);
    L.marker(CAMPUS,{icon:L.divIcon({className:'campus-marker',html:'<span>U</span>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(this.map).bindTooltip('Universidad de Dagupan',{direction:'top'});
    for (const route of data.routes.filter(r => !routeId || r.id === routeId)) {
      const stops = [...buildRouteGraph(data.route_stops.filter(s => s.route_id === route.id)).values()];
      if (!stops.length) continue;
      const points = stops.map(s => [s.latitude,s.longitude]);
      this.layers.push(L.polyline(points,{color:route.color || '#38bdf8',weight:4,opacity:route.status === 'active' ? .8 : .4,lineCap:'round',dashArray:route.status === 'active' ? undefined:'6 8'}).addTo(this.map));
      stops.forEach(stop => {
        this.layers.push(L.circleMarker([stop.latitude,stop.longitude],{radius:4,color:route.color,weight:2,fillColor:'#fff',fillOpacity:1}).addTo(this.map).bindTooltip(escapeHtml(stop.stop_name)));
      });
      const bus = data.buses.find(b => b.id === route.bus_id);
      if (!bus || bus.status !== 'active' || (!demo && !bus.position_at)) continue;
      this.addBusMarker(bus,route,bus.current_lat || points[0][0],bus.current_lng || points[0][1]);
    }
    if(!demo && !this.markers.size)element.insertAdjacentHTML('beforeend','<div class="map-status">Waiting for a driver location update.</div>');
    this.fit(routeId);
    if (selected) this.highlight(selected);
    this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize());
    this.resizeObserver.observe(element);
  }
  fit(routeId = this.routeId) {
    const points = this.data.route_stops.filter(s => !routeId || s.route_id === routeId).map(s => [s.latitude,s.longitude]);
    if (points.length) this.map.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:14,animate:false});
  }
  highlight(busId) {
    for (const [id,marker] of this.markers) marker.getElement()?.classList.toggle('selected',id === busId);
  }
  addBusMarker(bus,route,lat,lng) {
    const marker=L.marker([lat,lng],{icon:L.divIcon({className:'bus-marker',html:`<span style="--route-color:${/^#[0-9a-f]{6}$/i.test(route.color) ? route.color : '#38bdf8'}">${busSvg}</span><b>${escapeHtml(bus.label)}</b>`,iconSize:[40,40],iconAnchor:[20,20]}),zIndexOffset:1000}).addTo(this.map);
    marker.on('click',()=>this.onSelect(bus.id));
    marker.bindTooltip(`${escapeHtml(bus.label)} · ${escapeHtml(route.route_name)}`,{direction:'top',offset:[0,-20]});
    this.markers.set(bus.id,marker);
  }
  update({bus_id,lat,lng}) {
    const route=this.data.routes.find(r=>r.bus_id===bus_id);
    if(!route || (this.routeId && this.routeId!==route.id))return;
    if(!this.markers.has(bus_id)){
      const bus=this.data.buses.find(b=>b.id===bus_id);
      if(bus)this.addBusMarker(bus,route,lat,lng);
      this.element.querySelector('.map-status')?.remove();
    }
    this.markers.get(bus_id)?.setLatLng([lat,lng]);
  }
  destroy() { this.resizeObserver.disconnect(); this.map.stop(); this.map.remove(); }
}

export function createStopEditor(element,onAdd) {
  const map = L.map(element,{scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false}).setView(CAMPUS,13);
  baseLayer().addTo(map);
  const layer = L.layerGroup().addTo(map);
  map.on('click',event => onAdd(event.latlng.lat,event.latlng.lng));
  setTimeout(() => map.invalidateSize(),100);
  return {
    update(stops) {
      layer.clearLayers();
      const points = stops.map(s => [s.latitude,s.longitude]);
      if (points.length > 1) L.polyline(points,{color:'#38bdf8',weight:4}).addTo(layer);
      points.forEach((point,i) => L.marker(point,{icon:L.divIcon({className:'stop-marker',html:`<span>${i+1}</span>`,iconSize:[28,28],iconAnchor:[14,14]})}).addTo(layer));
    },
    destroy() {map.remove();},
  };
}
