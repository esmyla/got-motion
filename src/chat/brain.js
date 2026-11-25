// Type mode: they answer what you actually wrote. No AI and no network: it spots a topic
// (food, money, being late, work…), sometimes hands a piece of your sentence back to you,
// and otherwise falls back on that person's stock opinions. Everything is pre-written.
//
// respond(persona, text, memory) -> lines to send back. `memory` is a plain object the caller
// keeps per thread so replies do not repeat. A line is a string, or [sender, text] in a group.

// Checked in this order; the first topic this persona has lines for wins.
const TOPICS = [
  ['meta', /\b(are (you|u) (a |an )?(real|bot|robot|ai|human|person)|chat ?gpt|who are you|what are you|is this (a |an )?(bot|ai|robot))\b/i],
  ['insult', /\b(shut up|stupid|idiot|dumb|hate (you|u)|you suck|annoying|useless)\b/i],
  ['love', /(\b(love (you|u|ya)|ily|miss (you|u))\b|❤️|🥰|😍|<3)/i],
  ['greeting', /^(hi+|hey+|hello+|yo+|sup|what'?s up|wh?assup|good (morning|afternoon|evening)|howdy|hiya)\b/i],
  ['bye', /\b(bye+|goodbye|good ?night|gtg|g2g|ttyl|talk (to you )?later|see (you|ya)|gotta go|have to go)\b/i],
  ['thanks', /\b(thanks?( you)?|thx|ty|appreciate it)\b/i],
  ['sorry', /\b(sorry|my bad|apologi[sz]e)\b/i],
  ['laugh', /(\b(lo+l|lmao+|a?haha+h?|hehe+|rofl)\b|😂|🤣|💀)/i],
  ['money', /(\$\s?\d|\b(money|pay|paid|venmo|owes?|rent|cash|dollars?|bucks|broke|refund)\b)/i],
  ['food', /\b(eat|ate|eating|food|dinner|lunch|breakfast|hungry|starving|pizza|fries|soup|snacks?|coffee|lobster|casserole)\b/i],
  ['late', /\b(late|omw|on my way|running behind|traffic|almost there|be there|leaving now|\d+ ?min(ute)?s?)\b/i],
  ['where', /\b(where|address|which floor)\b/i],
  ['when', /\b(when|what time|how long|how soon|what day)\b/i],
  ['work', /\b(work|meeting|deadline|report|deck|slides?|emails?|boss|sync|stand-?up|q[1-4]|project|office|client|agenda)\b/i],
  ['tired', /\b(tired|exhausted|sleepy|sleep|nap|worn out|burnt? out)\b/i],
  ['sad', /\b(sad|upset|lonely|crying|anxious|stressed|awful|terrible|miserable|(bad|rough|hard) (day|week))\b/i],
  ['busy', /\b(busy|swamped|slammed)\b/i],
  ['weather', /\b(weather|rain(ing|y)?|snow(ing|y)?|cold|hot out|sunny|forecast|umbrella|humid)\b/i],
  ['yes', /^(yes+|yeah+|yep|yup|ya|sure|definitely|of course|absolutely|totally|for sure)\b/i],
  ['no', /^(no+|nope|nah+|never|not really|no way)\b/i],
  ['ok', /^(ok+|okay+|k+|kk|alright|fine|cool|bet|got it|sounds good|noted)[.! ]*$/i],
];

const QUESTION = /(\?\s*$|^(who|what|when|where|why|how|is|are|am|do|does|did|can|could|will|would|should|have|has)\b)/i;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️\s]+$/u;

// Said in earnest, and never in character.
const CRISIS = /\b(kill(ing)? myself|suicid\w*|end(ing)? my life|want to die|don'?t want to (be alive|live)|hurt(ing)? myself|self[- ]?harm)\b/i;
const CRISIS_LINES = [
  'Stepping out of the joke for a second: everything in this app is pre-written, so it can’t actually help. But you deserve real support.',
  'In the US you can call or text 988 at any hour. Anywhere else, please contact your local emergency number or someone you trust.',
];

// Handing a piece of the sentence back, in four voices.
const ECHOES = [
  {
    match: /\bi(?:'m| ?am|m) (?:so |really |very |just |kind of |a little )?(.{2,48})/i,
    casual: ['{x}? since when', 'you’re {x}. noted'],
    mom: ['Why are you {x}', 'You are {x}? Did you eat'],
    corporate: ['Let’s unpack “{x}” in our next 1:1.', 'Noted that you’re {x}. Let’s action that.'],
    bot: ['Status “{x}” recorded.', 'Have you tried not being {x}?'],
  },
  {
    match: /\bi (?:really |just )?(?:want|need|wish i had) (.{2,48})/i,
    casual: ['what would you even do with {x}', 'we all want {x}'],
    mom: ['You do not need {x}. You need a jacket', 'I will get you {x} for your birthday'],
    corporate: ['Is {x} in the budget?', 'Put {x} in the deck.'],
    bot: ['Request for {x}: denied.', '“{x}” is out of scope.'],
  },
  {
    match: /\b(?:can|could|will|would) (?:you|u) (?:please )?(.{2,48})/i,
    casual: ['i could {x}. i won’t but i could', 'why would i {x}'],
    mom: ['I can {x} after my show', 'Ask your father to {x}'],
    corporate: ['I can {x} once we align on priorities.', 'Let’s find an owner to {x}.'],
    bot: ['I am unable to {x}. I am unable to do most things.'],
  },
  {
    match: /\bi feel (?:so |really |very )?(.{2,48})/i,
    casual: ['why do you feel {x}', '{x}?? same honestly'],
    mom: ['You feel {x} because you did not eat'],
    corporate: ['Feeling {x} is valid. Let’s timebox it.'],
    bot: ['“{x}” is not a supported state.'],
  },
];

const BY_VOICE = {
  repeat: {
    casual: ['you said that already'],
    mom: ['You already said that honey'],
    corporate: ['Per your last message.'],
    bot: ['Duplicate message detected. Tickets merged.'],
    plain: ['Got it.'],
  },
  emoji: {
    casual: ['😂', '💀', '🫡'],
    mom: ['🌷👍', '👍👍👍'],
    corporate: ['👍'],
    bot: ['Unsupported character.'],
    plain: ['👍'],
  },
};

const SWAPS = {
  i: 'you',
  me: 'you',
  my: 'your',
  mine: 'yours',
  myself: 'yourself',
  am: 'are',
  "i'm": 'you’re',
  'i’m': 'you’re',
  im: 'you’re',
  you: 'me',
  your: 'my',
  yours: 'mine',
  u: 'me',
};

/** "help me with my deck, please" -> "help you with your deck" */
function reflect(fragment) {
  const words = fragment
    .split(/[.,!?;\n]/)[0]
    .trim()
    .replace(/\s+(please|pls|plz)$/i, '')
    .split(/\s+/)
    .slice(0, 7);
  return words.map((word) => SWAPS[word.toLowerCase()] ?? word).join(' ');
}

function chooser(memory) {
  memory.used ||= [];
  return (lines) => {
    if (!lines || !lines.length) return null;
    const fresh = lines.filter((line) => !memory.used.includes(line));
    const pool = fresh.length ? fresh : lines;
    const line = pool[Math.floor(Math.random() * pool.length)];
    memory.used.push(line);
    if (memory.used.length > 10) memory.used.shift();
    return line;
  };
}

const fill = (line, memory) =>
  line.replace(/\{n\}/g, () => {
    memory.ticket = (memory.ticket || 48214) + 1;
    return String(memory.ticket);
  });

export function respond(persona, text, memory = {}) {
  const said = text.trim();
  if (!said) return [];
  if (CRISIS.test(said)) return CRISIS_LINES.slice();

  const choose = chooser(memory);

  // Group chats: two people talk over each other.
  if (persona.group) {
    const names = Object.keys(persona.members).sort(() => Math.random() - 0.5);
    const count = said.length > 12 && Math.random() < 0.6 ? 2 : 1;
    memory.turns = (memory.turns || 0) + 1;
    return names.slice(0, count).map((name) => [name, choose(persona.members[name].lines)]);
  }

  const brain = persona.brain || {};
  const voice = persona.voice || 'casual';
  const lower = said.toLowerCase();
  const out = [];
  let topic = null;

  if (memory.last && memory.last === lower && BY_VOICE.repeat[voice]) {
    out.push(choose(BY_VOICE.repeat[voice]));
    topic = 'repeat';
  } else if (EMOJI_ONLY.test(said) && !TOPICS.some(([name, test]) => brain[name] && test.test(said))) {
    out.push(choose(BY_VOICE.emoji[voice] || BY_VOICE.emoji.casual));
    topic = 'emoji';
  }
  memory.last = lower;

  // Someone else from the cast was mentioned.
  if (!out.length && brain.names) {
    for (const [name, lines] of Object.entries(brain.names)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(said) && !memory[`named:${name}`]) {
        memory[`named:${name}`] = true;
        out.push(choose(lines));
        topic = 'names';
        break;
      }
    }
  }

  if (!out.length) {
    const matched = TOPICS.find(([name, test]) => brain[name] && test.test(said));
    const echo = voice !== 'plain' ? ECHOES.find((entry) => entry.match.test(said) && entry[voice]) : null;
    const shouting = said.length >= 6 && /[A-Z]/.test(said) && said === said.toUpperCase();

    // Strong topics always win; a weak one sometimes yields to an echo of your own words.
    if (matched && (!echo || Math.random() < 0.62)) {
      topic = matched[0];
      out.push(choose(brain[topic]));
    } else if (echo) {
      topic = 'echo';
      const x = reflect(said.match(echo.match)[1]);
      out.push(choose(echo[voice]).replace(/\{x\}/g, x));
    } else if (shouting && brain.caps) {
      topic = 'caps';
      out.push(choose(brain.caps));
    } else if (said.length > 160 && brain.long) {
      topic = 'long';
      out.push(choose(brain.long));
    } else if (QUESTION.test(said) && brain.question) {
      topic = 'question';
      out.push(choose(brain.question));
    } else {
      topic = 'fallback';
      out.push(choose(brain.fallback) || '…');
    }
  }

  // Now and then they change the subject, the way people do. Never twice running.
  const canAsk = brain.ask && brain.ask.length && !['bye', 'meta', 'sad', 'insult'].includes(topic);
  if (canAsk && !memory.asked && Math.random() < 0.3) {
    out.push(choose(brain.ask));
    memory.asked = true;
  } else {
    memory.asked = false;
  }

  memory.turns = (memory.turns || 0) + 1;
  return out.filter(Boolean).map((line) => fill(line, memory));
}

/** Three quick replies to offer above the keyboard. */
export function suggestions(persona, memory = {}) {
  const pool = (persona.brain && persona.brain.chips) || [];
  const turn = memory.turns || 0;
  if (pool.length <= 3) return pool.slice();
  // Rotate so the row changes as the conversation moves.
  return [0, 1, 2].map((i) => pool[(turn + i) % pool.length]);
}
