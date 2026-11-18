// Keyboard + mouse + touch input for Solmar City 3D.
// Same one-shot action flags as the 2D version (taken once per frame by the
// loop), plus: camera drag (mouse right-drag / touch drag on the canvas),
// a virtual joystick (touch + mouse), on-screen action buttons, and direct
// weapon selection (Digit1-4). move() returns a SCREEN-space vector
// (x right, y down) — main.js rotates it into world space with the camera
// heading. drive() is already screen-relative (up = accelerate).
// Touch UI elements live in index.html; this module wires them by id and
// no-ops gracefully if they are absent (desktop without touch).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_WEAPON = 16;
export const ACTION_RADIO = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const WEAPON_CYCLE = new Set(['KeyQ']);
const RADIO = new Set(['KeyR']);
const SHOOT = new Set(['Space']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

const WEAPON_KEYS = { Digit1: 'fists', Digit2: 'pistol', Digit3: 'smg', Digit4: 'shotgun' };

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let weaponSelect = null;
  let camYawDelta = 0;
  const aim = { x: 0, y: 0, active: false };
  let mouseDown = false;
  let fireHeld = false;
  let lastTouchAction = 0;

  // --- virtual joystick state (screen-space, y down, -1..1) ---
  const joy = { x: 0, y: 0, id: null };
  let joyBase = null;
  let joyKnob = null;

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  function byId(id) {
    return document.getElementById(id);
  }

  // Dedup helper: a tap that fired via touchstart must not also fire via mousedown/click.
  function tap(el, fn) {
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      lastTouchAction = Date.now();
      fn();
    }, { passive: false });
    el.addEventListener('mousedown', (e) => {
      if (Date.now() - lastTouchAction < 700) return;
      e.preventDefault();
      fn();
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (SHOOT.has(event.code)) event.preventDefault();
      return;
    }
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (WEAPON_CYCLE.has(event.code)) actions |= ACTION_WEAPON;
    else if (RADIO.has(event.code)) actions |= ACTION_RADIO;
    if (WEAPON_KEYS[event.code]) weaponSelect = WEAPON_KEYS[event.code];
    if (SHOOT.has(event.code) || UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
    fireHeld = false;
    joy.x = 0;
    joy.y = 0;
    joy.id = null;
  });

  // --- mouse aim + shoot + right-drag camera ---
  let camDrag = null; // {x} last clientX for mouse right-drag
  target.addEventListener('mousemove', (event) => {
    const rect = target.getBoundingClientRect();
    aim.x = event.clientX - rect.left;
    aim.y = event.clientY - rect.top;
    aim.active = true;
    if (camDrag !== null) {
      camYawDelta += (event.clientX - camDrag) * 0.005;
      camDrag = event.clientX;
    }
  });
  target.addEventListener('mousedown', (event) => {
    const rect = target.getBoundingClientRect();
    aim.x = event.clientX - rect.left;
    aim.y = event.clientY - rect.top;
    aim.active = true;
    if (event.button === 2) camDrag = event.clientX;
    else if (event.button === 0) mouseDown = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 2) camDrag = null;
    if (event.button === 0) mouseDown = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  // --- touch camera drag on the canvas (any touch that is not on UI) ---
  let touchCam = null; // {id, x}
  target.addEventListener('touchstart', (event) => {
    const t = event.changedTouches[0];
    touchCam = { id: t.identifier, x: t.clientX };
    // Do not preventDefault here: the canvas has touch-action:none in CSS.
  }, { passive: true });
  target.addEventListener('touchmove', (event) => {
    if (!touchCam) return;
    for (const t of event.changedTouches) {
      if (t.identifier === touchCam.id) {
        camYawDelta += (t.clientX - touchCam.x) * 0.006;
        touchCam.x = t.clientX;
      }
    }
  }, { passive: true });
  target.addEventListener('touchend', (event) => {
    if (!touchCam) return;
    for (const t of event.changedTouches) {
      if (t.identifier === touchCam.id) touchCam = null;
    }
  }, { passive: true });

  // --- virtual joystick ---
  function joyUpdate(t) {
    if (!joyBase) return;
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const R = rect.width / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    joy.x = dx / R;
    joy.y = dy / R;
    if (joyKnob) joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function joyReset() {
    joy.x = 0;
    joy.y = 0;
    joy.id = null;
    if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)';
  }
  function bindJoystick() {
    joyBase = byId('joystick');
    joyKnob = byId('joy-knob');
    if (!joyBase) return;
    joyBase.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joy.id = t.identifier;
      joyUpdate(t);
    }, { passive: false });
    joyBase.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) joyUpdate(t);
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) joyReset();
      }
    };
    joyBase.addEventListener('touchend', end);
    joyBase.addEventListener('touchcancel', end);
    // Mouse fallback (desktop testing): drag the joystick with the mouse.
    let mouseJoy = false;
    joyBase.addEventListener('mousedown', (e) => {
      mouseJoy = true;
      joy.id = 'mouse';
      joyUpdate(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (mouseJoy) joyUpdate(e);
    });
    window.addEventListener('mouseup', () => {
      if (mouseJoy) {
        mouseJoy = false;
        joyReset();
      }
    });
  }
  bindJoystick();

  // --- on-screen action buttons ---
  function holdButton(id, on, off) {
    const el = byId(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      lastTouchAction = Date.now();
      on();
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      off();
    }, { passive: false });
    el.addEventListener('touchcancel', () => off());
    el.addEventListener('mousedown', (e) => {
      if (Date.now() - lastTouchAction < 700) return;
      e.preventDefault();
      on();
    });
    el.addEventListener('mouseup', () => {
      if (Date.now() - lastTouchAction < 700) return;
      off();
    });
  }
  tap(byId('btn-enter'), () => { actions |= ACTION_ENTER; });
  tap(byId('btn-punch'), () => { actions |= ACTION_PUNCH; });
  tap(byId('btn-weapon'), () => { actions |= ACTION_WEAPON; });
  tap(byId('btn-radio'), () => { actions |= ACTION_RADIO; });
  tap(byId('btn-pause'), () => { actions |= ACTION_PAUSE; });
  holdButton('btn-fire', () => { fireHeld = true; }, () => { fireHeld = false; });

  const has = (set) => {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  };

  return {
    isTouch,
    /** Screen-space movement vector (x right, y down), -1..1, normalised. */
    move() {
      let x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0) + joy.x;
      let y = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0) + joy.y;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      if (len < 0.12) return { x: 0, y: 0 };
      return { x, y };
    },
    /** Driving: throttle 1 = accelerate, -1 = brake/reverse; steer -1..1. */
    drive() {
      let throttle = (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0) - joy.y;
      let steer = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0) + joy.x;
      throttle = Math.max(-1, Math.min(1, throttle));
      steer = Math.max(-1, Math.min(1, steer));
      return { throttle, steer };
    },
    runHeld() {
      return has(RUN) || Math.hypot(joy.x, joy.y) > 0.92;
    },
    shootHeld() {
      return has(SHOOT) || mouseDown || fireHeld;
    },
    /** Mouse aim in canvas CSS pixels, and whether the mouse has moved. */
    aim,
    /** Camera yaw dragged since the last call, in radians (consumed). */
    takeCamYaw() {
      const d = camYawDelta;
      camYawDelta = 0;
      return d;
    },
    /** Direct weapon selection from Digit1-4 (consumed), or null. */
    takeWeaponSelect() {
      const w = weaponSelect;
      weaponSelect = null;
      return w;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
