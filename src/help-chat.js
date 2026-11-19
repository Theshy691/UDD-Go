import './help-chat.css';

const copy = {
  en: {
    prompt: 'Ask about UDD Go…',
    sending: 'Checking the help guide…',
    send: 'Send',
    guide: 'Help guide',
    unavailable: 'Chat is temporarily unavailable. Try again or read the FAQ below.',
    unknown:
      'I couldn’t find an answer in the UDD Go guide. Try asking about your pickup stop, boarding ID, or the demo.',
    suggestions: ['Where is my pickup stop?', 'Where is my bus?', 'What if the bus didn’t stop?'],
  },
  tl: {
    prompt: 'Magtanong tungkol sa UDD Go…',
    sending: 'Tinitingnan ang gabay…',
    send: 'Ipadala',
    guide: 'Gabay sa UDD Go',
    unavailable:
      'Hindi muna available ang chat. Subukan ulit o basahin ang mga karaniwang tanong sa ibaba.',
    unknown:
      'Wala akong nakitang sagot sa gabay ng UDD Go. Subukang magtanong tungkol sa sakayan, boarding ID, o demo.',
    suggestions: [
      'Saan ang sakayan ko?',
      'Nasaan na ang bus?',
      'Paano kung hindi huminto ang bus?',
    ],
  },
};

export function helpChat(icon) {
  return `<section class="udd-help udd-landing-width" id="ask-udd-go" aria-labelledby="udd-help-title">
    <div class="udd-help-intro">
      <span class="udd-help-mark" aria-hidden="true">${icon('CircleHelp')}</span>
      <h2 id="udd-help-title">Ask UDD Go</h2>
      <p>Get help with pickup stops, boarding IDs, or the demo in English or Tagalog.</p>
      <a href="#questions">Read common questions ${icon('ArrowRight')}</a>
    </div>
    <div class="udd-help-panel">
      <div class="udd-help-bar">
        <label for="udd-help-language">Reply language</label>
        <select id="udd-help-language">
          <option value="auto">Auto</option>
          <option value="en">English</option>
          <option value="tl" lang="tl">Tagalog</option>
        </select>
      </div>
      <div class="udd-help-thread" role="log" aria-label="Chat messages" tabindex="0" hidden></div>
      <p class="udd-help-status" role="status"></p>
      <form class="udd-help-form">
        <label class="sr-only" for="udd-help-question">Question about UDD Go</label>
        <div class="udd-help-input">
          <input id="udd-help-question" name="question" autocomplete="off" maxlength="400" required placeholder="${copy.en.prompt}">
          <button type="submit" class="udd-landing-button"><span>${copy.en.send}</span>${icon('ArrowRight')}</button>
        </div>
        <small>Ask about the app. Keep account details private.</small>
      </form>
      <div class="udd-help-suggestions" aria-label="Suggested questions">
        ${copy.en.suggestions.map((question) => `<button type="button">${question}</button>`).join('')}
      </div>
    </div>
  </section>`;
}

export function mountHelpChat(root) {
  const language = root.querySelector('select');
  const thread = root.querySelector('.udd-help-thread');
  const status = root.querySelector('.udd-help-status');
  const form = root.querySelector('form');
  const input = form.elements.question;
  const send = form.querySelector('button');
  const suggestions = root.querySelectorAll('.udd-help-suggestions button');
  let pending;

  const locale = (question = '') =>
    language.value === 'auto'
      ? /\b(paano|saan|nasaan|bakit|ano|ako|puwede|pwede|hindi|po|tagalog)\b/i.test(question)
        ? 'tl'
        : 'en'
      : language.value;

  function message(type, lang) {
    thread.hidden = false;
    const row = document.createElement('article');
    row.className = `udd-help-message ${type}`;
    row.lang = lang;
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
        row.append(link);
      }
    }
    thread.scrollTop = thread.scrollHeight;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || pending) return;
    const lang = locale(question);
    message('question', lang).textContent = question;
    thread.scrollTop = thread.scrollHeight;
    input.value = '';
    const control = new AbortController();
    pending = control;
    const timeout = setTimeout(() => control.abort(), 14500);
    send.disabled = true;
    status.lang = lang;
    status.textContent = copy[lang].sending;
    try {
      const response = await fetch('/api/index.php?action=help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, language: language.value }),
        signal: control.signal,
      });
      if (!response.ok) throw new Error('Help request failed');
      const data = await response.json();
      if (!Object.hasOwn(copy, data.language) || !Array.isArray(data.passages))
        throw new Error('Invalid help response');
      reply(data);
      status.textContent = '';
    } catch {
      if (root.isConnected) {
        status.textContent = copy[lang].unavailable;
        if (input.value === '') input.value = question;
      }
    } finally {
      clearTimeout(timeout);
      pending = undefined;
      send.disabled = false;
    }
  });

  language.addEventListener('change', () => {
    const strings = copy[locale()];
    input.placeholder = strings.prompt;
    input.lang = locale();
    send.querySelector('span').textContent = strings.send;
    suggestions.forEach((button, i) => {
      button.textContent = strings.suggestions[i];
      button.lang = locale();
    });
  });

  suggestions.forEach((button) =>
    button.addEventListener('click', () => {
      if (pending) return;
      input.value = button.textContent;
      form.requestSubmit();
    })
  );
  return () => pending?.abort();
}
