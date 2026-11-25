// The fake Messages app. An inbox of people who do not exist, and two ways to text them:
//   Mash: hit any keys and a scripted message types itself; they answer from the script.
//   Type: write what you like; they answer from brain.js. No network, no AI.
//
// The real keyboard is used either way. In Mash mode the text field is invisible and only
// counts keystrokes, while a look-alike on top of it shows the scripted line appearing.

import { segmented } from '../lib/controls.js';
import { add, clamp, clear, h, themeColor } from '../lib/dom.js';
import { tick } from '../lib/haptics.js';
import { ui } from '../lib/icons.js';
import { random } from '../lib/rng.js';
import { bump, firstTime, on, pick, save, settings, state } from '../lib/store.js';
import { coach } from '../shell/coach.js';
import { respond, suggestions } from './brain.js';
import { CAST, FILLERS, PLAIN } from './cast.js';
import { addMessage, advance, ambientFor, contactById, currentBeat, inbox, markRead, previewOf, threadOf, unreadTotal } from './threads.js';

const BACKGROUND = '#0b0c0f';
const FILTERS = [
  { value: 'all', joke: 'All', legit: 'All' },
  { value: 'work', joke: 'Work', legit: 'Work' },
  { value: 'fun', joke: 'Fun', legit: 'Personal' },
];
// How many characters each keystroke reveals in Mash mode. Averages two: fast, fluent thumbs.
const CHUNKS = [2, 1, 2, 3, 2, 1, 3, 2];

const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function daysAgo(t) {
  return Math.round((dayStart(new Date()) - dayStart(new Date(t))) / 86_400_000);
}

/** Inbox style: a time today, then "Yesterday", a weekday, a date. */
function stamp(t) {
  const days = daysAgo(t);
  if (days <= 0) return clock(t);
  if (days === 1) return 'Yesterday';
  const date = new Date(t);
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dayLabel(t) {
  const days = daysAgo(t);
  const day = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : new Date(t).toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} ${clock(t)}`;
}

const isEmojiOnly = (text) => /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️\s]{1,12}$/u.test(text);

function avatar(contact, extra = '') {
  const emoji = /\p{Extended_Pictographic}/u.test(contact.avatar.text);
  return h('span', {
    class: `chat-avatar${emoji ? ' is-emoji' : ''} ${extra}`,
    style: { '--hue': String(contact.avatar.hue) },
    text: contact.avatar.text,
    'aria-hidden': 'true',
  });
}

export function createChat(root, ctx) {
  const saved = state.chat;
  let mode = saved.mode === 'type' ? 'type' : 'mash';
  let filter = 'all';
  let openId = null;
  let visible = false;
  let draft = null; // Mash: { chars, shown, scripted, replies } for the line being "typed"
  let keystrokes = 0;
  let lastLength = 0;
  let tail = null; // the newest message on screen: { from, t, row }
  let lastTap = { at: 0, message: null };
  let nextAmbientAt = Date.now() + 12_000;

  const lanes = new Map(); // contact id -> queue of things happening in that thread, in order
  const typingNow = new Map(); // contact id -> who is "typing…"
  const memories = new Map(); // contact id -> what the reply engine remembers

  // ------------------------------------------------------------------ DOM

  const makeModeSwitch = () =>
    segmented(
      [
        { value: 'mash', label: 'Mash' },
        { value: 'type', label: 'Type' },
      ],
      mode,
      (next) => setMode(next),
      { label: 'Typing mode' },
    );
  const modeInInbox = makeModeSwitch();
  const modeInThread = makeModeSwitch();

  const search = h('input', {
    class: 'chat-search-input',
    type: 'search',
    placeholder: 'Search',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-label': 'Search conversations',
  });
  const filterRow = h('div', { class: 'chat-filters', role: 'group', 'aria-label': 'Show' });
  const rows = h('div', { class: 'chat-rows', 'data-vscroll': true });
  const inboxEl = h(
    'div',
    { class: 'chat-inbox' },
    h('div', { class: 'chat-top' }, h('h2', { class: 'chat-title', text: 'Messages' }), modeInInbox),
    h('label', { class: 'chat-search' }, h('span', { html: ui.search }), search),
    filterRow,
    rows,
  );

  const backCount = h('span', { class: 'chat-back-count' });
  const whoAvatar = h('span', { class: 'chat-who-avatar' });
  const whoName = h('span', { class: 'chat-who-name' });
  const whoStatus = h('span', { class: 'chat-who-status' });
  const log = h('div', { class: 'chat-log', 'data-vscroll': true, role: 'log', 'aria-live': 'polite' });
  const typingWho = h('span', { class: 'chat-sender' });
  const typingEl = h(
    'div',
    { class: 'chat-typing' },
    typingWho,
    h('div', { class: 'bubble-row is-them is-tail' }, h('div', { class: 'bubble is-dots', 'aria-label': 'Typing' }, h('i'), h('i'), h('i'))),
  );
  const statusEl = h('div', { class: 'chat-status' });
  const chipRow = h('div', { class: 'chat-suggest', 'data-hscroll': true });
  const input = h('textarea', {
    class: 'chat-input',
    rows: '1',
    enterkeyhint: 'send',
    autocomplete: 'off',
    'aria-label': 'Message',
  });
  const ghostText = h('span', { class: 'chat-ghost-text' });
  const ghost = h('div', { class: 'chat-ghost is-empty', 'aria-hidden': 'true' }, h('i', { class: 'chat-caret is-lead' }), ghostText, h('i', { class: 'chat-caret is-trail' }));
  const field = h('div', { class: 'chat-field' }, input, ghost);
  const sendButton = h('button', { class: 'chat-send', type: 'button', 'aria-label': 'Send', html: ui.send, disabled: true });
  const threadEl = h(
    'div',
    { class: 'chat-thread' },
    h(
      'div',
      { class: 'chat-head' },
      h('button', { class: 'chat-back', type: 'button', 'aria-label': 'Back to conversations', onClick: () => closeThread() }, h('span', { html: ui.chevronLeft }), backCount),
      h('div', { class: 'chat-who' }, whoAvatar, h('span', { class: 'chat-who-text' }, whoName, whoStatus)),
      modeInThread,
    ),
    log,
    chipRow,
    h('div', { class: 'chat-composer' }, field, sendButton),
  );

  const view = h('div', { class: 'chat', dataset: { mode } }, inboxEl, threadEl);
  add(root, view);

  // ------------------------------------------------------- order within a thread
  // Everything that happens in a thread goes through its lane, so replies and your own
  // messages always land in the order they were set in motion.

  function lane(id) {
    if (!lanes.has(id)) lanes.set(id, { chain: Promise.resolve(), depth: 0, hurry: false, wakers: new Set() });
    return lanes.get(id);
  }

  function enqueue(id, job) {
    const q = lane(id);
    q.depth += 1;
    q.chain = q.chain
      .then(job)
      .catch(() => {})
      .then(() => {
        q.depth -= 1;
        if (!q.depth) q.hurry = false;
      });
    return q.chain;
  }

  const isBusy = (id) => lane(id).depth > 0;

  function pause(id, ms) {
    const q = lane(id);
    if (q.hurry) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        q.wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      q.wakers.add(done);
    });
  }

  /** Someone sends again before the last reply landed: let that reply arrive right now. */
  function hurry(id) {
    const q = lane(id);
    if (!q.depth) return;
    q.hurry = true;
    for (const wake of [...q.wakers]) wake();
  }

  // --------------------------------------------------------------- the inbox

  const watching = (id) => visible && openId === id;
  const jokeOrPlain = (item) => pick(item.joke, item.legit);

  function renderFilters() {
    clear(filterRow);
    for (const item of FILTERS) {
      filterRow.append(
        h('button', {
          class: 'chat-filter',
          type: 'button',
          text: jokeOrPlain(item),
          'aria-pressed': String(filter === item.value),
          onClick: () => {
            filter = item.value;
            tick();
            renderFilters();
            renderInbox();
          },
        }),
      );
    }
  }

  // Rows are kept and updated in place. Texts arrive every few seconds, and rebuilding the
  // list each time could swap a row out from under a finger that is halfway through a tap.
  const rowCache = new Map();
  const emptyRow = h('p', { class: 'chat-empty' });

  function rowFor(contact) {
    if (!rowCache.has(contact.id)) {
      const time = h('span', { class: 'chat-row-time' });
      const preview = h('span', { class: 'chat-row-preview' });
      const badge = h('span', { class: 'chat-badge' });
      const el = h(
        'button',
        { class: 'chat-row', type: 'button', onClick: () => openThread(contact.id) },
        avatar(contact),
        h(
          'span',
          { class: 'chat-row-main' },
          h('span', { class: 'chat-row-top' }, h('span', { class: 'chat-row-name', text: contact.name }), time),
          h('span', { class: 'chat-row-bottom' }, preview, badge),
        ),
      );
      rowCache.set(contact.id, { el, time, preview, badge });
    }
    return rowCache.get(contact.id);
  }

  function renderInbox() {
    const query = search.value.trim().toLowerCase();
    const list = inbox().filter(({ contact, thread }) => {
      if (filter !== 'all' && contact.kind !== filter) return false;
      if (!query) return true;
      return contact.name.toLowerCase().includes(query) || thread.messages.some((m) => m.text.toLowerCase().includes(query));
    });
    const wanted = list.map(({ contact, thread }) => {
      const row = rowFor(contact);
      const who = typingNow.get(contact.id);
      row.el.classList.toggle('is-unread', thread.unread > 0);
      row.time.textContent = stamp(thread.lastAt);
      row.preview.textContent = who ? (contact.group ? `${who} is typing…` : 'typing…') : previewOf(contact, thread);
      row.preview.classList.toggle('is-typing', Boolean(who));
      row.badge.textContent = String(thread.unread);
      row.badge.hidden = !thread.unread;
      row.badge.setAttribute('aria-label', `${thread.unread} unread`);
      return row.el;
    });
    if (!wanted.length) {
      emptyRow.textContent = pick('Nobody by that name. They would have texted by now.', 'No results');
      wanted.push(emptyRow);
    }
    for (const child of [...rows.children]) if (!wanted.includes(child)) child.remove();
    wanted.forEach((el, i) => {
      if (rows.children[i] !== el) rows.insertBefore(el, rows.children[i] || null);
    });
    renderBackCount();
  }

  function renderBackCount() {
    const others = CAST.reduce((sum, c) => sum + (c.id === openId ? 0 : threadOf(c).unread), 0);
    backCount.textContent = others ? String(others) : '';
  }

  // -------------------------------------------------------------- one thread

  function subtitle(contact) {
    const who = typingNow.get(contact.id);
    if (who) return contact.group ? `${who} is typing…` : 'typing…';
    if (contact.group) return Object.keys(contact.members).join(', ');
    return pick(contact.status, contact.kind === 'work' ? 'Active now' : 'Mobile');
  }

  function renderHead(contact) {
    whoAvatar.replaceChildren(avatar(contact, 'is-small'));
    whoName.textContent = contact.name;
    whoStatus.textContent = subtitle(contact);
    whoStatus.classList.toggle('is-typing', typingNow.has(contact.id));
  }

  function bubbleRow(contact, message) {
    const mine = message.from === 'me';
    const bubble = h('div', { class: `bubble${isEmojiOnly(message.text) ? ' is-emoji' : ''}`, text: message.text });
    if (message.heart) bubble.append(h('span', { class: 'bubble-heart', text: '❤️' }));
    // Two quick taps leave a heart, the way they do in every messaging app.
    bubble.addEventListener('click', () => {
      const now = performance.now();
      if (lastTap.message === message && now - lastTap.at < 340) {
        message.heart = !message.heart;
        save();
        tick(10);
        bubble.querySelector('.bubble-heart')?.remove();
        if (message.heart) bubble.append(h('span', { class: 'bubble-heart is-new', text: '❤️' }));
        lastTap = { at: 0, message: null };
      } else {
        lastTap = { at: now, message };
      }
    });
    return h('div', { class: `bubble-row ${mine ? 'is-me' : 'is-them'}` }, bubble);
  }

  function appendMessage(contact, message, { animate = true } = {}) {
    typingEl.remove();
    statusEl.remove();
    const gap = tail ? message.t - tail.t : Infinity;
    if (gap > 12 * 60_000) log.append(h('div', { class: 'chat-time', text: dayLabel(message.t) }));
    const sameRun = tail && tail.from === message.from && gap < 3 * 60_000;
    if (sameRun) tail.row.classList.remove('is-tail');
    else if (contact.group && message.from !== 'me') {
      const hue = contact.members[message.from]?.hue ?? 0;
      log.append(h('div', { class: 'chat-sender', text: message.from, style: { '--hue': String(hue) } }));
    }
    const row = bubbleRow(contact, message);
    row.classList.add('is-tail');
    if (!sameRun) row.classList.add('is-first');
    if (animate) row.classList.add('is-new');
    log.append(row);
    tail = { from: message.from, t: message.t, row };
  }

  /** "Delivered" under your last message, "Read" once they start typing. Then the typing dots. */
  function renderExtras(contact) {
    typingEl.remove();
    statusEl.remove();
    const who = typingNow.get(contact.id);
    const thread = threadOf(contact);
    const last = thread.messages[thread.messages.length - 1];
    if (last && last.from === 'me') {
      statusEl.textContent = who ? `Read ${clock(Date.now())}` : 'Delivered';
      log.append(statusEl);
    }
    if (who) {
      typingWho.textContent = contact.group ? who : '';
      typingWho.hidden = !contact.group;
      typingWho.style.setProperty('--hue', String(contact.members?.[who]?.hue ?? 0));
      log.append(typingEl);
    }
  }

  function scrollToEnd(smooth = false) {
    requestAnimationFrame(() => {
      log.scrollTo({ top: log.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    });
  }

  function note(text) {
    if (settings.legit || !openId) return;
    typingEl.remove();
    statusEl.remove();
    log.append(h('div', { class: 'chat-note', text, 'data-joke': true }));
    tail = null;
    renderExtras(contactById(openId));
    scrollToEnd(true);
  }

  function renderThread() {
    const contact = contactById(openId);
    const thread = threadOf(contact);
    renderHead(contact);
    clear(log);
    tail = null;
    for (const message of thread.messages) appendMessage(contact, message, { animate: false });
    renderExtras(contact);
    renderChips();
    resetDraft();
    renderBackCount();
    scrollToEnd();
  }

  function openThread(id) {
    const contact = contactById(id);
    if (!contact) return;
    openId = id;
    markRead(contact);
    renderThread();
    view.classList.add('is-thread');
    inboxEl.inert = true;
    threadEl.inert = false;
    if (firstTime('tip-chat-thread')) {
      note(mode === 'mash' ? 'Mash mode. Tap the box and hit any keys. The texts write themselves.' : 'Type mode. They answer what you actually write.');
    }
    kick(contact);
    // A mouse means a real keyboard is right there, so be ready for it.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.focus({ preventScroll: true });
  }

  function closeThread() {
    if (!openId) return false;
    openId = null;
    input.blur();
    view.classList.remove('is-thread');
    inboxEl.inert = false;
    threadEl.inert = true;
    renderInbox();
    return true;
  }

  // ----------------------------------------------------------- who says what

  function setTyping(contact, who) {
    if (who) typingNow.set(contact.id, who);
    else typingNow.delete(contact.id);
    if (watching(contact.id)) {
      renderHead(contact);
      renderExtras(contact);
      scrollToEnd(true);
    } else if (visible && !openId) {
      renderInbox();
    }
  }

  /** A line from the script is "text" for one person or [sender, text] in a group. */
  function parts(contact, line) {
    if (Array.isArray(line)) return line;
    if (!contact.group) return ['them', line];
    const names = Object.keys(contact.members);
    return [random.pick(names), line];
  }

  function receive(contact, message) {
    const seen = watching(contact.id);
    addMessage(contact, message, { unread: !seen });
    if (seen) {
      appendMessage(contact, message);
      renderExtras(contact);
      scrollToEnd(true);
      tick(8);
      return;
    }
    if (visible) {
      if (openId) renderBackCount();
      else renderInbox();
    }
    // A banner, unless the inbox itself is on screen showing the same thing.
    const inboxShowing = visible && !openId;
    if (!inboxShowing && settings.alerts !== false) {
      coach.notify({
        label: contact.name,
        text: contact.group ? `${message.from}: ${message.text}` : message.text,
        onTap: () => {
          ctx.goTo('chat');
          openThread(contact.id);
        },
      });
    }
  }

  /** They "type" each line for a moment, then it lands. */
  function deliver(contact, lines) {
    const id = contact.id;
    return enqueue(id, async () => {
      for (const line of lines) {
        const [sender, text] = parts(contact, line);
        const label = contact.group ? sender : 'them';
        await pause(id, random.range(420, 950));
        setTyping(contact, label);
        await pause(id, clamp(text.length * 44, 750, 2500));
        setTyping(contact, null);
        receive(contact, { from: contact.group ? sender : 'them', text, t: Date.now() });
      }
    });
  }

  /** If it is their turn to start, start. */
  function kick(contact) {
    const beat = currentBeat(contact);
    if (!beat || beat.me || isBusy(contact.id)) return;
    advance(contact);
    deliver(contact, beat.them).then(() => afterBeat(contact));
  }

  /** A scene just ended and the next one opens with them: give it a few seconds, then go. */
  function afterBeat(contact) {
    const beat = currentBeat(contact);
    if (!beat || beat.me) return;
    setTimeout(() => {
      if (watching(contact.id)) kick(contact);
    }, random.range(4500, 9000));
  }

  function post(contact, text, then) {
    hurry(contact.id);
    enqueue(contact.id, () => {
      const message = { from: 'me', text, t: Date.now() };
      addMessage(contact, message);
      bump('texts');
      if (watching(contact.id)) {
        appendMessage(contact, message);
        renderExtras(contact);
        scrollToEnd(true);
      }
      then();
    });
    coach.event('sent', { chance: 0.1, minGap: 22_000 });
  }

  function personaFor(contact) {
    return settings.legit ? { brain: PLAIN.brain, voice: PLAIN.voice } : contact;
  }

  function memoryFor(contact) {
    const key = `${contact.id}:${settings.legit ? 'plain' : 'joke'}`;
    if (!memories.has(key)) memories.set(key, {});
    return memories.get(key);
  }

  function replyTo(contact, text) {
    const lines = respond(personaFor(contact), text, memoryFor(contact));
    // The straight-faced persona has no group voices, so a member is picked to say each line.
    deliver(contact, lines).then(() => {
      if (watching(contact.id)) renderChips();
    });
  }

  // ------------------------------------------------------------- the composer

  const placeholder = () => 'Message';

  function renderChips() {
    clear(chipRow);
    if (mode !== 'type' || !openId) {
      chipRow.hidden = true;
      return;
    }
    const contact = contactById(openId);
    const options = suggestions(personaFor(contact), memoryFor(contact));
    chipRow.hidden = !options.length;
    for (const text of options) {
      chipRow.append(
        h('button', {
          class: 'chat-chip',
          type: 'button',
          text,
          onPointerdown: (event) => event.preventDefault(), // keep the keyboard up
          onClick: () => {
            tick();
            post(contact, text, () => replyTo(contact, text));
          },
        }),
      );
    }
  }

  function renderDraft() {
    const shown = draft ? draft.chars.slice(0, draft.shown).join('') : '';
    ghostText.textContent = shown || placeholder();
    ghost.classList.toggle('is-empty', !shown);
    sendButton.disabled = mode === 'mash' ? !shown : !input.value.trim();
  }

  function resetDraft() {
    draft = null;
    keystrokes = 0;
    input.value = '';
    lastLength = 0;
    input.style.height = '';
    renderDraft();
  }

  /** Decides what you are "about to say" the first time a key is hit. */
  function startDraft() {
    const contact = contactById(openId);
    const beat = currentBeat(contact);
    const scripted = Boolean(beat && beat.me);
    const text = scripted ? beat.me : random.pick(FILLERS[settings.legit ? 'plain' : contact.kind]);
    draft = { chars: Array.from(text), shown: 0, scripted, replies: scripted ? beat.them : null };
  }

  /** `strokes` is how many keys' worth just arrived: one for a tap, several for a swiped word. */
  function typeAhead(strokes = 1) {
    if (!openId) return;
    if (!draft) startDraft();
    if (draft.shown >= draft.chars.length) {
      // The whole line is there. Nudge toward the send button.
      sendButton.classList.remove('is-nudge');
      void sendButton.offsetWidth;
      sendButton.classList.add('is-nudge');
      return;
    }
    let reveal = 0;
    for (let i = 0; i < strokes; i++) reveal += CHUNKS[keystrokes++ % CHUNKS.length];
    draft.shown = Math.min(draft.chars.length, draft.shown + reveal);
    bump('mashKeys', strokes);
    renderDraft();
  }

  function typeBack() {
    if (!draft || !draft.shown) return;
    draft.shown = Math.max(0, draft.shown - 2);
    renderDraft();
  }

  function grow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }

  input.addEventListener('input', (event) => {
    if (mode !== 'mash') {
      grow();
      renderDraft();
      return;
    }
    // The field is invisible here: what was typed does not matter, only that a key was hit.
    const length = input.value.length;
    const added = length - lastLength;
    const deleting = added < 0 || (event.inputType || '').startsWith('delete');
    lastLength = length;
    if (deleting) typeBack();
    else typeAhead(clamp(added, 1, 5)); // swipe typing and dictation add a whole word at once
    // Stop the hidden text growing forever, but leave some so backspace still has work to do.
    if (!event.isComposing && length > 60) {
      input.value = input.value.slice(-12);
      lastLength = input.value.length;
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    } else if (event.key === 'Backspace' && mode === 'mash' && !input.value) {
      // Nothing left in the hidden field to delete, so no input event will come.
      typeBack();
    }
  });

  function send() {
    if (!openId) return;
    const contact = contactById(openId);
    if (mode === 'mash') {
      if (!draft || !draft.shown) return;
      const { chars, scripted, replies } = draft;
      if (scripted) advance(contact);
      resetDraft();
      tick(10);
      post(contact, chars.join(''), () => {
        if (replies) deliver(contact, replies).then(() => afterBeat(contact));
      });
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    resetDraft();
    tick(10);
    post(contact, text, () => replyTo(contact, text));
  }

  // Tapping send must not take focus from the field, or the phone keyboard would close.
  sendButton.addEventListener('pointerdown', (event) => event.preventDefault());
  sendButton.addEventListener('click', () => {
    send();
    if (document.activeElement !== input && !window.matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
  });
  field.addEventListener('click', () => input.focus({ preventScroll: true }));

  function applyMode() {
    view.dataset.mode = mode;
    modeInInbox.setValue(mode);
    modeInThread.setValue(mode);
    // Mash wants a dumb keyboard; Type wants autocorrect like any chat app.
    const smart = mode === 'type';
    input.setAttribute('autocorrect', smart ? 'on' : 'off');
    input.setAttribute('autocapitalize', smart ? 'sentences' : 'off');
    input.setAttribute('spellcheck', String(smart));
    input.setAttribute('placeholder', smart ? placeholder() : '');
    resetDraft();
    renderChips();
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    saved.mode = next;
    save();
    applyMode();
    note(
      next === 'mash'
        ? 'Mash mode. Hit any keys. The texts write themselves.'
        : 'Type mode. They answer what you actually write. No AI involved, just a lot of opinions.',
    );
  }

  search.addEventListener('input', renderInbox);

  // ------------------------------------------------- texts arriving on their own
  // Every so often someone texts first. In the other two apps it shows up as a banner.

  setInterval(() => {
    if (document.hidden) return;
    const where = ctx.current();
    if (!where) return;
    if (where !== 'chat' && settings.alerts === false) return;
    if (Date.now() < nextAmbientAt) return;
    nextAmbientAt = Date.now() + (where === 'chat' ? random.range(15_000, 32_000) : random.range(50_000, 95_000));
    if (unreadTotal() >= 24) return;

    // Only between scenes, so nobody interrupts their own bit, and never the thread on screen.
    const free = CAST.filter((contact) => {
      if (watching(contact.id) || isBusy(contact.id)) return false;
      const thread = threadOf(contact);
      return thread.beat === 0 && thread.unread < 6;
    });
    if (!free.length) return;
    const contact = random.pick(free);
    const beat = currentBeat(contact);
    if (beat && !beat.me) {
      advance(contact);
      deliver(contact, beat.them);
      return;
    }
    // Otherwise a stray one-liner, as long as they have not just said it.
    const recent = threadOf(contact)
      .messages.slice(-6)
      .map((message) => message.text);
    const fresh = ambientFor(contact).filter((line) => !recent.includes(Array.isArray(line) ? line[1] : line));
    if (fresh.length) deliver(contact, [random.pick(fresh)]);
  }, 3000);

  // ------------------------------------------------------------- lifecycle

  renderFilters();
  applyMode();
  threadEl.inert = true;
  renderInbox();

  on('settings', (key) => {
    if (key !== 'legit') return;
    // Over-the-shoulder mode swaps every thread for its straight-faced twin.
    typingNow.clear();
    renderFilters();
    if (openId) renderThread();
    else renderInbox();
  });

  // The phone keyboard opening or closing changes the height: keep the latest message in view.
  on('keyboard', () => {
    if (watching(openId)) scrollToEnd();
  });

  return {
    show() {
      visible = true;
      themeColor(BACKGROUND);
      // Someone should text soon after you arrive.
      nextAmbientAt = Math.min(nextAmbientAt, Date.now() + random.range(5000, 9000));
      if (openId) {
        const contact = contactById(openId);
        markRead(contact);
        renderThread();
        kick(contact);
      } else {
        renderInbox();
      }
    },
    hide() {
      visible = false;
      input.blur();
    },
    /** Esc or the phone's back gesture: leave the thread before leaving the app. */
    back: () => closeThread(),
    openThread,
    onKey(event) {
      if (!openId) return;
      // Typing anywhere goes to the message box.
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter') input.focus({ preventScroll: true });
    },
  };
}
