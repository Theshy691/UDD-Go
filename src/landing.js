import './landing.css';
import { mountRoutePreview, routePreview } from './landing-routes.js';
import { mountLandingSignals } from './landing-signals.js';
import { landingWordmark } from './landing-wordmark.js';

const benefits = [
  {
    icon: 'CalendarDays',
    title: 'Prepare the morning run',
    description:
      'Assign a bus and driver, set the stop order, and prepare the passenger list before departure.',
  },
  {
    icon: 'UserRoundCheck',
    title: 'Keep track of riders',
    description: 'Record boarding and drop-offs during the trip, then confirm the cabin is clear.',
  },
  {
    icon: 'MapPin',
    title: 'Know where to meet the bus',
    description: 'Check your assigned pickup stop, boarding ID, and trip status in My journey.',
  },
];

const roles = [
  {
    id: 'admin',
    label: 'Fleet admin',
    demoLabel: 'Open fleet admin demo',
    icon: 'LayoutDashboard',
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
    demoLabel: 'Open driver demo',
    icon: 'BusFront',
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
    demoLabel: 'Open student demo',
    icon: 'GraduationCap',
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

const guidelines = [
  {
    title: 'Before departure',
    summary: 'Confirm the trip and pickup stop',
    description:
      'Fleet admins prepare the trip in Trips & history and confirm the bus, driver, and passenger list. Students and families can check My journey for their pickup stop and boarding ID.',
    workspace: 'admin',
    link: 'Explore fleet admin',
  },
  {
    title: 'At pickup',
    summary: 'Have your boarding ID ready',
    description:
      'Wait at your assigned stop and have your boarding ID ready when the bus arrives. Drivers record boarding in their trip checklist. Families can follow the active trip when the driver shares their location.',
    workspace: 'student',
    link: 'Explore the student view',
  },
  {
    title: 'After the last stop',
    summary: 'Record drop-offs and check the cabin',
    description:
      'Drivers record each drop-off, confirm the cabin is empty, and complete the trip. Fleet admins can review the completed run in Trips & history.',
    workspace: 'driver',
    link: 'Explore the driver view',
  },
];

function portalButton(icon, className = 'udd-landing-button') {
  return `<button type="button" class="${className}" data-action="go-login">
    Open school portal ${icon('ArrowUpRight')}
  </button>`;
}

function demoLink(icon, className) {
  return `<a href="#workspaces" class="${className}">${icon('Users')} Choose a demo role</a>`;
}

function tripBenefits(icon) {
  return `<section class="udd-landing-benefits udd-landing-width" aria-labelledby="benefits-title">
    <h2 id="benefits-title">From dispatch to drop-off</h2>
    <ul>
      ${benefits
        .map(
          (benefit) => `<li>
            <div class="udd-landing-benefit-icon">${icon(benefit.icon)}</div>
            <div>
              <h3>${benefit.title}</h3>
              <p>${benefit.description}</p>
            </div>
          </li>`
        )
        .join('')}
    </ul>
  </section>`;
}

function tripGuide(icon) {
  return `<section class="udd-landing-guide udd-landing-width" id="guidelines" aria-labelledby="guidelines-title">
    <div class="udd-landing-guide-intro">
      <h2 id="guidelines-title">School run guidelines</h2>
      <p>From the first pickup to the final cabin check, here’s what to do at each stage of a UDD Go trip.</p>
    </div>
    <ol class="udd-landing-guide-stops">
      ${guidelines
        .map(
          (step, index) => `<li>
            <details name="landing-guidelines" ${index === 0 ? 'open' : ''}>
              <summary>
                <span class="udd-landing-guide-stop" aria-hidden="true">${index + 1}</span>
                <span class="udd-landing-guide-label">
                  <strong>${step.title}</strong>
                  <span>${step.summary}</span>
                </span>
                ${icon('ChevronDown')}
              </summary>
              <div class="udd-landing-guide-body">
                <p>${step.description}</p>
                <a href="#workspace-${step.workspace}">${step.link} ${icon('ArrowRight')}</a>
              </div>
            </details>
          </li>`
        )
        .join('')}
    </ol>
  </section>`;
}

function roleExplorer(icon, demo) {
  return `<section class="udd-landing-roles udd-landing-width" aria-labelledby="workspaces">
    <h2 id="workspaces" tabindex="-1">${demo ? 'Choose a demo role' : 'One trip. Three points of view.'}</h2>
    ${demo ? '<p>Explore a workspace with sample school trips. No account needed.</p>' : ''}
    <ul class="udd-landing-workspaces" role="list">
      ${roles
        .map(
          (role) => `<li class="udd-landing-workspace" id="workspace-${role.id}" tabindex="-1">
            <h3><span class="udd-landing-benefit-icon">${icon(role.icon)}</span>${role.label}</h3>
            <p>${role.description}</p>
            <details class="udd-landing-workspace-preview">
              <summary>${role.preview} ${icon('ChevronDown')}</summary>
              <dl>
                ${role.rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
              </dl>
            </details>
            ${
              demo
                ? `<button type="button" class="udd-landing-portal" data-action="quick-login" data-id="${role.id}">
                    ${role.demoLabel} ${icon('ArrowUpRight')}
                  </button>`
                : ''
            }
          </li>`
        )
        .join('')}
    </ul>
  </section>`;
}

export function mountLanding(app, { icon, demo }) {
  app.innerHTML = `<div class="udd-landing" id="landing-home">
    <a class="udd-landing-skip" href="#landing-content">Skip to content</a>
    <header class="udd-landing-header">
      <div class="udd-landing-nav udd-landing-width">
        <a class="udd-landing-brand udd-brand-lockup" href="#landing-home" aria-label="UDD Go home">
          <span class="brand-icon">${icon('BusFront')}</span>
          <strong>UDD <span>Go</span></strong>
        </a>
        <nav aria-label="Landing page">
          <a href="#routes">Routes</a>
          <a href="#guidelines">Guidelines</a>
          <a href="#workspaces">${demo ? 'Demos' : 'Workspaces'}</a>
          <a href="#questions">FAQ</a>
        </nav>
        ${portalButton(icon, 'udd-landing-portal')}
      </div>
    </header>
    <main id="landing-content" tabindex="-1">
      <section class="udd-landing-hero" aria-labelledby="landing-title">
        <div class="udd-landing-intro udd-landing-width">
          <div class="udd-landing-signals" aria-hidden="true"><canvas></canvas><canvas></canvas></div>
          <p class="udd-landing-campus">${icon('MapPin')} Universidad de Dagupan</p>
          <h1 id="landing-title">Plan and follow the school run.</h1>
          <p class="udd-landing-lead">UDD Go connects fleet staff, drivers, and families. Plan bus routes, record boarding, and check your trip from pickup to campus.</p>
          <div class="udd-landing-actions">
            ${portalButton(icon)}
            ${demo ? demoLink(icon, 'udd-landing-portal') : `<a href="#routes" class="udd-landing-portal">${icon('Route')} Try the route demo</a>`}
          </div>
        </div>
        <div class="udd-landing-demo udd-landing-width">
          ${routePreview(icon)}
        </div>
      </section>
      ${roleExplorer(icon, demo)}
      ${tripBenefits(icon)}
      ${tripGuide(icon)}
      <section class="udd-landing-project udd-landing-width" aria-labelledby="project-title">
        <div class="udd-landing-benefit-icon">${icon('School')}</div>
        <div>
          <h2 id="project-title">A Universidad de Dagupan student project</h2>
          <p>UDD Go was developed for the ITECC04 Data Structure and Algorithm course. The interactive demo uses sample Dagupan-area routes and fictional passenger records.</p>
        </div>
        <a href="https://github.com/Theshy691/UDD-Go/blob/main/md/README.md">Read project documentation ${icon('ExternalLink')}</a>
      </section>
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
      <section class="udd-landing-close udd-landing-width" aria-labelledby="portal-title">
        <div>
          <h2 id="portal-title">Find your transport workspace</h2>
          <p>${demo ? 'Choose fleet admin, driver, or student to explore the portal with sample data.' : 'Sign in with your school account to access your workspace.'}</p>
        </div>
        ${demo ? demoLink(icon, 'udd-landing-button') : portalButton(icon)}
      </section>
      ${landingWordmark()}
    </main>
    <footer class="udd-landing-footer">
      <div class="udd-landing-width">
        <p><strong>UDD Go</strong> <span>Universidad de Dagupan</span></p>
        <a href="#guidelines">School run guidelines ${icon('ArrowUpRight')}</a>
      </div>
    </footer>
  </div>`;
  const stopSignals = mountLandingSignals(app.querySelector('.udd-landing-signals'));
  const stopRoutePreview = mountRoutePreview(app.querySelector('#routes'));
  return () => {
    stopSignals();
    stopRoutePreview();
  };
}
