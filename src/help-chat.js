import './help-chat.css';

const copy = {
  en: {
    prompt: 'Ask about UDD Go…',
    sending: 'Checking the help guide…',
    send: 'Send',
    guide: 'Help guide',
    unavailable: 'Chat is temporarily unavailable. Try your question again.',
    unknown:
      'I couldn’t find an answer in the UDD Go guide. Try asking about your pickup stop, boarding ID, or the demo.',
    suggestions: ['Where is my pickup stop?', 'Where is my bus?', 'What if the bus didn’t stop?'],
  },
  tl: {
    prompt: 'Magtanong tungkol sa UDD Go…',
    sending: 'Tinitingnan ang gabay…',
    send: 'Ipadala',
    guide: 'Gabay sa UDD Go',
    unavailable: 'Hindi muna available ang chat. Subukang itanong ulit.',
    unknown:
      'Wala akong nakitang sagot sa gabay ng UDD Go. Subukang magtanong tungkol sa sakayan, boarding ID, o demo.',
    suggestions: [
      'Saan ang sakayan ko?',
      'Nasaan na ang bus?',
      'Paano kung hindi huminto ang bus?',
    ],
  },
  tgl: {
    prompt: 'May tanong ka tungkol sa UDD Go?',
    sending: 'Checking ang UDD Go guide…',
    send: 'Send',
    guide: 'Gabay sa UDD Go',
    unavailable: 'Hindi muna available ang chat. Try ulit.',
    unknown:
      'Wala akong mahanap na sagot sa UDD Go guide. Try asking about your pickup stop, boarding ID, or the demo.',
    suggestions: [
      'Paano i-check ang pickup stop?',
      'How ko matra-track ang bus?',
      'Paano mag-report ng missed pickup?',
    ],
  },
};

export function helpChat(icon) {
  return `<div class="udd-help" id="ask-udd-go">
    <button type="button" class="udd-help-launcher" aria-controls="udd-help-panel" aria-expanded="false">
      ${icon('MessageCircle')}<span>Ask UDD Go</span>
    </button>
    <section class="udd-help-panel" id="udd-help-panel" role="dialog" aria-labelledby="udd-help-title" hidden>
      <header class="udd-help-head">
        <span class="udd-help-mark" aria-hidden="true">${icon('BusFront')}</span>
        <h2 id="udd-help-title">Ask UDD Go</h2>
        <button type="button" class="udd-help-close" aria-label="Close chat">${icon('X')}</button>
      </header>
      <div class="udd-help-bar">
        <label for="udd-help-language">Reply language</label>
        <select id="udd-help-language">
          <option value="auto">Auto</option>
          <option value="en">English</option>
          <option value="tl" lang="tl">Tagalog</option>
          <option value="tgl" lang="tl">Taglish</option>
        </select>
      </div>
      <div class="udd-help-scroll">
        <div class="udd-help-welcome">
          <p>Ask about your pickup, boarding ID, or how to report a trip issue.</p>
          <div class="udd-help-suggestions" aria-label="Suggested questions">
            ${copy.en.suggestions.map((question) => `<button type="button">${question}</button>`).join('')}
          </div>
        </div>
        <div class="udd-help-thread" role="log" aria-label="Chat messages" tabindex="0" hidden></div>
        <p class="udd-help-status" role="status"></p>
      </div>
      <form class="udd-help-form">
        <label class="sr-only" for="udd-help-question">Question about UDD Go</label>
        <div class="udd-help-input">
          <input id="udd-help-question" name="question" autocomplete="off" maxlength="400" required placeholder="${copy.en.prompt}">
          <button type="submit" class="udd-landing-button"><span>${copy.en.send}</span>${icon('ArrowRight')}</button>
        </div>
        <small>Ask about the app. Keep account details private.</small>
      </form>
    </section>
  </div>`;
}

export function mountHelpChat(root) {
  const language = root.querySelector('select');
  const launcher = root.querySelector('.udd-help-launcher');
  const panel = root.querySelector('.udd-help-panel');
  const close = root.querySelector('.udd-help-close');
  const scroll = root.querySelector('.udd-help-scroll');
  const welcome = root.querySelector('.udd-help-welcome');
  const thread = root.querySelector('.udd-help-thread');
  const status = root.querySelector('.udd-help-status');
  const form = root.querySelector('form');
  const input = form.elements.question;
  const send = form.querySelector('button');
  const suggestions = root.querySelectorAll('.udd-help-suggestions button');
  const helpLink = root.closest('.udd-landing').querySelector('a[href="#ask-udd-go"]');
  let pending;
  let topics = [];
  let openedBy;
  let lastLanguage = 'en';

  function setOpen(open, trigger, restoreFocus = true) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      openedBy = trigger || launcher;
      if (trigger) close.focus({ preventScroll: true });
      scroll.scrollTop = scroll.scrollHeight;
    } else if (restoreFocus) {
      (openedBy || launcher).focus({ preventScroll: true });
    }
  }

  launcher.addEventListener('click', () => setOpen(panel.hidden, launcher));
  close.addEventListener('click', () => setOpen(false));
  helpLink.addEventListener('click', (event) => {
    event.preventDefault();
    setOpen(true, helpLink);
  });
  const escape = (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  };
  document.addEventListener('keydown', escape);
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a[href^="#"]')) setOpen(false, null, false);
  });
  if (location.hash === '#ask-udd-go') setOpen(true);

  const locale = (question = '') =>
    language.value === 'auto'
      ? /\b(paano|saan|nasaan|bakit|ano|ako|ko|puwede|pwede|hindi|po|tagalog)\b/i.test(question)
        ? /\b(check|track|report|pickup|how|where|status)\b/i.test(question)
          ? 'tgl'
          : 'tl'
        : lastLanguage
      : language.value;

  function message(type, lang) {
    thread.hidden = false;
    const row = document.createElement('article');
    row.className = `udd-help-message ${type}`;
    row.lang = lang === 'tgl' ? 'tl' : lang;
    thread.append(row);
    return row;
  }

  function reply(data) {
    const strings = copy[data.language];
    const row = message('answer', data.language);
    const label = document.createElement('strong');
    label.textContent = strings.guide;
    row.append(label);
    if (!data.passages.length) {
      const paragraph = document.createElement('p');
      paragraph.textContent = strings.unknown;
      row.append(paragraph);
    }
    for (const passage of data.passages) {
      const paragraph = document.createElement('p');
      paragraph.textContent = passage.text;
      row.append(paragraph);
      if (/^(#[\w-]+|https:\/\/github\.com\/Theshy691\/UDD-Go(?:[\/#]|$))/.test(passage.href)) {
        const link = document.createElement('a');
        link.textContent = passage.label;
        link.href = passage.href;
        if (!passage.href.startsWith('#')) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        row.append(link);
      }
    }
    scroll.scrollTop = scroll.scrollHeight;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || pending) return;
    const lang = locale(question);
    welcome.hidden = true;
    const questionRow = message('question', lang);
    questionRow.textContent = question;
    input.value = '';
    const control = new AbortController();
    pending = control;
    const timeout = setTimeout(() => control.abort(), 14500);
    send.disabled = true;
    status.lang = lang === 'tgl' ? 'tl' : lang;
    status.textContent = copy[lang].sending;
    scroll.scrollTop = scroll.scrollHeight;
    try {
      const response = await fetch('/api/index.php?action=help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, language: language.value, topics }),
        signal: control.signal,
      });
      if (!response.ok) throw new Error('Help request failed');
      const data = await response.json();
      if (!Object.hasOwn(copy, data.language) || !Array.isArray(data.passages))
        throw new Error('Invalid help response');
      status.textContent = '';
      questionRow.lang = data.language === 'tgl' ? 'tl' : data.language;
      lastLanguage = data.language;
      topics = Array.isArray(data.topics) ? data.topics.slice(0, 2) : [];
      reply(data);
    } catch {
      if (root.isConnected) {
        status.textContent = copy[lang].unavailable;
        if (input.value === '') input.value = question;
        questionRow.remove();
        thread.hidden = !thread.childElementCount;
        welcome.hidden = !thread.hidden;
        scroll.scrollTop = scroll.scrollHeight;
      }
    } finally {
      clearTimeout(timeout);
      pending = undefined;
      send.disabled = false;
    }
  });

  language.addEventListener('change', () => {
    const lang = locale();
    const languageTag = lang === 'tgl' ? 'tl' : lang;
    const strings = copy[lang];
    input.placeholder = strings.prompt;
    input.lang = languageTag;
    send.querySelector('span').textContent = strings.send;
    suggestions.forEach((button, i) => {
      button.textContent = strings.suggestions[i];
      button.lang = languageTag;
    });
  });

  suggestions.forEach((button) =>
    button.addEventListener('click', () => {
      if (pending) return;
      input.value = button.textContent;
      form.requestSubmit();
    })
  );
  return () => {
    pending?.abort();
    document.removeEventListener('keydown', escape);
  };
}
