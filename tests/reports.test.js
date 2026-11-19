import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetDatabase } from './helpers/fleet-db.js';
import { applyDemoReportAction } from '../src/reports.js';
import { makeSeed } from '../src/seed.js';
import { upgradeDemoTrips } from '../src/trips.js';

test('student trip report snapshots, permissions, retries, and status updates', async () => {
  const { db, migrate, ids, login, action, op, scalar } = await fleetDatabase();
  try {
    await migrate('supabase/migrations/002_services_and_route_versions.sql');
    await migrate('supabase/migrations/003_trip_reports.sql');
    await login('admin');
    await action('add_bus', {
      label: 'Bus 1',
      plate_number: 'SCH 1',
      capacity: 4,
      current_mileage: 100,
      next_service_mileage: 5000,
    });
    assert.equal(await scalar('select label from public.buses'), 'Bus 1');
    await db.exec('reset role');
    const trip = await scalar(
      `insert into public.trips(route_name,bus_label,plate_number,driver_id,driver_name,capacity,service_date,planned_at,planned_end_at,stops)
      values ('Campus loop','Bus 1','SCH 1',$1,'Driver',4,current_date,now(),now()+interval '1 hour','[{},{}]') returning id`,
      [ids.driver]
    );
    await db.query(
      `insert into public.trip_passengers(trip_id,student_id,student_name,student_code,pickup_stop_id,pickup_name,dropoff_stop_id,dropoff_name)
      values ($1,$2,'Student','STUDENT',gen_random_uuid(),'Park entrance',gen_random_uuid(),'Campus')`,
      [trip, ids.student]
    );

    const payload = op({
      trip_id: trip,
      reason: 'missed_pickup',
      note: '  Waited at the park.  ',
      bus_label: 'Spoofed bus',
      student_id: ids.other,
    });
    await login('other');
    await assert.rejects(action('submit_trip_report', payload), /assigned trips/);
    await login('driver');
    await assert.rejects(action('submit_trip_report', payload), /Only students/);
    await login('student');
    await assert.rejects(
      action('submit_trip_report', { ...payload, reason: 'invalid' }),
      /report reason/
    );
    await assert.rejects(
      action('submit_trip_report', { ...payload, note: 'a'.repeat(501) }),
      /500 characters/
    );
    const result = await action('submit_trip_report', payload);
    assert.deepEqual(await action('submit_trip_report', payload), result);
    await assert.rejects(
      action('submit_trip_report', { ...payload, operation_id: crypto.randomUUID() }),
      /already reported/
    );
    assert.deepEqual(
      (await db.query('select bus_label, pickup_name, note, status from public.trip_reports')).rows,
      [
        {
          bus_label: 'Bus 1',
          pickup_name: 'Park entrance',
          note: 'Waited at the park.',
          status: 'submitted',
        },
      ]
    );
    await assert.rejects(
      action('update_trip_report', { report_id: result.id, status: 'resolved' }),
      /Only fleet admins/
    );
    await assert.rejects(
      db.exec("update public.trip_reports set status='resolved'"),
      /permission denied/
    );
    for (const account of ['driver', 'other']) {
      await login(account);
      assert.equal(Number(await scalar('select count(*) from public.trip_reports')), 0);
    }
    await login('admin');
    assert.equal(await scalar('select status from public.trip_reports'), 'submitted');
    await action('update_trip_report', { report_id: result.id, status: 'received' });
    await login('student');
    assert.equal(await scalar('select status from public.trip_reports'), 'received');
    await login('admin');
    await action('update_trip_report', { report_id: result.id, status: 'resolved' });
    await action('update_trip_report', { report_id: result.id, status: 'received' });
    await login('student');
    assert.equal(await scalar('select status from public.trip_reports'), 'resolved');
    await db.exec('reset role');
    assert.deepEqual(
      (
        await db.query(
          "select distinct topic from realtime.sent where payload->>'table'='trip_reports' order by topic"
        )
      ).rows,
      [{ topic: 'fleet:admin' }, { topic: `user:${ids.student}` }]
    );
  } finally {
    await db.close();
  }
});

test('demo reports follow the same trip scope and forward-only status', () => {
  const data = makeSeed();
  upgradeDemoTrips(data);
  data.trip_reports = [];
  const student = data.users.find((user) => user.id === 'UDD-0006');
  const admin = data.users.find((user) => user.role === 'admin');
  const tripId = data.trip_passengers.find(
    (passenger) => passenger.student_id === student.id
  ).trip_id;
  const payload = { trip_id: tripId, reason: 'wrong_pickup', operation_id: crypto.randomUUID() };
  assert.throws(
    () =>
      applyDemoReportAction(data, student, 'submit_trip_report', { ...payload, trip_id: 'other' }),
    /assigned trips/
  );
  const result = applyDemoReportAction(data, student, 'submit_trip_report', payload);
  assert.deepEqual(applyDemoReportAction(data, student, 'submit_trip_report', payload), result);
  for (const status of ['received', 'resolved', 'received']) {
    applyDemoReportAction(data, admin, 'update_trip_report', { report_id: result.id, status });
  }
  assert.equal(data.trip_reports.length, 1);
  assert.equal(data.trip_reports[0].status, 'resolved');
});
