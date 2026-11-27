import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELAYS,
  REVEAL_WINDOW_MS,
  isWeakCode,
  generateCode,
  initialState,
  startSetup,
  rerollSetup,
  cancelSetup,
  confirmSetup,
  requestReveal,
  cancelRequest,
  tick,
  timeLeft,
  startRotate,
  cancelRotate,
  confirmRotate,
  setDelay,
  parseState,
} from '../lock.js';

const H = 60 * 60 * 1000;
const DAY = DELAYS['24h'];

// randomInt that returns digits from a fixed list, cycling.
function seq(...digits) {
  let i = 0;
  return () => digits[i++ % digits.length];
}

function lockedState(code = '5829', delayMs = DAY) {
  return confirmSetup(startSetup(initialState(), { delayMs, randomInt: seq(...code.split('').map(Number)) }));
}

test('weak codes are rejected', () => {
  for (const c of ['0000', '1111', '9999', '1234', '2345', '6789', '4321', '9876', '3210']) {
    assert.equal(isWeakCode(c), true, c);
  }
  for (const c of ['5829', '1235', '0012', '7071']) {
    assert.equal(isWeakCode(c), false, c);
  }
});

test('generateCode skips weak codes and returns 4 digits', () => {
  // First 4 draws make 1234 (weak), next 4 make 5829.
  const code = generateCode(seq(1, 2, 3, 4, 5, 8, 2, 9));
  assert.equal(code, '5829');
});

test('generateCode default uses crypto and yields valid codes', () => {
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.match(c, /^\d{4}$/);
    assert.equal(isWeakCode(c), false);
  }
});

test('setup flow: empty -> setup -> locked', () => {
  let s = initialState();
  assert.equal(s.phase, 'empty');
  s = startSetup(s, { delayMs: DAY, randomInt: seq(5, 8, 2, 9) });
  assert.deepEqual(s, { phase: 'setup', code: '5829', delayMs: DAY });
  s = rerollSetup(s, seq(7, 0, 7, 1));
  assert.equal(s.code, '7071');
  assert.equal(cancelSetup(s).phase, 'empty');
  s = confirmSetup(s);
  assert.deepEqual(s, { phase: 'locked', code: '7071', delayMs: DAY });
});

test('startSetup rejects unknown delays', () => {
  assert.throws(() => startSetup(initialState(), { delayMs: 5000 }));
});

test('request -> wait -> reveal after the delay, not before', () => {
  const t0 = 1_000_000;
  let s = requestReveal(lockedState(), t0);
  assert.equal(s.phase, 'waiting');
  assert.equal(s.requestedAt, t0);
  assert.equal(s.code, '5829');

  assert.equal(tick(s, t0 + DAY - 1).phase, 'waiting');
  assert.equal(timeLeft(s, t0 + DAY - 1000), 1000);

  const r = tick(s, t0 + DAY);
  assert.equal(r.phase, 'revealed');
  assert.equal(r.revealedAt, t0 + DAY);
});

test('reveal window starts when first observed, not when the wait ended', () => {
  const t0 = 0;
  const s = requestReveal(lockedState(), t0);
  const late = t0 + DAY + 3 * DAY; // opened the app 3 days after the wait ended
  const r = tick(s, late);
  assert.equal(r.phase, 'revealed');
  assert.equal(r.revealedAt, late);
});

test('revealed re-locks after 15 minutes', () => {
  const s = tick(requestReveal(lockedState(), 0), DAY);
  assert.equal(tick(s, DAY + REVEAL_WINDOW_MS - 1).phase, 'revealed');
  const l = tick(s, DAY + REVEAL_WINDOW_MS);
  assert.deepEqual(l, { phase: 'locked', code: '5829', delayMs: DAY });
  assert.equal(timeLeft(s, DAY + 60_000), REVEAL_WINDOW_MS - 60_000);
});

test('cancel request returns to locked', () => {
  const s = cancelRequest(requestReveal(lockedState(), 0));
  assert.deepEqual(s, { phase: 'locked', code: '5829', delayMs: DAY });
});

test('rotate swaps to a new code only on confirm', () => {
  const rev = tick(requestReveal(lockedState(), 0), DAY);
  const rot = startRotate(rev, seq(7, 0, 7, 1));
  assert.equal(rot.phase, 'rotating');
  assert.equal(rot.code, '5829');
  assert.equal(rot.newCode, '7071');
  assert.deepEqual(cancelRotate(rot), rev);
  assert.deepEqual(confirmRotate(rot), { phase: 'locked', code: '7071', delayMs: DAY });
});

test('rotating that times out keeps the old code', () => {
  const rev = tick(requestReveal(lockedState(), 0), DAY);
  const rot = startRotate(rev, seq(7, 0, 7, 1));
  const l = tick(rot, DAY + REVEAL_WINDOW_MS);
  assert.deepEqual(l, { phase: 'locked', code: '5829', delayMs: DAY });
});

test('locked: delay can only increase', () => {
  const s = lockedState('5829', DELAYS['6h']);
  assert.equal(setDelay(s, DELAYS['72h']).delayMs, DELAYS['72h']);
  assert.throws(() => setDelay(s, DELAYS['1h']));
});

test('revealed: delay can be decreased', () => {
  const rev = tick(requestReveal(lockedState(), 0), DAY);
  assert.equal(setDelay(rev, DELAYS['1h']).delayMs, DELAYS['1h']);
});

test('waiting: delay cannot change', () => {
  const w = requestReveal(lockedState(), 0);
  assert.throws(() => setDelay(w, DELAYS['72h']));
});

test('wrong-phase actions throw', () => {
  assert.throws(() => requestReveal(initialState(), 0));
  assert.throws(() => startRotate(lockedState()));
  assert.throws(() => confirmSetup(lockedState()));
});

test('parseState round-trips valid state and rejects junk', () => {
  const w = requestReveal(lockedState(), 123);
  assert.deepEqual(parseState(JSON.stringify(w)), w);
  assert.equal(parseState(null), null);
  assert.equal(parseState('not json'), null);
  assert.equal(parseState(JSON.stringify({ phase: 'locked', code: '12', delayMs: DAY })), null);
  assert.equal(parseState(JSON.stringify({ phase: 'waiting', code: '5829', delayMs: DAY })), null);
  assert.equal(parseState(JSON.stringify({ phase: 'locked', code: '5829', delayMs: 7 })), null);
});

test('delays offered', () => {
  assert.deepEqual(Object.keys(DELAYS), ['1h', '6h', '24h', '72h']);
  assert.equal(DELAYS['1h'], H);
});
