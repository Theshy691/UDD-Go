import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityFor,buildBoardingIndex,validateBoarding,buildRouteGraph,maintenanceStatus,escapeHtml,csvCell,validCoordinates} from '../src/domain.js';

const bus={capacity:2,current_mileage:1000,next_service_mileage:1500};
const assignments=[{student_id:'S-1',route_id:'R-1',status:'boarded'},{student_id:'S-2',route_id:'R-1',status:'assigned'},{student_id:'S-3',route_id:'R-2',status:'assigned'},{student_id:'S-4',route_id:'R-1',status:'cancelled'}];
test('capacity excludes other routes and cancelled seats',()=>{
  assert.deepEqual(capacityFor(bus,'R-1',assignments),{assigned:2,boarded:1,available:0,capacity:2});
});
test('boarding accepts assigned IDs and rejects duplicates, wrong routes, and full buses',()=>{
  const index=buildBoardingIndex(assignments,'R-1');
  assert.equal(validateBoarding(index,' s-2 ',bus,1).student_id,'S-2');
  assert.throws(()=>validateBoarding(index,'S-1',bus,1),/already boarded/);
  assert.throws(()=>validateBoarding(index,'S-3',bus,1),/not assigned/);
  assert.throws(()=>validateBoarding(index,'S-4',bus,1),/not assigned/);
  assert.throws(()=>validateBoarding(index,'S-2',bus,2),/full/);
});
test('route graph sorts stops, links only consecutive nodes, and has a terminal node',()=>{
  const graph=buildRouteGraph([{id:'B',stop_sequence:2},{id:'A',stop_sequence:1},{id:'C',stop_sequence:3}]);
  assert.deepEqual([...graph.keys()],['A','B','C']);
  assert.deepEqual(graph.get('A').neighbors,['B']);
  assert.deepEqual(graph.get('C').neighbors,[]);
});
test('maintenance alerts include exact service and 500 km thresholds',()=>{
  assert.equal(maintenanceStatus(bus).status,'due_soon');
  assert.equal(maintenanceStatus({...bus,current_mileage:1500}).status,'overdue');
  assert.equal(maintenanceStatus({...bus,current_mileage:999}).status,'healthy');
});
test('untrusted HTML and spreadsheet formulas are escaped',()=>{
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});
test('GPS rejects invalid and nonfinite coordinates',()=>{
  assert.equal(validCoordinates(16.04,120.34),true);
  for(const [lat,lng] of [[91,120],[16,181],[NaN,120],[16,Infinity],['16',120]])assert.equal(validCoordinates(lat,lng),false);
});
