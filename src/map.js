import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { CAMPUS } from './seed.js';
import { escapeHtml, buildRouteGraph } from './domain.js';

const busSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6v6m8-6v6M5 6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v12H5V6Z"/><path d="M5 12h14M7 18v3m10-3v3M8 15h.01M16 15h.01M3 8v4m18-4v4"/></svg>';
const schoolSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M6 11v6c4 3 8 3 12 0v-6M21 9v7"/></svg>';
const colorOf = route => /^#[0-9a-f]{6}$/i.test(route.color) ? route.color : '#2ba9e0';
let cartoKey = import.meta.env.VITE_CARTO_API_KEY;
export function configureMap(config) {cartoKey=config.cartoKey || cartoKey;}
function baseLayer() {
  return cartoKey
    ? L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',maxZoom:19,subdomains:'abcd',className:'udd-basemap'})
    : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19,className:'udd-basemap osm-tiles'});
}
function mapOptions(extra={}) {
  return {scrollWheelZoom:false,zoomSnap:.25,zoomDelta:.5,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,...extra};
}
function addCampus(map) {
  const marker=L.marker(CAMPUS,{title:'Universidad de Dagupan (Main Campus)',alt:'Universidad de Dagupan (Main Campus)',zIndexOffset:800,
    icon:L.divIcon({className:'campus-marker',html:`<div class="campus-pin"><span class="campus-pin-icon">${schoolSvg}</span><span class="campus-pin-label">UDD<small>Main campus</small></span><i class="campus-beacon" title="University Hub"></i></div>`,iconSize:[42,42],iconAnchor:[21,21]})})
    .addTo(map).bindTooltip('<strong>Universidad de Dagupan</strong>Main campus &middot; Transit Terminal',{direction:'top',offset:[0,-24],className:'map-tooltip'});
  marker.getElement()?.setAttribute('aria-label','Universidad de Dagupan Main Campus');
  return marker;
}
function stopIcon(stop,color,editor=false) {
  return L.divIcon({className:`route-stop-marker${editor?' editor-stop-marker':''}`,html:`<span class="map-stop-node" style="--route-color:${color}"><span>${stop.stop_sequence}</span></span>`,iconSize:[24,24],iconAnchor:[12,12]});
}
export class FleetMap {
  constructor(element, data, {selected, routeId = '', demo = true, showVehicles=true, onSelect = () => {}} = {}) {
    this.data=data;this.markers=new Map();this.groups=[];this.routeId=routeId;this.onSelect=onSelect;this.element=element;
    this.map=L.map(element,mapOptions({zoomControl:false})).setView(CAMPUS,13);
    const zoom=L.control.zoom({position:'bottomright',zoomInTitle:'Zoom in',zoomOutTitle:'Zoom out'}).addTo(this.map);
    zoom.getContainer().addEventListener('pointerdown',()=>{this.userMoved=true;});
    this.map.on('dragstart',()=>{this.userMoved=true;});
    L.control.scale({position:'bottomright',imperial:false,maxWidth:76}).addTo(this.map);
    let errors=0;
    baseLayer().on('tileerror',()=>{
      if(++errors===8 && !element.querySelector('.map-fallback'))element.insertAdjacentHTML('beforeend','<div class="map-fallback" role="status">Some map details could not load. Check your connection.</div>');
    }).addTo(this.map);
    this.campusMarker=addCampus(this.map);
    this.map.on('moveend',()=>this.alignMarkerLabels());
    for(const route of data.routes.filter(r=>!routeId || r.id===routeId)) {
      const stops=[...buildRouteGraph(data.route_stops.filter(s=>s.route_id===route.id)).values()];
      if(!stops.length)continue;
      const points=stops.map(s=>[s.latitude,s.longitude]),color=colorOf(route);
      const casing=L.polyline(points,{color:'#ffffff',weight:8.5,opacity:.96,lineCap:'round',lineJoin:'round',interactive:false}).addTo(this.map);
      const line=L.polyline(points,{color,weight:4.5,opacity:.98,lineCap:'round',lineJoin:'round',dashArray:route.status==='active'?undefined:'5 7',interactive:false}).addTo(this.map);
      const nodes=stops.filter(stop=>this.map.distance([stop.latitude,stop.longitude],CAMPUS)>25).map(stop=>
        L.marker([stop.latitude,stop.longitude],{title:`Stop ${stop.stop_sequence}: ${stop.stop_name}`,alt:`Stop ${stop.stop_sequence}: ${stop.stop_name}`,zIndexOffset:200,icon:stopIcon(stop,color)})
          .addTo(this.map).bindTooltip(`<strong>Stop ${stop.stop_sequence}</strong>${escapeHtml(stop.stop_name)}`,{direction:'top',offset:[0,-14],className:'map-tooltip'}));
      nodes.forEach(node=>node.getElement()?.setAttribute('aria-label',node.options.title));
      this.groups.push({route,line,casing,nodes});
      const bus=data.buses.find(b=>b.id===route.bus_id);
      if(showVehicles && bus?.status==='active' && (demo || bus.position_at))this.addBusMarker(bus,route,bus.current_lat ?? points[0][0],bus.current_lng ?? points[0][1]);
    }
    this.addRouteKey();
    if(!this.groups.length)element.insertAdjacentHTML('beforeend','<div class="map-status" role="status">Select a route to see its stops.</div>');
    else if(showVehicles && !demo && !this.markers.size && this.groups.some(g=>g.route.status==='active'))element.insertAdjacentHTML('beforeend','<div class="map-status" role="status">Waiting for a driver location update.</div>');
    this.highlight(selected);
    this.fit();
    // Leaflet caches its initial size. Reframe after grid/fonts/viewport layout settles.
    this.resizeObserver=new ResizeObserver(()=>{
      if(this.destroyed)return;
      this.map.invalidateSize({pan:false});
      if(!this.userMoved)this.fit();
    });
    this.resizeObserver.observe(element);
  }
  addRouteKey() {
    if(!this.groups.length)return;
    const key=L.control({position:'bottomleft'});
    key.onAdd=()=>{
      const container=L.DomUtil.create('div','map-route-key');
      container.setAttribute('aria-label','Map route legend');
      const shown=this.groups.slice(0,4);
      container.innerHTML=`<div class="map-route-key-items">${shown.map(({route},i)=>`<button type="button" data-map-route="${i}" aria-label="Focus ${escapeHtml(route.route_name)}" aria-pressed="false" style="--route-color:${colorOf(route)}"><i></i><span>${escapeHtml(route.area || route.route_name)}</span></button>`).join('')}${this.groups.length>4?`<span class="map-route-key-more">+${this.groups.length-4} routes</span>`:''}</div><p>Stops shown in travel order</p>`;
      L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);
      container.querySelectorAll('button').forEach((button,i)=>button.addEventListener('click',()=>{
        this.highlight(shown[i].route.bus_id);this.onSelect(shown[i].route.bus_id);
      }));
      this.keyElement=container;return container;
    };
    key.addTo(this.map);
  }
  fit(routeId = this.routeId) {
    if(this.destroyed)return;
    const points=this.data.route_stops.filter(s=>!routeId || s.route_id===routeId).map(s=>[s.latitude,s.longitude]);
    for(const marker of this.markers.values())points.push(marker.getLatLng());
    this.userMoved=false;
    if(points.length)this.map.fitBounds(L.latLngBounds(points),{paddingTopLeft:[32,58],paddingBottomRight:[62,82],maxZoom:14.5,animate:false});
  }
  highlight(busId) {
    if(this.destroyed)return;
    const focus=this.groups.some(g=>g.route.bus_id===busId)?busId:this.groups.length===1?this.groups[0].route.bus_id:null;
    this.selectedBus=focus;
    for(const [id,marker] of this.markers){marker.getElement()?.classList.toggle('selected',id===focus);marker.setZIndexOffset(id===focus?1200:1000);}
    this.groups.forEach((group,i)=>{
      const muted=focus && group.route.bus_id!==focus;
      group.line.setStyle({opacity:muted ? 0.35 : 0.98,weight:muted?2.8:4.5});
      group.casing.setStyle({opacity:muted ? 0.5 : 0.98,weight:muted?6:8.5});
      group.nodes.forEach(node=>node.getElement()?.classList.toggle('is-muted',Boolean(muted)));
      this.keyElement?.querySelector(`[data-map-route="${i}"]`)?.setAttribute('aria-pressed',String(group.route.bus_id===focus));
    });
  }
  alignMarkerLabels() {
    if(this.destroyed)return;
    const width=this.map.getSize().x;
    for(const marker of this.markers.values())marker.getElement()?.classList.toggle('label-left',this.map.latLngToContainerPoint(marker.getLatLng()).x>width-175);
    if(this.campusMarker)this.campusMarker.getElement()?.classList.toggle('label-left',this.map.latLngToContainerPoint(this.campusMarker.getLatLng()).x>width-125);
  }
  addBusMarker(bus,route,lat,lng) {
    const marker=L.marker([lat,lng],{title:`${bus.label}: ${route.route_name}`,alt:`${bus.label}: ${route.route_name}`,icon:L.divIcon({className:'bus-marker',html:`<div class="bus-pin" style="--route-color:${colorOf(route)}"><span class="bus-pin-icon">${busSvg}<span class="bus-radar-ring"></span></span><span class="bus-pin-copy"><strong>${escapeHtml(bus.label)}</strong><small>${escapeHtml(route.area || route.route_name)}</small></span><i class="bus-pin-status" title="Live GPS"></i></div>`,iconSize:[46,46],iconAnchor:[23,23]}),zIndexOffset:1000}).addTo(this.map);
    marker.getElement()?.setAttribute('aria-label',`${bus.label}: ${route.route_name}`);
    marker.on('click',()=>{this.highlight(bus.id);this.onSelect(bus.id);});
    this.markers.set(bus.id,marker);
    if(bus.id===this.selectedBus)marker.getElement()?.classList.add('selected');
  }
  update({bus_id,trip_id,location_epoch,lat,lng}) {
    if(this.destroyed)return;
    const route=this.data.routes.find(r=>r.bus_id===bus_id && r.id===trip_id && r.status==='active' && r.location_epoch===location_epoch);
    if(!route || (this.routeId && this.routeId!==route.id))return;
    if(!this.markers.has(bus_id)){
      const bus=this.data.buses.find(b=>b.id===bus_id);if(bus)this.addBusMarker(bus,route,lat,lng);
      this.element.querySelector('.map-status')?.remove();
    }
    this.markers.get(bus_id)?.setLatLng([lat,lng]);
    this.alignMarkerLabels();
  }
  destroy() {if(this.destroyed)return;this.destroyed=true;this.resizeObserver.disconnect();this.map.stop();this.map.remove();}
}

export function createStopEditor(element,onAdd) {
  const map=L.map(element,mapOptions()).setView(CAMPUS,13);
  baseLayer().addTo(map);addCampus(map);
  const layer=L.layerGroup().addTo(map);
  let firstUpdate=true,initialPoints=[],destroyed=false;
  map.on('click',event=>onAdd(event.latlng.lat,event.latlng.lng));
  const resizeTimer=setTimeout(()=>{if(!destroyed){map.invalidateSize({pan:false});if(initialPoints.length>1)map.fitBounds(initialPoints,{padding:[34,34],maxZoom:14.5,animate:false});}},100);
  return {
    update(stops) {
      layer.clearLayers();
      const points=stops.map(s=>[s.latitude,s.longitude]);
      if(firstUpdate){initialPoints=points;firstUpdate=false;}
      if(points.length>1){L.polyline(points,{color:'#fff',weight:8.5,interactive:false}).addTo(layer);L.polyline(points,{color:'#2ba9e0',weight:4.5,dashArray:'5 7',interactive:false}).addTo(layer);}
      stops.forEach((stop,i)=>L.marker(points[i],{title:`Stop ${i+1}: ${stop.stop_name}`,alt:`Stop ${i+1}: ${stop.stop_name}`,icon:stopIcon({...stop,stop_sequence:i+1},'#2ba9e0',true),zIndexOffset:700}).addTo(layer));
    },
    destroy(){destroyed=true;clearTimeout(resizeTimer);map.stop();map.remove();},
  };
}
