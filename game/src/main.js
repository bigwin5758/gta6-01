// Solmar City 3D — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the Three.js renderer paints what is there.
// Screens: title, play, paused, upgrade (garage), over (busted / wasted).
// Money, mission progress and garage upgrades save to localStorage.
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
// 3D rebuild: the same Solmar City, story and missions as the 2D original,
// now rendered in Three.js with a chase camera, helicopter and garage.
// The loop owns nothing but timing: every system (cars, actors, heli,
// missions, audio) steps itself from the same sim state each tick.
import { STEP, SAVE_KEY, MONEY, WEAPON, WEAPONS, WEAPON_ORDER, WANTED, CAR, WORLD, UPGRADES, UPGRADE_KEYS } from './config.js';
import { createRandom } from './random.js';
import { createCity, nearestRoadPoint, roadCenterX, roadCenterY, pointInBuilding } from './world.js';
import { initCars, enterCar, exitCar, stepCars, nearestParkedCar, removePoliceCars } from './cars.js';
import { initActors, addWanted, stepActors } from './actors.js';
import { createHeli, stepHeli } from './heli.js';
import { createMissions, startMissions, updateMissions, missionTarget, missionObjective } from './missions.js';
import { createRenderer } from './render3d.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_PUNCH, ACTION_WEAPON, ACTION_RADIO, createInput } from './input.js';

const MAX_FRAME = 0.25;
const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSED = 'paused';
const SCREEN_UPGRADE = 'upgrade';
const SCREEN_OVER = 'over';
const STORY_LEN = 8;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const minimapCanvas = document.getElementById('minimap');
const status = document.getElementById('status');
const hud = {
  health: document.getElementById('healthfill'),
  money: document.getElementById('money'),
  stars: document.getElementById('stars'),
  objective: document.getElementById('objective'),
  weapon: document.getElementById('weapon'),
  radio: document.getElementById('radio-line'),
  toast: document.getElementById('toast'),
  prompt: document.getElementById('prompt'),
  missionCard: document.getElementById('mission-card'),
  missionTitle: document.getElementById('mission-title'),
  missionSub: document.getElementById('mission-sub'),
};
const screens = {
  start: document.getElementById('start-screen'),
  pause: document.getElementById('pause-screen'),
  over: document.getElementById('over-screen'),
  overTitle: document.getElementById('over-title'),
  overText: document.getElementById('over-text'),
  overStats: document.getElementById('over-stats'),
  upgrade: document.getElementById('upgrade-screen'),
};

const renderer = createRenderer(canvas, minimapCanvas);
const audio = createAudio();
const input = createInput(canvas);
if (input.isTouch) document.body.classList.add('touch');

let radioStep = 0; // 0 = off, 1..3 = station 0..2 (cycles back to off)

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return {
      money: Math.max(0, Math.floor(data.money)),
      done: Array.isArray(data.done) ? data.done : [],
      best: data.best || 0,
      mods: data.mods && typeof data.mods === 'object' ? data.mods : null,
    };
  } catch {
    return null;
  }
}

function writeSave(G) {
  try {
    const best = Math.max(readSave()?.best || 0, G.player.money);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.player.money, done: G.missions.done, best, mods: G.player.mods }));
  } catch {
    // Storage can be off; the game still runs, progress just lasts this visit.
  }
}

function freshEvents() {
  return { sounds: [], busted: false, wasted: false, pickedUp: null, stoleCar: false, playerHurt: false, siren: false, carWrecked: false };
}

function createGame(save) {
  const random = createRandom(seed);
  const city = createCity(random);
  const G = {
    city, random, time: 0,
    player: { x: 0, y: 0, angle: -Math.PI / 2, health: 100, maxHealth: 100, money: save ? save.money : 0, inCar: null, weapon: 'fists', ammo: WEAPON.startAmmo, punchCd: 0, shootCd: 0, wanted: 0, lastCrimeT: -999, wantedT: 0, regenT: 0, lastHurtT: -999, speed: 0, mods: (save && save.mods) || { speed: 0, armor: 0, handling: 0 } },
    cars: [], peds: [], cops: [], bullets: [], pickups: [], parts: [],
    crimeTimes: {}, respawns: [],
    events: freshEvents(),
    missions: createMissions(),
    heli: createHeli(),
    marker: null,
    best: save ? save.best : 0,
  };
  initCars(G);
  initActors(G);
  if (save && save.done.length > 0) {
    for (const id of save.done) {
      if (!G.missions.done.includes(id)) G.missions.done.push(id);
    }
    G.missions.index = Math.min(G.missions.done.length, STORY_LEN);
    if (G.missions.index >= STORY_LEN) G.missions.stage = 'done';
  }
  return G;
}

let G = createGame(readSave());
let screen = SCREEN_TITLE;

// Test/debug hook (used by the Playwright play-test only).
window.__solmar = {
  get G() { return G; },
  get screen() { return screen; },
  get renderer() { return renderer; },
};
let overKind = '';
let saveTimer = 0;
let toastTimer = null;
let cardTimer = null;

function announce(message) {
  status.textContent = message;
}

function showToast(message, ms) {
  hud.toast.textContent = message;
  hud.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hud.toast.classList.remove('show'), ms || 2600);
}

function showMissionCard(title, sub) {
  hud.missionTitle.textContent = title;
  hud.missionSub.textContent = sub;
  hud.missionCard.classList.add('show');
  if (cardTimer) clearTimeout(cardTimer);
  cardTimer = setTimeout(() => hud.missionCard.classList.remove('show'), 3400);
}

function showScreen(name) {
  screens.start.classList.toggle('hidden', name !== SCREEN_TITLE);
  screens.pause.classList.toggle('hidden', name !== SCREEN_PAUSED);
  screens.over.classList.toggle('hidden', name !== SCREEN_OVER);
  screens.upgrade.classList.toggle('hidden', name !== SCREEN_UPGRADE);
  const inGame = name !== SCREEN_TITLE;
  document.getElementById('hud').classList.toggle('hidden', !inGame);
  document.getElementById('minimap-wrap').classList.toggle('hidden', !inGame);
  document.getElementById('hint').classList.toggle('hidden', !inGame);
  document.getElementById('touch-ui').classList.toggle('hidden', !inGame);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function playSounds(G) {
  const heard = new Set();
  for (const name of G.events.sounds) {
    if (heard.has(name)) continue;
    heard.add(name);
    if (name === 'shot') audio.shot();
    else if (name === 'punch') audio.punch();
    else if (name === 'crash') audio.crash();
    else if (name === 'pickup') audio.pickup();
    else if (name === 'jingle') audio.jingle();
    else if (name === 'click') audio.click();
    else if (name === 'steal') audio.click();
  }
  audio.siren(!!G.events.siren);
  const driving = G.player.inCar ? Math.abs(G.player.inCar.speed) / 520 : 0;
  audio.engine(driving);
  audio.radioTick();
}

/** Handle one E press: exit a car, steal a car, open the garage, or use a nearby shop. */
function handleEnter(G) {
  const p = G.player;
  if (p.inCar) {
    exitCar(G);
    audio.click();
    return;
  }
  const car = nearestParkedCar(G, CAR.enterRange);
  if (car) {
    enterCar(G);
    addWanted(G, WANTED.stealCar, 'stealCar');
    showToast('Car stolen — the cops noticed that.');
    return;
  }
  const gar = G.city.landmarks.garage;
  if (dist(p.x, p.y, gar.x, gar.y) < 130) {
    openUpgrade(G);
    return;
  }
  const gun = G.city.landmarks.gunshop;
  if (dist(p.x, p.y, gun.x, gun.y) < 110 && p.money >= WEAPON.ammoPrice && p.ammo < WEAPON.maxAmmo) {
    p.money -= WEAPON.ammoPrice;
    p.ammo = Math.min(WEAPON.maxAmmo, p.ammo + WEAPON.ammoPack);
    audio.pickup();
    showToast(`Bought ${WEAPON.ammoPack} rounds — $${WEAPON.ammoPrice}.`);
    return;
  }
  const hosp = G.city.landmarks.hospital;
  if (dist(p.x, p.y, hosp.x, hosp.y) < 110 && p.money >= MONEY.medkitPrice && p.health < p.maxHealth) {
    p.money -= MONEY.medkitPrice;
    p.health = Math.min(p.maxHealth, p.health + MONEY.medkitHeal);
    audio.pickup();
    showToast(`Patched up +${MONEY.medkitHeal} health — $${MONEY.medkitPrice}.`);
  }
}

function refreshUpgrade(G) {
  const p = G.player;
  for (const key of UPGRADE_KEYS) {
    const lvl = p.mods[key] || 0;
    const up = UPGRADES[key];
    document.getElementById(`upg-${key}-level`).textContent = '●'.repeat(lvl) + '○'.repeat(3 - lvl);
    const btn = document.getElementById(`upg-${key}`);
    if (lvl >= 3) {
      btn.textContent = 'MAXED';
      btn.disabled = true;
    } else {
      btn.textContent = `BUY $${up.prices[lvl]}`;
      btn.disabled = p.money < up.prices[lvl];
    }
  }
  document.getElementById('upg-money').textContent = `Your money: $${p.money.toLocaleString('en-US')}`;
}

function openUpgrade(G) {
  refreshUpgrade(G);
  screen = SCREEN_UPGRADE;
  showScreen(screen);
  announce("Mama's Garage. Buy upgrades for your ride.");
}

function buyUpgrade(G, key) {
  const p = G.player;
  const lvl = p.mods[key] || 0;
  if (lvl >= 3) return;
  const price = UPGRADES[key].prices[lvl];
  if (p.money < price) return;
  p.money -= price;
  p.mods[key] = lvl + 1;
  audio.pickup();
  writeSave(G);
  refreshUpgrade(G);
  showToast(`${UPGRADES[key].name} level ${lvl + 1} installed.`);
}

function handleRadio() {
  radioStep = (radioStep + 1) % 4;
  if (radioStep === 0) {
    audio.radioOff();
    showToast('Radio off.');
  } else if (radioStep === 1) {
    audio.radioOn();
    showToast(`Radio: ${audio.radioName()}.`);
  } else {
    const name = audio.cycleRadio();
    showToast(`Radio: ${name}.`);
  }
  audio.click();
}

function stepGame(G, rawInput, dt, frameActions) {
  G.events = freshEvents();
  // Camera yaw dragged this frame (mouse right-drag / touch drag).
  renderer.addCamYaw(rawInput.takeCamYaw());
  // Screen-space move (keys + joystick, y down) -> world space, relative to
  // the camera's actual smoothed forward (getCamForward, not player.angle
  // + camYaw — that feeds back and spins the player when orbited).
  const mvScreen = rawInput.move();
  let mv = { x: 0, y: 0 };
  if (mvScreen.x !== 0 || mvScreen.y !== 0) {
    const camForward = renderer.getCamForward();
    const worldAngle = camForward + Math.atan2(mvScreen.y, mvScreen.x) + Math.PI / 2;
    mv = { x: Math.cos(worldAngle), y: Math.sin(worldAngle) };
  }
  const input = {
    move: mv,
    drive: rawInput.drive(),
    run: rawInput.runHeld(),
    shoot: rawInput.shootHeld(),
    punch: false,
    weapon: false,
    weaponSelect: rawInput.takeWeaponSelect(),
    aimWorld: null,
  };
  const actions = frameActions || 0;
  if (actions & ACTION_ENTER) handleEnter(G);
  if (actions & ACTION_PUNCH) input.punch = true;
  if (actions & ACTION_WEAPON) input.weapon = true;
  if (actions & ACTION_RADIO) handleRadio();
  // Aim: mouse position raycast to the ground; otherwise the camera facing.
  if (rawInput.aim.active && !G.player.inCar) {
    const g = renderer.screenToGround(rawInput.aim.x, rawInput.aim.y);
    if (g) input.aimWorld = g;
  }
  if (!input.aimWorld && !G.player.inCar) {
    const a = renderer.getCamForward();
    input.aimWorld = { x: G.player.x + Math.cos(a) * 300, y: G.player.y + Math.sin(a) * 300 };
  }
  stepCars(G, input, dt);
  stepActors(G, input, dt);
  stepHeli(G, dt);
  const mev = updateMissions(G, G.missions, dt);
  if (mev) {
    if (mev.type === 'started') showMissionCard(mev.mission.name, mev.mission.objective);
    else if (mev.type === 'completed') {
      showToast(`${mev.mission.name} complete — $${mev.mission.pay}.`);
      writeSave(G);
    } else if (mev.type === 'failed') {
      showToast(`${mev.mission.name} failed — Mama Rosa is not happy. Try again.`);
    } else if (mev.type === 'sidejob') {
      showToast('New fare: drive a passenger to the marker.');
    }
  }
  if (G.missions.banner) {
    showMissionCard(G.missions.banner.title, G.missions.banner.sub);
    G.missions.banner = null;
  }
  G.marker = missionTarget(G, G.missions);
  G.time += dt;
  playSounds(G);
  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    writeSave(G);
  }
}

function updateHud(G) {
  hud.health.style.width = `${Math.max(0, G.player.health)}%`;
  hud.money.textContent = `$${G.player.money.toLocaleString('en-US')}`;
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += `<span class="${i < G.player.wanted ? '' : 'off'}">★</span>`;
  hud.stars.innerHTML = stars;
  hud.objective.textContent = missionObjective(G.missions);
  const p = G.player;
  if (p.inCar) {
    const mods = p.mods;
    hud.weapon.textContent = `Driving — W/S speed, A/D steer, E exit · Engine ${mods.speed} Armor ${mods.armor} Handling ${mods.handling}`;
  } else {
    const names = WEAPON_ORDER.map((w) => (w === p.weapon ? `[${WEAPONS[w].name}]` : WEAPONS[w].name)).join(' ');
    hud.weapon.textContent = `${names} — ${p.ammo} rounds · 1-4 or WEAPON to switch, F punch, Space/click shoot`;
  }
  hud.radio.textContent = audio.radioName() ? `♪ ${audio.radioName()} (R to change)` : '';
  let prompt = '';
  if (!p.inCar) {
    if (nearestParkedCar(G, CAR.enterRange)) prompt = 'Press E to steal this car';
    else if (dist(p.x, p.y, G.city.landmarks.garage.x, G.city.landmarks.garage.y) < 130) prompt = 'Press E — Mama\'s Garage (upgrades)';
    else if (dist(p.x, p.y, G.city.landmarks.gunshop.x, G.city.landmarks.gunshop.y) < 110 && p.money >= WEAPON.ammoPrice && p.ammo < WEAPON.maxAmmo) prompt = `Press E — buy ${WEAPON.ammoPack} rounds ($${WEAPON.ammoPrice})`;
    else if (dist(p.x, p.y, G.city.landmarks.hospital.x, G.city.landmarks.hospital.y) < 110 && p.money >= MONEY.medkitPrice && p.health < p.maxHealth) prompt = `Press E — patch up ($${MONEY.medkitPrice})`;
  }
  hud.prompt.textContent = prompt;
  hud.prompt.classList.toggle('hidden', prompt === '');
}

function respawn(G, kind) {
  const p = G.player;
  if (p.inCar) {
    const car = p.inCar;
    car.driver = null;
    car.speed = 0;
    p.inCar = null;
  }
  removePoliceCars(G);
  G.cops.length = 0;
  G.heli = null;
  p.wanted = 0;
  p.lastCrimeT = -999;
  p.health = p.maxHealth;
  p.weapon = 'fists';
  const spot = kind === 'busted' ? G.city.landmarks.police : G.city.landmarks.hospital;
  p.x = spot.x;
  p.y = spot.y;
  p.angle = -Math.PI / 2;
  G.bullets.length = 0;
  writeSave(G);
}

function endGame(kind) {
  overKind = kind;
  const p = G.player;
  const loss = kind === 'busted' ? MONEY.bustLoss : MONEY.wasteLoss;
  p.money = Math.max(0, p.money - loss);
  audio.sting();
  audio.siren(false);
  audio.engine(0);
  audio.radioOff();
  radioStep = 0;
  screens.overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  screens.overTitle.className = kind === 'busted' ? 'busted' : 'wasted';
  screens.overText.textContent = kind === 'busted'
    ? `The Solmar PD caught up with you. They kept $${loss} as "evidence".`
    : `You got flattened. The hospital bill is $${loss}.`;
  screens.overStats.textContent = `Money: $${p.money.toLocaleString('en-US')} · Jobs done: ${G.missions.done.length} of ${STORY_LEN} · Best: $${Math.max(G.best, p.money).toLocaleString('en-US')}`;
  screen = SCREEN_OVER;
  showScreen(screen);
  announce(`${screens.overTitle.textContent}. ${screens.overText.textContent}`);
}

function startGame(fresh) {
  const save = readSave();
  if (fresh) {
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    G = createGame(null);
  } else if (save) {
    G = createGame(save);
  }
  audio.unlock();
  audio.click();
  startMissions(G, G.missions);
  screen = SCREEN_PLAY;
  showScreen(screen);
  announce('Playing. Follow the yellow marker.');
  showMissionCard(G.missions.current.name, G.missions.current.objective);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  const save = readSave();
  document.getElementById('btn-continue').classList.toggle('hidden', !(save && (save.money > 0 || save.done.length > 0)));

  document.getElementById('btn-start').addEventListener('click', () => startGame(true));
  document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
  document.getElementById('btn-resume').addEventListener('click', () => { screen = SCREEN_PLAY; showScreen(screen); });
  document.getElementById('btn-restart').addEventListener('click', () => startGame(true));
  document.getElementById('btn-quit').addEventListener('click', () => { screen = SCREEN_TITLE; showScreen(screen); });
  document.getElementById('btn-again').addEventListener('click', () => {
    respawn(G, overKind);
    screen = SCREEN_PLAY;
    showScreen(screen);
  });
  document.getElementById('btn-title').addEventListener('click', () => { screen = SCREEN_TITLE; showScreen(screen); });
  document.getElementById('btn-upg-close').addEventListener('click', () => { screen = SCREEN_PLAY; showScreen(screen); });
  for (const key of UPGRADE_KEYS) {
    document.getElementById(`upg-${key}`).addEventListener('click', () => buyUpgrade(G, key));
  }
  window.addEventListener('resize', () => renderer.resize());

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; showScreen(screen); announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; showScreen(screen); announce('Playing.'); }
      else if (screen === SCREEN_UPGRADE) { screen = SCREEN_PLAY; showScreen(screen); }
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      if (screen === SCREEN_TITLE) startGame(true);
      else { respawn(G, overKind); screen = SCREEN_PLAY; showScreen(screen); }
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_TITLE) {
          const idle = { move: () => ({ x: 0, y: 0 }), drive: () => ({ throttle: 0, steer: 0 }), runHeld: () => false, shootHeld: () => false, takeActions: () => 0, takeCamYaw: () => 0, takeWeaponSelect: () => null, aim: { active: false } };
          stepGame(G, idle, STEP, 0);
        } else {
          stepGame(G, input, STEP, firstStep ? actions : 0);
          firstStep = false;
        }
        accumulator -= STEP;
        if (G.events.busted) { endGame('busted'); break; }
        if (G.events.wasted) { endGame('wasted'); break; }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(G, screen);
    renderer.drawMinimap(G, G.marker);
    if (screen === SCREEN_PLAY) updateHud(G);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showScreen(screen);
      writeSave(G);
    }
  });
  window.addEventListener('beforeunload', () => writeSave(G));

  renderer.resize();
  announce('Solmar City 3D. Press Start to play.');
  requestAnimationFrame(frame);
}

// --- Screenshot staging (?shot=start|drive|chase|mission) -----------------
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function autoDrive(G) {
  const car = G.player.inCar;
  if (!car) return { throttle: 0, steer: 0 };
  const target = G.marker || { x: WORLD.size - 200, y: WORLD.size - 200 };
  const ix = Math.round((car.x - 40) / WORLD.pitch);
  const iy = Math.round((car.y - 40) / WORLD.pitch);
  const cx = roadCenterX(Math.max(0, Math.min(6, ix)));
  const cy = roadCenterY(Math.max(0, Math.min(6, iy)));
  const nearCentre = dist(car.x, car.y, cx, cy) < 90;
  let want = car.angle;
  if (nearCentre) {
    let best = null;
    let bestD = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const ny = iy + dy;
      if (nx < 0 || nx > 6 || ny < 0 || ny > 6) continue;
      const d = dist(roadCenterX(nx), roadCenterY(ny), target.x, target.y);
      if (d < bestD) { bestD = d; best = [dx, dy]; }
    }
    if (best) want = Math.atan2(best[1], best[0]);
  } else {
    want = Math.atan2(cy - car.y, cx - car.x);
  }
  const diff = wrapAngle(want - car.angle);
  return { throttle: Math.abs(diff) > 1.2 ? 0.4 : 1, steer: Math.max(-1, Math.min(1, diff * 2.5)) };
}

function stageShot(name) {
  const idle = { move: () => ({ x: 0, y: 0 }), drive: () => ({ throttle: 0, steer: 0 }), runHeld: () => false, shootHeld: () => false, takeActions: () => 0, takeCamYaw: () => 0, takeWeaponSelect: () => null, aim: { active: false } };
  G = createGame(null);
  startMissions(G, G.missions);
  let shown = SCREEN_TITLE;
  if (name === 'drive' || name === 'chase' || name === 'mission') {
    const p = G.player;
    let bestCar = null;
    let bestD = Infinity;
    for (const car of G.cars) {
      if (car.kind !== 'parked' || car.driver) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; bestCar = car; }
    }
    if (bestCar) {
      p.x = bestCar.x;
      p.y = bestCar.y;
      enterCar(G);
    }
    if ((name === 'drive' || name === 'chase') && G.player.inCar) {
      const car = G.player.inCar;
      car.x = roadCenterX(2);
      car.y = roadCenterY(3);
      car.angle = 0;
      car.speed = 0;
      p.x = car.x;
      p.y = car.y;
      p.angle = 0;
    }
    shown = SCREEN_PLAY;
    const seconds = name === 'chase' ? 9 : 7;
    if (name === 'chase') addWanted(G, 4, 'chase');
    for (let i = 0; i < seconds / STEP; i += 1) {
      const auto = autoDrive(G);
      const drv = { move: () => ({ x: 0, y: 0 }), drive: () => auto, runHeld: () => false, shootHeld: () => false, takeActions: () => 0, takeCamYaw: () => 0, takeWeaponSelect: () => null, aim: { active: false } };
      stepGame(G, drv, STEP);
      if (G.events.busted || G.events.wasted) break;
    }
    if (name === 'chase' && G.heli) {
      // Put the heli in frame ahead of the player for the shot.
      G.heli.x = G.player.x + Math.cos(G.player.angle) * 220;
      G.heli.y = G.player.y + Math.sin(G.player.angle) * 220;
      G.heli.z = 240;
    }
    if (name === 'mission') {
      const g = G.city.landmarks.garage;
      if (G.player.inCar) {
        G.player.inCar.x = g.x - 260;
        G.player.inCar.y = g.y;
        G.player.inCar.angle = 0;
        G.player.inCar.speed = 0;
      }
      G.marker = g;
      stepGame(G, idle, STEP);
    }
  } else {
    for (let i = 0; i < 5 / STEP; i += 1) stepGame(G, idle, STEP);
  }
  // Snap the camera to its settled chase position before the first paint,
  // so the shot is taken from the proper chase angle (not mid-lerp from
  // the title orbit, which reads as a steep top-down view).
  renderer.snapCamera(G, shown);
  let painted = 0;
  function paint() {
    renderer.draw(G, shown);
    renderer.drawMinimap(G, G.marker);
    if (shown === SCREEN_PLAY) updateHud(G);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  showScreen(shown);
  hud.missionCard.classList.remove('show');
  hud.toast.classList.remove('show');
  renderer.resize();
  requestAnimationFrame(paint);
}

if (shot) stageShot(shot);
else runGame();
