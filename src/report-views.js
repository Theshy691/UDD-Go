import './reports.css';
import { escapeHtml as esc } from './domain.js';
import { reportReasons, reportStatuses } from './reports.js';
import { store } from './store.js';

const reportStatus = (status) =>
  `<span class="report-status ${esc(status)}">${esc(reportStatuses[status])}</span>`;

export function studentReports(tripId, button) {
  const reports = store.tripReports()?.filter((report) => report.trip_id === tripId);
  if (!reports) return '';
  const canReport = reports.length < Object.keys(reportReasons).length;
  return `<section class="student-reports" aria-label="Trip reports">
    ${canReport ? button('Report a trip issue', 'report-trip', { id: tripId, iconName: 'CircleAlert' }) : ''}
    ${
      reports.length
        ? `<ul class="student-report-list">${reports
            .map(
              (report) => `
      <li><span>${esc(reportReasons[report.reason])}</span>${reportStatus(report.status)}</li>`
            )
            .join('')}</ul>`
        : ''
    }
  </section>`;
}

export function reportQueue(reports, paginate) {
  if (!reports.length) return '';
  const rows = [...reports].sort(
    (a, b) =>
      (a.status === 'received') - (b.status === 'received') ||
      a.created_at.localeCompare(b.created_at)
  );
  return `<section class="dispatch-reports" aria-labelledby="dispatch-reports-title">
    <h3 id="dispatch-reports-title">Student reports <span class="count">${reports.length}</span></h3>
    ${paginate(
      'dispatch-reports',
      rows,
      (items) =>
        `<ul class="dispatch-list">${items
          .map(
            (report) => `
      <li><button type="button" class="dispatch-report" data-action="review-report" data-id="${esc(report.id)}">
        ${reportStatus(report.status)}
        <strong>${esc(reportReasons[report.reason])}</strong>
        <small>${esc(report.route_name)} · ${esc(report.service_date)}</small>
        <span class="dispatch-next">Review student report</span>
      </button></li>`
          )
          .join('')}</ul>`,
      { label: 'Student reports', size: 5 }
    )}
  </section>`;
}

export async function reportAction(action, id, ui, source) {
  if (action === 'report-trip' && store.profile.role === 'student') {
    const owner = store.profile.id;
    const reports = store.tripReports()?.filter((report) => report.trip_id === id);
    if (!reports) throw new Error('Trip reporting is unavailable.');
    const trip = await store.tripRecord(id);
    if (!trip || store.profile?.id !== owner) return true;
    const passenger =
      store.data.trip_passengers.find((p) => p.trip_id === id && p.student_id === owner) ||
      (await store.tripManifest(id)).find((p) => p.student_id === owner);
    if (!passenger || store.profile?.id !== owner) return true;

    const reasons = Object.entries(reportReasons).filter(
      ([reason]) => !reports.some((r) => r.reason === reason)
    );
    if (!reasons.length)
      throw new Error('All report reasons have already been used for this trip.');
    const operation_id = crypto.randomUUID();
    const dialog = ui.showModal(
      'Report a trip issue',
      'Your report goes to fleet dispatch.',
      `
      <form class="trip-report-form">
        <p class="note">${esc(trip.route_name)} · ${esc(trip.bus_label)}<br>Pickup at ${esc(passenger.pickup_name)}</p>
        ${ui.selectField('What happened?', 'reason', `<option value="" disabled selected>Choose a reason</option>${reasons.map(([code, label]) => `<option value="${code}">${esc(label)}</option>`).join('')}`)}
        <label class="field">Note (optional)<textarea name="note" maxlength="500" rows="4"></textarea><small>Up to 500 characters.</small></label>
        <p class="report-help">Need immediate help? <a href="tel:0755222496">Call UDD Security</a></p>
        ${ui.formFooter('Send report')}
      </form>`,
      {
        onSubmit: async (form) => {
          await store.action('submit_trip_report', {
            trip_id: id,
            reason: form.get('reason'),
            note: form.get('note'),
            operation_id,
          });
          if (dialog.isConnected) ui.closeModal();
          ui.toast('Report sent to fleet dispatch.');
        },
      }
    );
    return true;
  }
  if (action === 'review-report' && store.profile.role === 'admin') {
    const report = store.tripReports()?.find((item) => item.id === id);
    if (!report) throw new Error('This report is no longer open.');
    ui.showModal(
      esc(reportReasons[report.reason]),
      `Student report · ${esc(report.service_date)}`,
      `
      <div class="report-summary">
        <div class="between"><strong>${esc(report.student_name)}</strong>${reportStatus(report.status)}</div>
        <p>${esc(report.route_name)} · ${esc(report.bus_label)}</p>
        <p>Pickup at ${esc(report.pickup_name)}</p>
        ${report.note ? `<p class="note report-note">${esc(report.note)}</p>` : ''}
      </div>
      <div class="modal-footer">
        ${ui.button('View affected trip', 'report-view-trip', { id })}
        ${report.status === 'submitted' ? ui.button('Mark received', 'report-received', { id }) : ''}
        ${ui.button('Mark resolved', 'report-resolved', { id, primary: true })}
      </div>`
    );
    return true;
  }
  if (['report-received', 'report-resolved'].includes(action) && store.profile.role === 'admin') {
    const status = action === 'report-received' ? 'received' : 'resolved';
    await store.action('update_trip_report', { report_id: id, status });
    if (source.isConnected) ui.closeModal();
    ui.toast(`Report marked ${status}.`);
    return true;
  }
  return false;
}
