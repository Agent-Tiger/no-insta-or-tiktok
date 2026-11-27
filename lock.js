// Time-lock logic for the Screen Time passcode. Pure functions: no DOM, no storage,
// no real clock. Every function takes state in and returns new state (or throws).
//
// Phases:
//   empty -> setup -> locked -> waiting -> revealed -> (rotating) -> locked

const H = 60 * 60 * 1000;

export const DELAYS = Object.freeze({
  '1h': 1 * H,
  '6h': 6 * H,
  '24h': 24 * H,
  '72h': 72 * H,
});

export const REVEAL_WINDOW_MS = 15 * 60 * 1000;

const DELAY_VALUES = Object.values(DELAYS);
const PHASES = ['empty', 'setup', 'locked', 'waiting', 'revealed', 'rotating'];

function assertPhase(state, ...allowed) {
  if (!allowed.includes(state.phase)) {
    throw new Error(`Not allowed while ${state.phase} (needs ${allowed.join(' or ')})`);
  }
}

function assertDelay(delayMs) {
  if (!DELAY_VALUES.includes(delayMs)) throw new Error('Unknown delay');
}

// Codes that are easy to guess or remember: all the same digit, or a straight run
// up or down (1234, 6789, 4321, 3210).
export function isWeakCode(code) {
  const d = [...code].map(Number);
  if (d.every((x) => x === d[0])) return true;
  const steps = d.slice(1).map((x, i) => x - d[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

// One uniformly random digit 0-9 from the browser/Node crypto source. Draws a byte
// and rejects values >= 250 so every digit is equally likely.
function cryptoDigit() {
  const buf = new Uint8Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= 250);
  return buf[0] % 10;
}

export function generateCode(randomInt = cryptoDigit) {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += String(randomInt());
    if (!isWeakCode(code)) return code;
  }
}

export function initialState() {
  return { phase: 'empty' };
}

export function startSetup(state, { delayMs, randomInt } = {}) {
  assertPhase(state, 'empty');
  assertDelay(delayMs);
  return { phase: 'setup', code: generateCode(randomInt), delayMs };
}

export function rerollSetup(state, randomInt) {
  assertPhase(state, 'setup');
  return { ...state, code: generateCode(randomInt) };
}

export function cancelSetup(state) {
  assertPhase(state, 'setup');
  return initialState();
}

export function confirmSetup(state) {
  assertPhase(state, 'setup');
  return { phase: 'locked', code: state.code, delayMs: state.delayMs };
}

export function requestReveal(state, now) {
  assertPhase(state, 'locked');
  return { phase: 'waiting', code: state.code, delayMs: state.delayMs, requestedAt: now };
}

export function cancelRequest(state) {
  assertPhase(state, 'waiting');
  return { phase: 'locked', code: state.code, delayMs: state.delayMs };
}

// Moves time-driven phases forward. Call it whenever the app opens or on a timer.
// The reveal window starts when the wait is first observed as finished, not when it
// ended, so opening the app days later never shows a stale, already-expired code.
export function tick(state, now) {
  if (state.phase === 'waiting' && now >= state.requestedAt + state.delayMs) {
    return { phase: 'revealed', code: state.code, delayMs: state.delayMs, revealedAt: now };
  }
  if (
    (state.phase === 'revealed' || state.phase === 'rotating') &&
    now >= state.revealedAt + REVEAL_WINDOW_MS
  ) {
    return { phase: 'locked', code: state.code, delayMs: state.delayMs };
  }
  return state;
}

// Milliseconds until the current phase changes. 0 when nothing is pending.
export function timeLeft(state, now) {
  let end;
  if (state.phase === 'waiting') end = state.requestedAt + state.delayMs;
  else if (state.phase === 'revealed' || state.phase === 'rotating') {
    end = state.revealedAt + REVEAL_WINDOW_MS;
  } else return 0;
  return Math.max(0, end - now);
}

export function startRotate(state, randomInt) {
  assertPhase(state, 'revealed');
  let newCode;
  do {
    newCode = generateCode(randomInt);
  } while (newCode === state.code);
  return { ...state, phase: 'rotating', newCode };
}

export function cancelRotate(state) {
  assertPhase(state, 'rotating');
  const { newCode, ...rest } = state;
  return { ...rest, phase: 'revealed' };
}

export function confirmRotate(state) {
  assertPhase(state, 'rotating');
  return { phase: 'locked', code: state.newCode, delayMs: state.delayMs };
}

// A longer wait takes effect immediately. A shorter one needs the code revealed
// first, so you cannot dodge the wait by shrinking it.
export function setDelay(state, delayMs) {
  assertDelay(delayMs);
  if (state.phase === 'locked') {
    if (delayMs < state.delayMs) throw new Error('Delay can only be shortened after a reveal');
    return { ...state, delayMs };
  }
  if (state.phase === 'revealed') return { ...state, delayMs };
  throw new Error(`Delay cannot change while ${state.phase}`);
}

// Reads state saved by the app. Returns null for anything missing or malformed so a
// damaged save falls back to a fresh start instead of crashing.
export function parseState(text) {
  let s;
  try {
    s = JSON.parse(text);
  } catch {
    return null;
  }
  if (!s || typeof s !== 'object' || !PHASES.includes(s.phase)) return null;
  if (s.phase === 'empty') return s;

  if (typeof s.code !== 'string' || !/^\d{4}$/.test(s.code)) return null;
  if (!DELAY_VALUES.includes(s.delayMs)) return null;
  if (s.phase === 'waiting' && !Number.isFinite(s.requestedAt)) return null;
  if ((s.phase === 'revealed' || s.phase === 'rotating') && !Number.isFinite(s.revealedAt)) {
    return null;
  }
  if (s.phase === 'rotating' && !(typeof s.newCode === 'string' && /^\d{4}$/.test(s.newCode))) {
    return null;
  }
  return s;
}
