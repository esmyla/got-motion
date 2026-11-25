// A real calculator. Mash mode feeds this the same keys a person would press,
// so everything it shows is genuinely computed.

const OPS = {
  '+': { rank: 1, run: (a, b) => a + b },
  '−': { rank: 1, run: (a, b) => a - b },
  '×': { rank: 2, run: (a, b) => a * b },
  '÷': { rank: 2, run: (a, b) => a / b },
  '^': { rank: 3, right: true, run: (a, b) => a ** b },
};

const DEG = Math.PI / 180;

function factorial(n) {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

/** True when the text is one parenthesised group, e.g. "(2 + 3)" but not "(2) + (3)". */
function isWrapped(text) {
  if (!text.startsWith('(') || !text.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    if (depth === 0 && i < text.length - 1) return false;
  }
  return true;
}

const isPlain = (text) => /^[\d.,]+$/.test(text) || /^[πe]$/.test(text);
const isNumberText = (text) => /^−?[\d.,]+(e−?\d+)?$/.test(text);
const group = (text) => (isPlain(text) || isWrapped(text) ? text : `(${text})`);
const call = (name) => (text) => (isWrapped(text) ? `${name}${text}` : `${name}(${text})`);

const UNARY = {
  'x²': { run: (v) => v * v, text: (s) => `${group(s)}²` },
  '√': { run: (v) => Math.sqrt(v), text: call('√') },
  sin: { run: (v) => Math.sin(v * DEG), text: call('sin') },
  cos: { run: (v) => Math.cos(v * DEG), text: call('cos') },
  tan: { run: (v) => (Math.abs(Math.cos(v * DEG)) < 1e-12 ? NaN : Math.tan(v * DEG)), text: call('tan') },
  ln: { run: (v) => Math.log(v), text: call('ln') },
  log: { run: (v) => Math.log10(v), text: call('log') },
  'x!': { run: factorial, text: (s) => `${group(s)}!` },
  '1/x': { run: (v) => 1 / v, text: (s) => `1/${group(s)}` },
};

/** Shaves floating-point fuzz: 0.1 + 0.2 is 0.3 here, and sin(180) is 0. */
const tidy = (v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(14)));

const commas = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const minus = (text) => text.replace(/-/g, '−');

export function formatNumber(value) {
  if (!Number.isFinite(value)) return 'Error';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e13 || abs < 1e-7) {
    const [mantissa, exponent] = value.toExponential(6).split('e');
    return minus(`${mantissa.replace(/\.?0+$/, '')}e${exponent.replace('+', '')}`);
  }
  if (Number.isInteger(value)) return minus(commas(String(value)));
  const rounded = Number(value.toPrecision(10));
  const [whole, fraction = ''] = rounded.toFixed(9).split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return minus(commas(whole) + (trimmed ? `.${trimmed}` : ''));
}

function formatTyped(typed) {
  const negative = typed.startsWith('-');
  const body = negative ? typed.slice(1) : typed;
  const [whole, fraction] = body.split('.');
  const text = commas(whole || '0') + (body.includes('.') ? `.${fraction ?? ''}` : '');
  return (negative ? '−' : '') + text;
}

function evaluate(tokens) {
  const values = [];
  const ops = [];
  const top = () => ops[ops.length - 1];
  const apply = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    values.push(OPS[op].run(a, b));
  };
  for (const token of tokens) {
    if (token.t === 'num') values.push(token.v);
    else if (token.t === 'op') {
      const mine = OPS[token.op];
      while (ops.length && top() !== '(' && (OPS[top()].rank > mine.rank || (OPS[top()].rank === mine.rank && !mine.right))) {
        apply();
      }
      ops.push(token.op);
    } else if (token.t === '(') ops.push('(');
    else {
      while (ops.length && top() !== '(') apply();
      ops.pop();
    }
  }
  while (ops.length) {
    if (top() === '(') ops.pop();
    else apply();
  }
  return values.length ? values[values.length - 1] : NaN;
}

const tokenText = (token) => (token.t === 'num' ? token.s : token.t === 'op' ? token.op : token.t);
const joinTokens = (tokens) => tokens.map(tokenText).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');

export class Calculator {
  constructor() {
    this.clear();
  }

  clear() {
    this.tokens = [];
    this.entry = null; // { typed: '12.5' } while typing, { v, s } for a computed value
    this.done = false; // true right after "="
    this.error = false;
    this.result = null;
    this.repeat = null; // last "op operand", so pressing "=" again repeats it
    this.doneExpr = '';
  }

  // ------------------------------------------------------------- reading

  get last() {
    return this.tokens[this.tokens.length - 1];
  }

  get openParens() {
    let depth = 0;
    for (const token of this.tokens) {
      if (token.t === '(') depth++;
      else if (token.t === ')') depth--;
    }
    return depth;
  }

  entryValue() {
    if (!this.entry) return null;
    if ('typed' in this.entry) return parseFloat(this.entry.typed) || 0;
    return this.entry.v;
  }

  /** The big number. */
  get main() {
    if (this.error) return 'Error';
    if (this.entry) return 'typed' in this.entry ? formatTyped(this.entry.typed) : formatNumber(this.entry.v);
    if (this.done) return formatNumber(this.result);
    if (!this.last) return '0';
    if (this.last.t === ')') return formatNumber(tidy(evaluate(this.tokens.slice(this.groupStart()))));
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      if (this.tokens[i].t === 'num') return formatNumber(this.tokens[i].v);
    }
    return '0';
  }

  /** The small line above it. */
  get expr() {
    if (this.done) return this.doneExpr ? `${this.doneExpr} =` : '';
    return joinTokens(this.tokens);
  }

  /** The operator waiting for its second number, if any (lights up its key). */
  get armed() {
    return !this.entry && !this.done && this.last?.t === 'op' ? this.last.op : null;
  }

  // ------------------------------------------------------------- helpers

  groupStart() {
    let depth = 0;
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      if (this.tokens[i].t === ')') depth++;
      else if (this.tokens[i].t === '(') depth--;
      if (depth === 0) return i;
    }
    return 0;
  }

  commitEntry() {
    if (!this.entry) return false;
    const typed = 'typed' in this.entry;
    this.tokens.push({ t: 'num', v: this.entryValue(), s: typed ? formatTyped(this.entry.typed) : this.entry.s });
    this.entry = null;
    return true;
  }

  fresh() {
    this.tokens = [];
    this.entry = null;
    this.done = false;
    this.repeat = null;
  }

  /** Lets "2 (" or ") 3" mean multiplication, the way people write it. */
  implyTimes() {
    if (this.last && (this.last.t === 'num' || this.last.t === ')')) this.tokens.push({ t: 'op', op: '×' });
  }

  fail() {
    this.error = true;
    this.tokens = [];
    this.entry = null;
    this.done = true;
    this.result = null;
    this.repeat = null;
    this.doneExpr = '';
    return { error: true };
  }

  // ------------------------------------------------------------- pressing

  /** Returns {} or { evaluated: { expr, value, text } } or { error: true }. */
  press(key) {
    if (this.error) {
      this.clear();
      if (key === 'AC' || key === '⌫') return {};
    }
    if (/^[0-9]$/.test(key)) return this.digit(key);
    if (key === 'xʸ') return this.operator('^');
    if (OPS[key]) return this.operator(key);
    if (UNARY[key]) return this.unary(key);
    switch (key) {
      case '.':
        return this.point();
      case 'AC':
        this.clear();
        return {};
      case '⌫':
        return this.backspace();
      case '±':
        return this.negate();
      case '%':
        return this.percent();
      case '=':
        return this.equals();
      case '(':
        return this.open();
      case ')':
        return this.close();
      case 'π':
        return this.constant(Math.PI, 'π');
      case 'e':
        return this.constant(Math.E, 'e');
      case 'Rand': {
        const v = Math.round(Math.random() * 1e6) / 1e6;
        return this.constant(v, formatNumber(v));
      }
      default:
        return {};
    }
  }

  digit(d) {
    if (this.done) this.fresh();
    if (this.entry && !('typed' in this.entry)) this.entry = null;
    if (!this.entry && this.last?.t === ')') this.implyTimes();
    let typed = this.entry ? this.entry.typed : '';
    if (typed.replace(/\D/g, '').length >= 12) return {};
    if (typed === '0') typed = d;
    else if (typed === '-0') typed = `-${d}`;
    else typed += d;
    this.entry = { typed };
    return {};
  }

  point() {
    if (this.done) this.fresh();
    if (this.entry && !('typed' in this.entry)) this.entry = null;
    if (!this.entry && this.last?.t === ')') this.implyTimes();
    const typed = this.entry ? this.entry.typed : '0';
    if (typed.includes('.')) return {};
    this.entry = { typed: `${typed}.` };
    return {};
  }

  backspace() {
    if (this.done || !this.entry || !('typed' in this.entry)) return {};
    const typed = this.entry.typed.slice(0, -1);
    this.entry = typed === '' || typed === '-' ? null : { typed };
    return {};
  }

  operator(op) {
    if (this.done) {
      const s = formatNumber(this.result);
      this.fresh();
      this.tokens = [{ t: 'num', v: this.result, s }];
    } else {
      this.commitEntry();
    }
    const last = this.last;
    if (!last || last.t === '(') this.tokens.push({ t: 'num', v: 0, s: '0' });
    else if (last.t === 'op') {
      last.op = op;
      return {};
    }
    this.tokens.push({ t: 'op', op });
    return {};
  }

  open() {
    if (this.done) this.fresh();
    this.commitEntry();
    this.implyTimes();
    this.tokens.push({ t: '(' });
    return {};
  }

  close() {
    if (this.done || this.openParens <= 0) return {};
    this.commitEntry();
    if (!this.last || (this.last.t !== 'num' && this.last.t !== ')')) return {};
    this.tokens.push({ t: ')' });
    return {};
  }

  constant(v, s) {
    if (this.done) this.fresh();
    // "2 π" means two pi; a second constant in a row simply replaces the first.
    if (this.entry && 'typed' in this.entry) this.commitEntry();
    else this.entry = null;
    this.implyTimes();
    this.entry = { v, s };
    return {};
  }

  /** Whatever a one-number function (√, x², sin…) should act on right now. */
  takeOperand() {
    if (this.done) {
      const operand = { v: this.result, s: formatNumber(this.result) };
      this.fresh();
      return operand;
    }
    if (this.entry) {
      const typed = 'typed' in this.entry;
      const operand = { v: this.entryValue(), s: typed ? formatTyped(this.entry.typed) : this.entry.s };
      this.entry = null;
      return operand;
    }
    if (this.last?.t === ')') {
      const start = this.groupStart();
      const slice = this.tokens.splice(start);
      return { v: tidy(evaluate(slice)), s: joinTokens(slice) };
    }
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      if (this.tokens[i].t === 'num') return { v: this.tokens[i].v, s: this.tokens[i].s };
    }
    return { v: 0, s: '0' };
  }

  unary(name) {
    const fn = UNARY[name];
    const operand = this.takeOperand();
    const v = fn.run(operand.v);
    if (!Number.isFinite(v)) return this.fail();
    this.entry = { v: tidy(v), s: fn.text(operand.s) };
    return {};
  }

  negate() {
    if (this.done) {
      const v = -this.result;
      this.fresh();
      this.entry = { v, s: formatNumber(v) };
    } else if (!this.entry) {
      if (this.last?.t === ')') return {};
      this.entry = { typed: '-0' };
    } else if ('typed' in this.entry) {
      const typed = this.entry.typed;
      this.entry = { typed: typed.startsWith('-') ? typed.slice(1) : `-${typed}` };
    } else {
      const v = -this.entry.v;
      this.entry = { v, s: isNumberText(this.entry.s) ? formatNumber(v) : `−${group(this.entry.s)}` };
    }
    return {};
  }

  percent() {
    let v;
    if (this.done) {
      v = this.result / 100;
      this.fresh();
    } else if (this.entry) {
      v = this.entryValue() / 100;
      // "200 + 10 %" means ten percent of 200, the way a shop calculator does it.
      const n = this.tokens.length;
      if (n === 2 && this.tokens[0].t === 'num' && (this.tokens[1].op === '+' || this.tokens[1].op === '−')) {
        v *= this.tokens[0].v;
      }
    } else {
      return {};
    }
    v = tidy(v);
    this.entry = { v, s: formatNumber(v) };
    return {};
  }

  equals() {
    if (this.done) {
      if (!this.repeat || this.result == null) return {};
      const again = this.repeat;
      const s = formatNumber(this.result);
      this.tokens = [{ t: 'num', v: this.result, s }, { t: 'op', op: again.op }, { t: 'num', v: again.v, s: again.s }];
      this.entry = null;
    } else {
      this.commitEntry();
    }
    while (this.last && (this.last.t === 'op' || this.last.t === '(')) this.tokens.pop();
    for (let n = this.openParens; n > 0; n--) this.tokens.push({ t: ')' });
    if (!this.tokens.length) {
      this.done = false;
      return {};
    }

    const tokens = this.tokens;
    const expr = joinTokens(tokens);
    const worked = tokens.length > 1 || !(isNumberText(tokens[0].s) || isPlain(tokens[0].s));
    const n = tokens.length;
    const repeat =
      n >= 3 && tokens[n - 2].t === 'op' && tokens[n - 1].t === 'num'
        ? { op: tokens[n - 2].op, v: tokens[n - 1].v, s: tokens[n - 1].s }
        : null;
    const value = evaluate(tokens);

    if (!Number.isFinite(value)) {
      this.fail();
      return { error: true, expr };
    }
    this.tokens = [];
    this.entry = null;
    this.done = true;
    this.result = tidy(value);
    this.repeat = repeat;
    this.doneExpr = expr;
    return worked ? { evaluated: { expr, value: this.result, text: formatNumber(this.result) } } : {};
  }
}
