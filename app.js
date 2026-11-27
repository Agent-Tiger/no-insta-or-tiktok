import * as L from './lock.js';

const KEY = 'nit.state.v1';
const root = document.getElementById('app');
const LABELS = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '72h': '3 days' };
const DOTS = '• • • •';

let storageOk = true;
try {
  localStorage.setItem('nit.probe', '1');
  localStorage.removeItem('nit.probe');
} catch {
  storageOk = false;
}

function load() {
  try {
    const saved = L.parseState(localStorage.getItem(KEY));
    if (saved) return L.tick(saved, Date.now());
  } catch {
    // Storage blocked or unreadable: start fresh.
  }
  return L.initialState();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Nothing to do; the warning banner already tells the user.
  }
}

let state = load();
let countdownEl = null;
let notice = '';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid);
  return el;
}

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  const hrs = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${p(min)}:${p(sec)}` : `${min}:${p(sec)}`;
}

const spaced = (code) => [...code].join(' ');

function set(next) {
  state = next;
  save();
  render();
}

// Runs a state change; a refused one (stale button, wrong phase) shows its message.
function act(change) {
  try {
    set(change(state));
  } catch (err) {
    notice = err.message;
    render();
  }
}

function holdToView(code) {
  const out = h('div', { class: 'code' }, DOTS);
  const btn = h('button', { class: 'btn hold', type: 'button' }, 'Hold to view code');
  const show = () => { out.textContent = spaced(code); };
  const hide = () => { out.textContent = DOTS; };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); show(); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
    btn.addEventListener(type, hide);
  }
  btn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(); }
  });
  btn.addEventListener('keyup', hide);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return h('div', {}, out, btn);
}

function delaySelect(isAllowed, value, onChange) {
  const sel = h('select', { 'aria-label': 'Wait time' });
  for (const [key, ms] of Object.entries(L.DELAYS)) {
    if (!isAllowed(ms)) continue;
    const opt = h('option', { value: String(ms) }, LABELS[key]);
    if (ms === value) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => onChange(Number(sel.value)));
  return sel;
}

const delayName = (ms) => LABELS[Object.keys(L.DELAYS).find((k) => L.DELAYS[k] === ms)];

const VIEWS = {
  empty() {
    let chosen = L.DELAYS['24h'];
    root.append(
      h('p', { class: 'status' }, 'Not set up'),
      h('div', { class: 'card' },
        h('p', {}, 'This makes a random Screen Time passcode and hides it from you. It only shows the code after you wait, so an impulse to open Instagram or TikTok has time to pass.'),
        h('p', { class: 'muted' }, 'How long should you wait before the code is shown?'),
        delaySelect(() => true, chosen, (ms) => { chosen = ms; }),
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => act((s) => L.startSetup(s, { delayMs: chosen })),
        }, 'Start setup'),
      ),
    );
  },

  setup() {
    root.append(
      h('p', { class: 'status' }, 'Setting up'),
      h('div', { class: 'card' },
        h('ol', {},
          h('li', {}, 'Open Settings > Screen Time > Lock Screen Time Settings.'),
          h('li', {}, 'Hold the button below to see the code, and type it in.'),
          h('li', {}, 'When asked for an Apple ID for recovery, enter yours. Without it, a lost code means erasing the phone.'),
        ),
        holdToView(state.code),
        h('button', {
          class: 'btn secondary', type: 'button',
          onclick: () => act((s) => L.rerollSetup(s)),
        }, 'Make a different code'),
      ),
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => act((s) => L.confirmSetup(s)),
      }, "I've entered it in Screen Time"),
      h('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => act((s) => L.cancelSetup(s)),
      }, 'Cancel'),
    );
  },

  locked() {
    root.append(
      h('p', { class: 'status' }, 'Locked'),
      h('div', { class: 'card' },
        h('div', { class: 'code' }, DOTS),
        h('p', { class: 'muted' }, `Asking for the passcode starts a ${delayName(state.delayMs)} wait.`),
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => act((s) => L.requestReveal(s, Date.now())),
        }, 'Request passcode'),
      ),
      h('div', { class: 'card' },
        h('p', { class: 'muted' }, 'Wait time. It can be made longer here; shortening it needs the passcode first.'),
        delaySelect((ms) => ms >= state.delayMs, state.delayMs,
          (ms) => act((s) => L.setDelay(s, ms))),
      ),
    );
  },

  waiting() {
    countdownEl = h('div', { class: 'count' });
    root.append(
      h('p', { class: 'status' }, 'Waiting'),
      h('div', { class: 'card' },
        h('p', { class: 'label' }, 'Passcode shows in'),
        countdownEl,
        h('p', { class: 'muted' }, 'Come back to this app when the timer ends. The code then stays visible for 15 minutes.'),
        h('button', {
          class: 'btn secondary', type: 'button',
          onclick: () => act((s) => L.cancelRequest(s)),
        }, 'Cancel request'),
      ),
    );
  },

  revealed() {
    countdownEl = h('div', { class: 'count' });
    root.append(
      h('p', { class: 'status' }, 'Passcode unlocked'),
      h('div', { class: 'card' },
        h('div', { class: 'code' }, spaced(state.code)),
        h('p', { class: 'label' }, 'Hides again in'),
        countdownEl,
        h('p', { class: 'muted' }, 'When you are done, change to a new code so this one stops working: Settings > Screen Time > Change Screen Time Passcode.'),
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => act((s) => L.startRotate(s)),
        }, 'Change to a new code'),
      ),
      h('div', { class: 'card' },
        h('p', { class: 'muted' }, 'Wait time'),
        delaySelect(() => true, state.delayMs, (ms) => act((s) => L.setDelay(s, ms))),
      ),
    );
  },

  rotating() {
    countdownEl = h('div', { class: 'count' });
    root.append(
      h('p', { class: 'status' }, 'Changing passcode'),
      h('div', { class: 'card' },
        h('p', { class: 'label' }, 'Current code'),
        h('div', { class: 'code' }, spaced(state.code)),
        h('p', { class: 'label' }, 'New code'),
        h('div', { class: 'code' }, spaced(state.newCode)),
        h('p', { class: 'muted' }, 'In Settings > Screen Time > Change Screen Time Passcode, enter the current code, then the new one.'),
        h('p', { class: 'warn' }, 'Finish before the timer ends. If it runs out, this app keeps the current code. If you had already changed it on the phone, use "Forgot Passcode?" with your Apple ID.'),
        h('p', { class: 'label' }, 'Time left'),
        countdownEl,
      ),
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => act((s) => L.confirmRotate(s)),
      }, "I've changed it"),
      h('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => act((s) => L.cancelRotate(s)),
      }, 'Cancel'),
    );
  },
};

function render() {
  root.replaceChildren();
  countdownEl = null;
  if (!storageOk) {
    root.append(h('p', { class: 'warn' },
      "This browser can't save data, so the lock would reset. Open this page from the Home Screen icon."));
  }
  if (notice) {
    root.append(h('p', { class: 'warn' }, notice));
    notice = '';
  }
  VIEWS[state.phase]();
  updateCountdown();
}

function updateCountdown() {
  if (countdownEl) countdownEl.textContent = fmt(L.timeLeft(state, Date.now()));
}

function update() {
  const next = L.tick(state, Date.now());
  if (next !== state) set(next);
  else updateCountdown();
}

setInterval(update, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) update();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
