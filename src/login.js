import './login.css';

const demoRoles = {
  admin: {
    label: 'Fleet admin',
    icon: 'LayoutDashboard',
    email: 'admin@udd.edu.ph',
    title: 'See which buses are ready to go.',
    description: 'Review assignments and prepare the morning trips from the fleet workspace.',
    panel: 'Morning dispatch',
    rows: [
      ['Bus 01', 'Bonuan morning loop'],
      ['Bus 02', 'Calasiao express'],
      ['Bus 03', 'Lucao campus link'],
    ],
  },
  driver: {
    label: 'Driver',
    icon: 'BusFront',
    email: 'driver@udd.edu.ph',
    title: 'Follow your route, stop by stop.',
    description:
      'Check the passenger list, record boarding and drop-offs, and finish with a cabin check.',
    panel: 'Bonuan morning loop',
    rows: [
      ['First pickup', 'Bonuan Tondaligan'],
      ['Campus stop', 'UDD main campus'],
      ['Final step', 'Confirm cabin check'],
    ],
  },
  student: {
    label: 'Student',
    icon: 'GraduationCap',
    email: 'student@udd.edu.ph',
    title: 'Know where to meet your bus.',
    description: 'Find your pickup stop, boarding ID, and trip status in your journey view.',
    panel: 'My journey',
    rows: [
      ['Assigned bus', 'Bus 01'],
      ['Pickup stop', 'Bonuan Tondaligan'],
      ['Boarding ID', 'UDD-0001'],
    ],
  },
};

const schoolPreview = {
  icon: 'Route',
  title: 'Your workspace for the school run.',
  description: 'Your school account opens the workspace assigned to you.',
  panel: 'Campus transport',
  rows: [
    ['Fleet admin', 'Routes and dispatch'],
    ['Driver', 'Trips and passenger lists'],
    ['Student', 'Pickup and boarding ID'],
  ],
};

function preview(icon, info, demo) {
  return `<aside class="udd-login-preview" aria-labelledby="login-preview-title">
    <h2 id="login-preview-title">${info.title}</h2>
    <p>${info.description}</p>
    <div class="udd-login-preview-card">
      <div class="udd-login-preview-header">
        <span class="udd-login-preview-icon">${icon(info.icon)}</span>
        <h3>${info.panel}</h3>
        ${demo ? '<span class="udd-login-sample">Sample view</span>' : ''}
      </div>
      <dl>
        ${info.rows
          .map(
            ([label, value]) => `<div>
              <dt>${label}</dt>
              <dd>${value}</dd>
            </div>`
          )
          .join('')}
      </dl>
    </div>
    <span class="udd-login-preview-campus">${icon('MapPin')} Universidad de Dagupan</span>
  </aside>`;
}

function loginView({ icon, demo, method, role, prefill }) {
  const quick = demo && method === 'quick';
  const current = demoRoles[role];

  return `<div class="udd-login">
    <div class="udd-login-shell">
      <header class="udd-login-top">
        <button class="udd-login-brand" type="button" aria-label="UDD Go home" data-action="go-landing">
          <span class="brand-icon">${icon('BusFront')}</span>
          <strong>UDD <span>Go</span></strong>
        </button>
        <button class="udd-login-back" type="button" data-action="go-landing">${icon('ChevronLeft')} Back to home</button>
      </header>
      <main class="udd-login-main" aria-labelledby="login-title">
        <h1 id="login-title">Sign in to UDD Go</h1>
        <p>${quick ? 'Choose a workspace to try with sample trip data.' : 'Enter your school email and password to open your workspace.'}</p>
        ${
          demo
            ? `<div class="udd-login-switch" role="group" aria-label="Sign-in method">
                <button type="button" data-action="set-login-method" data-id="quick" aria-pressed="${quick}">Demo access</button>
                <button type="button" data-action="set-login-method" data-id="credentials" aria-pressed="${!quick}">School credentials</button>
              </div>`
            : ''
        }
        ${
          quick
            ? `<div class="udd-login-demo">
                <p id="login-role-label">Choose a demo role</p>
                <div class="udd-login-roles" role="group" aria-labelledby="login-role-label">
                  ${Object.entries(demoRoles)
                    .map(
                      ([
                        id,
                        item,
                      ]) => `<button type="button" data-action="select-login-role" data-id="${id}" aria-pressed="${id === role}">
                        ${icon(item.icon)} ${item.label}
                      </button>`
                    )
                    .join('')}
                </div>
                <button type="button" class="udd-login-submit" data-action="quick-login" data-id="${role}">
                  Open ${current.label.toLowerCase()} demo ${icon('ArrowRight')}
                </button>
              </div>`
            : `<form id="login-form" class="udd-login-form">
                <div class="udd-login-field">
                  <label for="login-email">School email</label>
                  <input id="login-email" name="email" type="email" autocomplete="username" placeholder="name@udd.edu.ph"
                    value="${demo && prefill ? current.email : ''}" required />
                </div>
                <div class="udd-login-field">
                  <label for="login-password">Password</label>
                  <div class="udd-login-password">
                    <input id="login-password" name="password" type="password" autocomplete="current-password"
                      value="${demo && prefill ? 'demo-password' : ''}" minlength="6" required />
                    <button type="button" class="udd-login-password-toggle" aria-controls="login-password" aria-label="Show password">Show</button>
                  </div>
                </div>
                <p class="form-error" role="alert"></p>
                <button type="submit" class="udd-login-submit">Sign in ${icon('ArrowRight')}</button>
              </form>
              ${
                demo
                  ? `<details class="udd-login-demo-accounts" ${prefill ? 'open' : ''}>
                      <summary>Demo accounts ${icon('ChevronDown')}</summary>
                      <p>Choose an account to fill in the sign-in form.</p>
                      <ul>
                        ${Object.entries(demoRoles)
                          .map(
                            ([
                              id,
                              item,
                            ]) => `<li><button type="button" data-action="prefill-role" data-id="${id}">
                              <strong>${item.label}</strong><span>${item.email}</span>
                            </button></li>`
                          )
                          .join('')}
                      </ul>
                    </details>`
                  : ''
              }`
        }
        <button type="button" class="udd-login-help" data-action="help">${icon('CircleHelp')} Help &amp; guidelines</button>
      </main>
      <footer class="udd-login-footer">
        ${demo ? 'Demo changes stay in this browser.' : 'Universidad de Dagupan campus transport'}
      </footer>
    </div>
    ${preview(icon, demo ? current : schoolPreview, demo)}
  </div>`;
}

export function mountLogin(app, options) {
  app.innerHTML = loginView(options);
  const toggle = app.querySelector('.udd-login-password-toggle');
  if (!toggle) return;
  const password = app.querySelector('#login-password');
  toggle.addEventListener('click', () => {
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });
}
