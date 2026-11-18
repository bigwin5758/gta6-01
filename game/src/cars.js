import { CAR, TRAFFIC, POLICE, PALETTE, WORLD } from './config.js';
import { collideBuildings, randomRoadSpawn, randomParkedSpot, roadCenterX, roadCenterY, clampToWorld, pointInBuilding } from './world.js';

const GRID = 6;
const CAR_R = 24;
const PAIR_DIST = 46;
const OFFROAD = 40;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function pick(G, arr) {
  return arr[Math.floor(G.random() * arr.length) % arr.length];
}

function nearestIdx(v, fn) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i <= GRID; i++) {
    const d = Math.abs(fn(i) - v);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function nextId(G) {
  let m = 0;
  for (const c of G.cars) if (c.id > m) m = c.id;
  return m + 1;
}

function nextWaypoint(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  if (Math.abs(c) >= Math.abs(s)) {
    const j = nearestIdx(car.y, roadCenterY);
    const ci = nearestIdx(car.x, roadCenterX);
    let i = ci + (c >= 0 ? 1 : -1);
    if (i < 0 || i > GRID) i = ci + (c >= 0 ? -1 : 1);
    i = clamp(i, 0, GRID);
    return { x: roadCenterX(i), y: roadCenterY(j) };
  }
  const i = nearestIdx(car.x, roadCenterX);
  const cj = nearestIdx(car.y, roadCenterY);
  let j = cj + (s >= 0 ? 1 : -1);
  if (j < 0 || j > GRID) j = cj + (s >= 0 ? -1 : 1);
  j = clamp(j, 0, GRID);
  return { x: roadCenterX(i), y: roadCenterY(j) };
}

function nearestRoadPoint(x, y) {
  const i = nearestIdx(x, roadCenterX);
  const j = nearestIdx(y, roadCenterY);
  const dx = Math.abs(roadCenterX(i) - x);
  const dy = Math.abs(roadCenterY(j) - y);
  if (dx <= dy) return { x: roadCenterX(i), y: y };
  return { x: x, y: roadCenterY(j) };
}

function offRoad(car) {
  const p = nearestRoadPoint(car.x, car.y);
  return Math.hypot(p.x - car.x, p.y - car.y) > OFFROAD;
}

function steerToward(car, tx, ty, rate, dt) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let d = want - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const max = rate * dt;
  car.angle += clamp(d, -max, max);
}

function carAhead(G, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const o of G.cars) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 8100 || d2 < 1) continue;
    const d = Math.sqrt(d2);
    if ((dx * fx + dy * fy) / d > 0.7) return true;
  }
  return false;
}

function pickNewWaypoint(G, car) {
  const ci = nearestIdx(car.wx, roadCenterX);
  const cj = nearestIdx(car.wy, roadCenterY);
  const opts = [];
  if (ci > 0) opts.push([ci - 1, cj]);
  if (ci < GRID) opts.push([ci + 1, cj]);
  if (cj > 0) opts.push([ci, cj - 1]);
  if (cj < GRID) opts.push([ci, cj + 1]);
  if (!opts.length) return;
  const p = opts[Math.floor(G.random() * opts.length) % opts.length];
  car.wx = roadCenterX(p[0]);
  car.wy = roadCenterY(p[1]);
}

function retargetPolice(G, car) {
  const ci = nearestIdx(car.x, roadCenterX);
  const cj = nearestIdx(car.y, roadCenterY);
  const pp = nearestRoadPoint(G.player.x, G.player.y);
  const opts = [];
  if (ci > 0) opts.push([ci - 1, cj]);
  if (ci < GRID) opts.push([ci + 1, cj]);
  if (cj > 0) opts.push([ci, cj - 1]);
  if (cj < GRID) opts.push([ci, cj + 1]);
  let best = null;
  let bd = Infinity;
  for (const p of opts) {
    const x = roadCenterX(p[0]);
    const y = roadCenterY(p[1]);
    const d = (x - pp.x) * (x - pp.x) + (y - pp.y) * (y - pp.y);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    car.wx = roadCenterX(best[0]);
    car.wy = roadCenterY(best[1]);
  }
}

function makeCar(G, x, y, angle, color, kind, driver, speed) {
  return {
    id: nextId(G), x: x, y: y, angle: angle, speed: speed,
    color: color, kind: kind, driver: driver, hp: 100, smoke: 0,
    wx: 0, wy: 0, siren: false, cruise: speed, retargetT: 0, wrecked: false
  };
}

export function initCars(G) {
  for (let k = 0; k < TRAFFIC.cars; k++) {
    const sp = randomRoadSpawn(G.random);
    if (!sp || sp.y >= 3000) continue;
    if (pointInBuilding(sp.x, sp.y, G.city.buildings)) continue;
    const speed = TRAFFIC.carSpeed * (0.85 + G.random() * 0.3);
    const car = makeCar(G, sp.x, sp.y, sp.angle, pick(G, PALETTE.carColors), 'traffic', 'traffic', speed);
    const wp = nextWaypoint(car);
    car.wx = wp.x;
    car.wy = wp.y;
    G.cars.push(car);
  }

  let placed = 0;
  for (let k = 0; k < 12; k++) {
    let spot = null;
    for (let t = 0; t < 10; t++) {
      const s = randomParkedSpot(G.random, G.city.buildings);
      if (!s) continue;
      if (s.y >= 3000) continue;
      if (pointInBuilding(s.x, s.y, G.city.buildings)) continue;
      let bad = false;
      for (const o of G.cars) {
        if (o.kind !== 'parked') continue;
        if (Math.hypot(o.x - s.x, o.y - s.y) < 90) { bad = true; break; }
      }
      if (bad) continue;
      spot = s;
      break;
    }
    if (!spot) continue;
    const color = placed === 0 ? PALETTE.taxi : pick(G, PALETTE.carColors);
    const car = makeCar(G, spot.x, spot.y, spot.angle, color, 'parked', null, 0);
    G.cars.push(car);
    placed++;
  }
}

export function enterCar(G) {
  if (G.player.inCar) return null;
  const car = nearestParkedCar(G, CAR.enterRange);
  if (!car) return null;
  car.driver = 'player';
  G.player.inCar = car;
  G.player.x = car.x;
  G.player.y = car.y;
  G.events.stoleCar = true;
  G.events.sounds.push('steal');
  return car;
}

export function exitCar(G) {
  const car = G.player.inCar;
  if (!car) return false;
  const a = car.angle + Math.PI / 2;
  let x = car.x + Math.cos(a) * 30;
  let y = car.y + Math.sin(a) * 30;
  const p = collideBuildings(x, y, 14, G.city.buildings);
  if (p) { x = p.x; y = p.y; }
  car.driver = null;
  car.speed = 0;
  G.player.inCar = null;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = car.angle;
  return true;
}

function stepPlayerCar(G, car, input, dt) {
  const drive = (input && input.drive) || {};
  const throttle = drive.throttle || 0;
  const steer = drive.steer || 0;
  // Garage upgrades: speed +12%/level (accel + top speed), handling +15%/level.
  const mods = (G.player && G.player.mods) || { speed: 0, armor: 0, handling: 0 };
  const maxSpeed = CAR.maxSpeed * (1 + 0.12 * mods.speed);
  const accel = CAR.accel * (1 + 0.12 * mods.speed);
  const steerRate = CAR.steerRate * (1 + 0.15 * mods.handling);
  if (throttle > 0) {
    car.speed = Math.min(maxSpeed, car.speed + accel * dt);
  } else if (throttle < 0) {
    if (car.speed > 0) car.speed = Math.max(0, car.speed - CAR.brake * dt);
    else car.speed = Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
  } else {
    const drag = 220 * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - drag);
    else car.speed = Math.min(0, car.speed + drag);
  }
  const sf = clamp(car.speed / 200, -1, 1);
  car.angle += steer * steerRate * sf * dt * (car.speed >= 0 ? 1 : -1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  G.player.x = car.x;
  G.player.y = car.y;
  G.player.angle = car.angle;
  G.player.speed = car.speed;
  if (Math.abs(car.speed) > 30) G.events.sounds.push('engine');
}

function stepTrafficCar(G, car, dt) {
  const dx = car.wx - car.x;
  const dy = car.wy - car.y;
  if (dx * dx + dy * dy < 900) pickNewWaypoint(G, car);
  let tx = car.wx;
  let ty = car.wy;
  if (offRoad(car)) {
    const p = nearestRoadPoint(car.x, car.y);
    tx = p.x;
    ty = p.y;
  }
  steerToward(car, tx, ty, 2.2, dt);
  let sp = car.cruise;
  if (carAhead(G, car)) sp *= 0.6;
  car.speed = sp;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function stepPoliceCar(G, car, dt) {
  car.retargetT -= dt;
  if (car.retargetT <= 0) {
    car.retargetT = 0.5;
    retargetPolice(G, car);
  }
  let tx = car.wx;
  let ty = car.wy;
  if (offRoad(car)) {
    const p = nearestRoadPoint(car.x, car.y);
    tx = p.x;
    ty = p.y;
  }
  steerToward(car, tx, ty, 3.0, dt);
  car.angle += Math.sin(G.time * 1.7 + car.id) * 0.25 * dt;
  car.speed = POLICE.carSpeed;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function collideWorld(G, car) {
  const bx = car.x;
  const by = car.y;
  // Armor upgrade: -25% crash damage per level (player car only).
  const mods = (G.player && G.player.mods) || { speed: 0, armor: 0, handling: 0 };
  const armorMul = car.driver === 'player' ? 1 - 0.25 * mods.armor : 1;
  const p = collideBuildings(car.x, car.y, CAR_R, G.city.buildings);
  if (p && (p.x !== bx || p.y !== by)) {
    car.x = p.x;
    car.y = p.y;
    if (Math.abs(car.speed) > CAR.crashSpeed) {
      car.hp -= CAR.crashDamage * armorMul;
      G.events.sounds.push('crash');
      if (car.driver === 'player') {
        G.player.health -= CAR.crashDamage * 0.5 * armorMul;
        G.events.playerHurt = true;
      }
    }
    car.speed *= -0.25;
  }
  const c = clampToWorld(car.x, car.y, CAR_R);
  if (c && (c.x !== car.x || c.y !== car.y)) {
    const fast = Math.abs(car.speed) > CAR.crashSpeed;
    car.x = c.x;
    car.y = c.y;
    car.speed *= fast ? 0.5 : 0.5;
  }
  if (car.y > WORLD.seaY - 30) {
    car.y = WORLD.seaY - 30;
    car.speed *= 0.5;
  }
}

function collidePairs(G) {
  for (let a = 0; a < G.cars.length; a++) {
    for (let b = a + 1; b < G.cars.length; b++) {
      const A = G.cars[a];
      const B = G.cars[b];
      if (A.kind === 'parked' && B.kind === 'parked') continue;
      let dx = B.x - A.x;
      let dy = B.y - A.y;
      let d = Math.hypot(dx, dy);
      if (d >= PAIR_DIST) continue;
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d;
      const ny = dy / d;
      const push = (PAIR_DIST - d) / 2;
      A.x -= nx * push;
      A.y -= ny * push;
      B.x += nx * push;
      B.y += ny * push;
      const rel = Math.abs(A.speed - B.speed);
      A.speed *= 0.6;
      B.speed *= 0.6;
      if (rel > 200) {
        G.events.sounds.push('crash');
        const mods = (G.player && G.player.mods) || { armor: 0 };
        const armorMul = 1 - 0.25 * mods.armor;
        A.hp -= A.driver === 'player' ? 10 * armorMul : 10;
        B.hp -= B.driver === 'player' ? 10 * armorMul : 10;
      }
    }
  }
}

function wreckCheck(G) {
  for (const car of G.cars) {
    if (car.wrecked || car.hp > 0) continue;
    car.wrecked = true;
    car.speed = 0;
    if (car.driver === 'player') {
      exitCar(G);
      G.events.carWrecked = true;
    }
    G.parts.push({ x: car.x, y: car.y, vx: 0, vy: -20, life: 0.6, maxLife: 0.6, color: '#666', size: 6 });
  }
}

export function stepCars(G, input, dt) {
  for (const car of G.cars) {
    if (car.wrecked) continue;
    if (car.driver === 'player') stepPlayerCar(G, car, input, dt);
    else if (car.kind === 'traffic') stepTrafficCar(G, car, dt);
    else if (car.kind === 'police') stepPoliceCar(G, car, dt);
  }
  for (const car of G.cars) {
    if (car.wrecked) continue;
    collideWorld(G, car);
  }
  collidePairs(G);
  wreckCheck(G);
}

export function nearestParkedCar(G, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of G.cars) {
    if (car.kind !== 'parked' || car.driver) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d <= bd) { bd = d; best = car; }
  }
  return best;
}

export function addPoliceCar(G) {
  let count = 0;
  for (const c of G.cars) if (c.kind === 'police') count++;
  if (count >= POLICE.maxCars) return null;
  let sp = null;
  for (let t = 0; t < 12; t++) {
    const s = randomRoadSpawn(G.random);
    if (!s) continue;
    if (!sp) sp = s;
    const d = Math.hypot(s.x - G.player.x, s.y - G.player.y);
    if (d >= 500 && d <= 700) { sp = s; break; }
  }
  if (!sp) return null;
  const car = makeCar(G, sp.x, sp.y, sp.angle, PALETTE.copCar, 'police', 'police', 0);
  car.siren = true;
  car.retargetT = 0;
  const wp = nextWaypoint(car);
  car.wx = wp.x;
  car.wy = wp.y;
  G.cars.push(car);
  return car;
}

export function removePoliceCars(G) {
  G.cars = G.cars.filter((c) => c.kind !== 'police');
  if (G.player.inCar && G.player.inCar.kind === 'police') G.player.inCar = null;
}
