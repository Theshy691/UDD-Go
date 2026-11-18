import './landing.css';
import { mountRoutePreview, routePreview } from './landing-routes.js';

const roles = [
  {
    id: 'admin',
    label: 'Fleet admin',
    demoLabel: 'Try the admin demo',
    icon: 'LayoutDashboard',
    title: 'Plan the next school run.',
    description:
      'Set stop order, assign buses and drivers, and prepare the passenger list before departure.',
    preview: 'Morning dispatch',
    rows: [
      ['Route', 'Bonuan morning loop'],
      ['Vehicle', 'Bus 01'],
      ['Task', 'Prepare passenger list'],
    ],
  },
  {
    id: 'driver',
    label: 'Driver',
    demoLabel: 'Try the driver demo',
    icon: 'BusFront',
    title: 'Know who’s on board.',
    description:
      'See the stops in order, record each pickup and drop-off, and confirm the cabin is clear at the end of the trip.',
    preview: 'Trip checklist',
    rows: [
      ['Before departure', 'Review assigned stops'],
      ['At each stop', 'Record boarding and drop-offs'],
      ['After the last stop', 'Confirm cabin check'],
    ],
  },
  {
    id: 'student',
    label: 'Student & family',
    demoLabel: 'Try the student demo',
    icon: 'GraduationCap',
    title: 'Know where to meet your bus.',
    description:
      'Find your pickup stop and boarding ID in one place. Follow the bus when your driver shares their location.',
    preview: 'My journey',
    rows: [
      ['Assigned bus', 'Bus 01'],
      ['Pickup', 'Bonuan Tondaligan'],
      ['Boarding ID', 'UDD-0001'],
    ],
  },
];

const questions = [
  [
    'Can I try UDD Go without an account?',
    'In demo mode, you can open any of the three workspaces with sample data. Changes are saved in this browser. A connected school workspace requires school credentials.',
  ],
  [
    'Is the route map showing live buses?',
    'The landing page uses sample Dagupan stops. In the school portal, authorized users can follow an active trip when the driver shares their device location.',
  ],
  [
    'What can students and families see?',
    'The linked student account shows the assigned bus, pickup stop, boarding ID, and trip status.',
  ],
];

function roleExplorer(icon, demo) {
  return `<section class="udd-landing-roles udd-landing-width" id="workspaces" aria-labelledby="workspaces-title">
    <h2 id="workspaces-title">One trip. Three points of view.</h2>
    <div class="udd-landing-role-tabs" role="tablist" aria-label="Workspaces">
      ${roles
        .map(
          (role, index) => `<button type="button" role="tab" id="workspace-tab-${role.id}"
            aria-selected="${index === 0}" aria-controls="workspace-${role.id}" tabindex="${index === 0 ? 0 : -1}">
            ${icon(role.icon)} ${role.label}
          </button>`
        )
        .join('')}
    </div>
    ${roles
      .map(
        (
          role,
          index
        ) => `<article class="udd-landing-workspace" id="workspace-${role.id}" role="tabpanel"
          aria-labelledby="workspace-tab-${role.id}" ${index === 0 ? '' : 'hidden'}>
          <div>
            <h3>${role.title}</h3>
            <p>${role.description}</p>
            <button type="button" class="udd-landing-button" data-action="${demo ? 'quick-login' : 'go-login'}" data-id="${role.id}">
              ${demo ? role.demoLabel : 'Open school portal'}
              ${icon('ArrowUpRight')}
            </button>
          </div>
          <div class="udd-landing-workspace-preview">
            <h4>${icon(role.icon)} ${role.preview}</h4>
            <dl>
              ${role.rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
            </dl>
          </div>
        </article>`
      )
      .join('')}
  </section>`;
}

export function mountLanding(app, { icon, demo }) {
  app.innerHTML = `<div class="udd-landing" id="landing-home">
    <a class="udd-landing-skip" href="#landing-content">Skip to content</a>
    <header class="udd-landing-header">
      <div class="udd-landing-nav udd-landing-width">
        <a class="udd-landing-brand" href="#landing-home" aria-label="UDD Go home">
          <span class="udd-landing-brand-mark">${icon('BusFront')}</span>
          <strong>UDD Go</strong>
        </a>
        <nav aria-label="Landing page">
          <a href="#routes">Routes</a>
          <a href="#workspaces">Workspaces</a>
          <a href="#questions">FAQ</a>
        </nav>
        <button type="button" class="udd-landing-portal" data-action="go-login">
          School portal ${icon('ArrowUpRight')}
        </button>
      </div>
    </header>
    <main id="landing-content" tabindex="-1">
      <section class="udd-landing-hero udd-landing-width" aria-labelledby="landing-title">
        <div class="udd-landing-intro">
          <p class="udd-landing-campus">${icon('MapPin')} Universidad de Dagupan</p>
          <h1 id="landing-title">The school<br /> run, mapped.</h1>
          <p class="udd-landing-lead">Plan bus routes, check students in, and follow the trip from pickup to campus.</p>
          <div class="udd-landing-actions">
            <button type="button" class="udd-landing-button" data-action="go-login">
              Open school portal ${icon('ArrowUpRight')}
            </button>
            <a href="#workspaces">${demo ? 'Try a demo' : 'Explore workspaces'}</a>
          </div>
        </div>
        ${routePreview(icon)}
      </section>
      ${roleExplorer(icon, demo)}
      <section class="udd-landing-faq udd-landing-width" id="questions" aria-labelledby="questions-title">
        <h2 id="questions-title">Common questions</h2>
        <div>
          ${questions
            .map(
              ([question, answer]) => `<details name="landing-faq">
                <summary>${question} ${icon('Plus')}</summary>
                <p>${answer}</p>
              </details>`
            )
            .join('')}
        </div>
      </section>
    </main>
    <footer class="udd-landing-footer">
      <div class="udd-landing-width">
        <p><strong>UDD Go</strong> <span>Universidad de Dagupan</span></p>
        <button type="button" data-action="help">Help &amp; guidelines ${icon('ArrowUpRight')}</button>
      </div>
    </footer>
  </div>`;
  const tabs = [...app.querySelectorAll('.udd-landing-role-tabs [role="tab"]')];

  function selectTab(selected) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute('aria-selected', active);
      app.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      const next = {
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });

  return mountRoutePreview(app.querySelector('#routes'));
}
