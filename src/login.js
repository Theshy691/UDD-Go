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

function previewContent(icon, info, demo) {
  return `<h2 id="login-preview-title">${info.title}</h2>
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
    </div>`;
}

function preview(icon, info, demo) {
  return `<aside class="udd-login-preview" aria-labelledby="login-preview-title">
    <div class="udd-login-preview-content">${previewContent(icon, info, demo)}</div>
    <span class="udd-login-preview-campus">${icon('MapPin')} Universidad de Dagupan</span>
  </aside>`;
}

const loginCopy = {
  quick: 'Choose a workspace to try with sample trip data.',
  credentials: 'Enter your school email and password to open your workspace.',
};

function demoPanel(icon, role, quick) {
  return `<div class="udd-login-panel" id="login-demo-panel" ${quick ? '' : 'hidden'}>
    <div class="udd-login-demo">
      <p id="login-role-label">Choose a demo role</p>
      <div class="udd-login-roles" data-selection="${role}" role="group" aria-labelledby="login-role-label">
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
        <span>Open ${demoRoles[role].label.toLowerCase()} demo</span> ${icon('ArrowRight')}
      </button>
    </div>
  </div>`;
}

function credentialsPanel(icon, demo, quick) {
  return `<div class="udd-login-panel" id="login-credentials-panel" ${quick ? 'hidden' : ''}>
    <form id="login-form" class="udd-login-form">
      <div class="udd-login-field">
        <label for="login-email">School email</label>
        <input id="login-email" name="email" type="email" autocomplete="username" placeholder="name@udd.edu.ph" required />
      </div>
      <div class="udd-login-field">
        <label for="login-password">Password</label>
        <div class="udd-login-password">
          <input id="login-password" name="password" type="password" autocomplete="current-password" minlength="6" required />
          <button type="button" class="udd-login-password-toggle" aria-controls="login-password" aria-label="Show password">Show</button>
        </div>
      </div>
      <p class="form-error" role="alert"></p>
      <button type="submit" class="udd-login-submit">Sign in ${icon('ArrowRight')}</button>
    </form>
    ${
      demo
        ? `<details class="udd-login-demo-accounts">
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
    }
  </div>`;
}

function loginView({ icon, demo, method, role }) {
  const quick = demo && method === 'quick';
  const current = demoRoles[role];

  return `<div class="udd-login" data-demo="${demo}" data-method="${quick ? 'quick' : 'credentials'}" data-role="${role}">
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
        <p id="login-description">${loginCopy[quick ? 'quick' : 'credentials']}</p>
        ${
          demo
            ? `<div class="udd-login-switch" data-selection="${quick ? 'quick' : 'credentials'}" role="group" aria-label="Sign-in method">
                <button type="button" data-action="set-login-method" data-id="quick" aria-controls="login-demo-panel" aria-pressed="${quick}">Demo access</button>
                <button type="button" data-action="set-login-method" data-id="credentials" aria-controls="login-credentials-panel" aria-pressed="${!quick}">School credentials</button>
              </div>`
            : ''
        }
        ${demo ? demoPanel(icon, role, quick) : ''}
        ${credentialsPanel(icon, demo, quick)}
        <button type="button" class="udd-login-help" data-action="help">${icon('CircleHelp')} Help &amp; guidelines</button>
      </main>
      <footer class="udd-login-footer">
        ${demo ? 'Demo changes stay in this browser.' : 'Universidad de Dagupan campus transport'}
      </footer>
    </div>
    ${preview(icon, demo ? current : schoolPreview, demo)}
  </div>`;
}

function initControls(root) {
  const toggle = root.querySelector('.udd-login-password-toggle');
  const password = root.querySelector('#login-password');
  toggle.addEventListener('click', () => {
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const group = event.target.closest('.udd-login-switch, .udd-login-roles');
    if (!group) return;
    const buttons = [...group.querySelectorAll('button')];
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (buttons.indexOf(event.target) + delta + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next].click();
  });
}

function selectSegment(group, selected) {
  group.dataset.selection = selected;
  for (const button of group.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', button.dataset.id === selected);
  }
}

export function mountLogin(app, options) {
  const { icon, demo, method, role, prefill } = options;
  let root = app.querySelector('.udd-login');
  if (root?.dataset.demo !== String(demo)) {
    app.innerHTML = loginView(options);
    root = app.querySelector('.udd-login');
    initControls(root);
  }

  if (!demo) return;
  if (root.dataset.method !== method) {
    root.dataset.method = method;
    selectSegment(root.querySelector('.udd-login-switch'), method);
    root.querySelector('#login-description').textContent = loginCopy[method];
    root.querySelector('#login-demo-panel').hidden = method !== 'quick';
    root.querySelector('#login-credentials-panel').hidden = method !== 'credentials';
    const reveal = root.querySelector('.udd-login-panel:not([hidden])');
    reveal.classList.add('udd-login-reveal');
  }

  if (root.dataset.role !== role) {
    root.dataset.role = role;
    selectSegment(root.querySelector('.udd-login-roles'), role);
    const action = root.querySelector('[data-action="quick-login"]');
    action.dataset.id = role;
    action.querySelector('span').textContent = `Open ${demoRoles[role].label.toLowerCase()} demo`;
    root.querySelector('.udd-login-preview-content').innerHTML =
      `<div class="udd-login-reveal">${previewContent(icon, demoRoles[role], demo)}</div>`;
  }

  if (prefill) {
    root.querySelector('#login-email').value = demoRoles[role].email;
    root.querySelector('#login-password').value = 'demo-password';
    root.querySelector('.form-error').textContent = '';
    root.querySelector('.udd-login-demo-accounts').open = true;
  }
}
