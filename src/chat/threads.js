// Conversation state: what has been said in each thread and where each script is up to.
// Kept apart from the screens so the home tile can show unread counts without loading them.
//
// Every person has two threads, a joke one and a straight one, so that turning on
// over-the-shoulder mode swaps the whole inbox for something forgettable.

import { save, settings, state } from '../lib/store.js';
import { CAST, PLAIN } from './cast.js';

const KEEP = 60; // messages remembered per thread

const keyOf = (contact) => `${contact.id}:${settings.legit ? 'plain' : 'joke'}`;

export const contactById = (id) => CAST.find((contact) => contact.id === id);
export const scenesFor = (contact) => (settings.legit ? PLAIN[contact.kind].scenes : contact.scenes);
export const ambientFor = (contact) => (settings.legit ? PLAIN[contact.kind].ambient : contact.ambient);

function shuffled(count, { keepFirst = false } = {}) {
  const order = Array.from({ length: count }, (_, i) => i);
  const start = keepFirst ? 1 : 0;
  for (let i = order.length - 1; i > start; i--) {
    const j = start + Math.floor(Math.random() * (i - start + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function seed(contact) {
  const now = Date.now();
  const plain = settings.legit;
  const members = contact.group ? Object.keys(contact.members) : null;
  const year = String(new Date().getFullYear());
  const plainSeeds = PLAIN[contact.kind].seeds;
  const lines = plain ? [['them', plainSeeds[CAST.indexOf(contact) % plainSeeds.length]]] : contact.seed.lines;
  const messages = lines.map(([from, text], i, all) => ({
    from: from === 'them' && members ? members[i % members.length] : from,
    text: text.replace('{year}', year),
    // Seeded lines are spaced a little apart, ending `minutesAgo` before now.
    t: now - (contact.seed.minutesAgo + (all.length - 1 - i) * 0.7) * 60_000,
  }));
  return {
    messages,
    // A straight inbox still looks lived in: the busiest threads keep one unread.
    unread: plain ? (contact.seed.unread > 2 ? 1 : 0) : contact.seed.unread,
    lastAt: messages[messages.length - 1].t,
    // The first joke scene carries on from the seed, so it always plays first.
    order: shuffled(scenesFor(contact).length, { keepFirst: !plain }),
    scene: 0,
    beat: 0,
  };
}

export function threadOf(contact) {
  const key = keyOf(contact);
  if (!state.chat.threads[key]) {
    state.chat.threads[key] = seed(contact);
    save();
  }
  return state.chat.threads[key];
}

/** The beat a thread is waiting on: { me, them } to type, or { them } for them to start. */
export function currentBeat(contact) {
  const thread = threadOf(contact);
  const scenes = scenesFor(contact);
  const scene = scenes[thread.order[thread.scene] ?? 0];
  return scene ? scene[thread.beat] || null : null;
}

export function advance(contact) {
  const thread = threadOf(contact);
  const scenes = scenesFor(contact);
  const scene = scenes[thread.order[thread.scene] ?? 0];
  thread.beat += 1;
  if (!scene || thread.beat >= scene.length) {
    thread.beat = 0;
    thread.scene += 1;
    if (thread.scene >= thread.order.length) {
      // Every scene has played. Go round again in a new order, not starting with the one just seen.
      const justPlayed = thread.order[thread.order.length - 1];
      let order = shuffled(scenes.length);
      if (order.length > 1 && order[0] === justPlayed) order = [...order.slice(1), order[0]];
      thread.order = order;
      thread.scene = 0;
    }
  }
  save();
}

export function addMessage(contact, message, { unread = false } = {}) {
  const thread = threadOf(contact);
  thread.messages.push(message);
  if (thread.messages.length > KEEP) thread.messages.splice(0, thread.messages.length - KEEP);
  thread.lastAt = message.t;
  if (unread) thread.unread += 1;
  save();
  return thread;
}

export function markRead(contact) {
  const thread = threadOf(contact);
  if (thread.unread) {
    thread.unread = 0;
    save();
  }
}

/** Everyone, most recent conversation first. */
export function inbox() {
  return CAST.map((contact) => ({ contact, thread: threadOf(contact) })).sort((a, b) => b.thread.lastAt - a.thread.lastAt);
}

export const unreadTotal = () => CAST.reduce((sum, contact) => sum + threadOf(contact).unread, 0);

/** "Mom: Call me" style one-liner for a thread's latest message. */
export function previewOf(contact, thread = threadOf(contact)) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return '';
  if (last.from === 'me') return `You: ${last.text}`;
  return contact.group ? `${last.from}: ${last.text}` : last.text;
}
