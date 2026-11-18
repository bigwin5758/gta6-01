import { PLAYER, TRAFFIC, POLICE, WANTED, WEAPON, WEAPONS, WEAPON_ORDER, MONEY, PALETTE, WORLD } from './config.js';
import { collideBuildings, randomSidewalkPoint, clampToWorld, pointInBuilding, nearestRoadPoint } from './world.js';
import { addPoliceCar, removePoliceCars } from './cars.js';

const PED_COLORS = ['#e07a5f', '#5f8ae0', '#7ae05f', '#e0c35f', '#c05fe0', '#5fd4e0'];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function asPoint(v, x, y) {
  if (Array.isArray(v)) return { x: v[0], y: v[1] };
  if (v && typeof v === 'object') return { x: v.x, y: v.y };
  return { x, y };
}

function clampXY(x, y, r) {
  return asPoint(clampToWorld(x, y, r === undefined ? 14 : r), x, y);
}

function seaClamp(y, radius) {
  const limit = WORLD.seaY - 20 - radius;
  return y > limit ? limit : y;
}

function nearLandmark(G, lm, radius) {
  for (let i = 0; i < 40; i++) {
    const a = G.random() * Math.PI * 2;
    const d = G.random() * radius;
    const x = lm.x + Math.cos(a) * d;
    const y = lm.y + Math.sin(a) * d;
    if (!pointInBuilding(x, y, G.city.buildings)) return clampXY(x, y);
  }
  return clampXY(lm.x, lm.y);
}

function blood(G, x, y, n) {
  for (let i = 0; i < n; i++) {
    G.parts.push({
      x, y,
      vx: (G.random() - 0.5) * 160,
      vy: (G.random() - 0.5) * 160,
      life: 0.5 + G.random() * 0.4,
      maxLife: 0.9,
      color: PALETTE.blood,
      size: 2 + G.random() * 3
    });
  }
}

function spark(G, x, y, n) {
  for (let i = 0; i < n; i++) {
    G.parts.push({
      x, y,
      vx: (G.random() - 0.5) * 160,
      vy: (G.random() - 0.5) * 160,
      life: 0.25,
      maxLife: 0.25,
      color: '#ffd94a',
      size: 2
    });
  }
}

function killPed(G, ped) {
  ped.state = 'dead';
  ped.deadT = 0;
  blood(G, ped.x, ped.y, 10);
  addWanted(G, WANTED.killPed, 'killPed');
}

function movePed(G, ped, a, speed, dt) {
  const nx = ped.x + Math.cos(a) * speed * dt;
  const ny = ped.y + Math.sin(a) * speed * dt;
  const c = asPoint(collideBuildings(nx, ny, 12, G.city.buildings), nx, ny);
  const w = clampXY(c.x, c.y);
  ped.x = w.x;
  ped.y = seaClamp(w.y, 12);
}

function makePickup(G, kind, amount, x, y) {
  G.pickups.push({ x, y, kind, amount, phase: G.random() * Math.PI * 2 });
}

function spawnPickupOfKind(G, kind, amount) {
  if (kind === 'cash') {
    const p = randomSidewalkPoint(G.random);
    makePickup(G, kind, amount, p.x, p.y);
  } else if (kind === 'ammo') {
    const p = nearLandmark(G, G.city.landmarks.gunshop, 120);
    makePickup(G, kind, amount, p.x, p.y);
  } else {
    const p = nearLandmark(G, G.city.landmarks.hospital, 120);
    makePickup(G, kind, amount, p.x, p.y);
  }
}

export function initActors(G) {
  const p = G.player;
  const home = G.city.landmarks.safehouse;
  p.x = home.x;
  p.y = home.y;
  p.angle = -Math.PI / 2;
  p.health = PLAYER.health;
  p.maxHealth = PLAYER.health;
  p.weapon = 'fists';
  p.ammo = WEAPON.startAmmo;
  p.punchCd = 0;
  p.shootCd = 0;
  p.wanted = 0;
  p.lastCrimeT = -999;
  p.wantedT = 0;
  p.regenT = 0;
  p.lastHurtT = -999;
  p.speed = 0;
  p.inCar = null;

  G.peds = [];
  for (let i = 0; i < TRAFFIC.peds; i++) {
    const s = randomSidewalkPoint(G.random);
    const t = randomSidewalkPoint(G.random);
    G.peds.push({
      x: s.x,
      y: s.y,
      angle: G.random() * Math.PI * 2,
      speed: TRAFFIC.pedSpeed * (0.8 + G.random() * 0.4),
      state: 'walk',
      color: PED_COLORS[Math.floor(G.random() * PED_COLORS.length)],
      tx: t.x,
      ty: t.y,
      fleeT: 0,
      deadT: 0
    });
  }

  G.pickups = [];
  for (let i = 0; i < 8; i++) {
    const s = randomSidewalkPoint(G.random);
    makePickup(G, 'cash', 20 + Math.floor(G.random() * 60), s.x, s.y);
  }
  for (let i = 0; i < 3; i++) {
    const s = nearLandmark(G, G.city.landmarks.gunshop, 120);
    makePickup(G, 'ammo', WEAPON.ammoPack, s.x, s.y);
  }
  for (let i = 0; i < 2; i++) {
    const s = nearLandmark(G, G.city.landmarks.hospital, 120);
    makePickup(G, 'health', MONEY.medkitHeal, s.x, s.y);
  }

  G.crimeTimes = {};
  G.respawns = [];
  G.parts = [];
  G.bullets = [];
  G.cops = [];
}

export function addWanted(G, n, reason) {
  if (reason === 'shoot' || reason === 'hitPed') {
    if (G.time - (G.crimeTimes[reason] || -999) < 2) return;
  }
  G.crimeTimes[reason] = G.time;
  G.player.wanted = Math.min(WANTED.max, G.player.wanted + n);
  G.player.lastCrimeT = G.time;
  G.player.wantedT = 0;
}

export function spawnFootCop(G) {
  if (G.cops.length >= POLICE.maxFoot) return null;
  const p = G.player;
  for (let i = 0; i < 10; i++) {
    const a = G.random() * Math.PI * 2;
    const d = 300 + G.random() * 200;
    const rp = nearestRoadPoint(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    if (!rp) continue;
    const dd = Math.hypot(rp.x - p.x, rp.y - p.y);
    if (dd >= 300 && dd <= 500) {
      const cop = { x: rp.x, y: rp.y, angle: 0, speed: POLICE.footSpeed, shootCd: 0.5 + G.random(), hp: 50 };
      G.cops.push(cop);
      return cop;
    }
  }
  return null;
}

export function stepActors(G, input, dt) {
  const p = G.player;
  const buildings = G.city.buildings;
  const mv = input.move || { x: 0, y: 0 };

  if (input.weaponSelect) {
    const w = input.weaponSelect;
    p.weapon = (w === 'fists' || p.ammo > 0) ? w : 'fists';
    G.events.sounds.push('click');
  } else if (input.weapon) {
    const idx = WEAPON_ORDER.indexOf(p.weapon);
    let next = WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length];
    if (next !== 'fists' && p.ammo <= 0) next = 'fists';
    p.weapon = next;
    G.events.sounds.push('click');
  }

  if (!p.inCar) {
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const ox = p.x;
    const oy = p.y;
    let nx = p.x;
    let ny = p.y;
    if (mv.x !== 0 || mv.y !== 0) {
      p.angle = Math.atan2(mv.y, mv.x);
      nx = p.x + mv.x * speed * dt;
      ny = p.y + mv.y * speed * dt;
      const c = asPoint(collideBuildings(nx, ny, PLAYER.radius, buildings), nx, ny);
      const w = clampXY(c.x, c.y);
      nx = w.x;
      ny = seaClamp(w.y, PLAYER.radius);
    }
    for (const car of G.cars) {
      const dx = nx - car.x;
      const dy = ny - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 38) {
        const a = d < 0.001 ? p.angle : Math.atan2(dy, dx);
        nx = car.x + Math.cos(a) * 38;
        ny = car.y + Math.sin(a) * 38;
        const w = clampXY(nx, ny);
        nx = w.x;
        ny = seaClamp(w.y, PLAYER.radius);
      }
    }
    const moved = Math.hypot(nx - ox, ny - oy);
    p.speed = dt > 0 ? moved / dt : 0;
    p.x = nx;
    p.y = ny;
  } else {
    const car = p.inCar;
    p.speed = Math.abs(car.speed);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
  }

  p.punchCd -= dt;
  if (input.punch && p.punchCd <= 0 && !p.inCar) {
    p.punchCd = PLAYER.punchCooldown;
    G.events.sounds.push('punch');
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    const range2 = PLAYER.punchRange * PLAYER.punchRange;
    let best = null;
    let bestD = Infinity;
    for (const ped of G.peds) {
      if (ped.state !== 'walk' && ped.state !== 'flee') continue;
      const d = dist2(p.x, p.y, ped.x, ped.y);
      if (d > range2 || d >= bestD) continue;
      const dx = ped.x - p.x;
      const dy = ped.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      if ((dx / len) * fx + (dy / len) * fy <= 0.2) continue;
      best = ped;
      bestD = d;
    }
    for (const cop of G.cops) {
      const d = dist2(p.x, p.y, cop.x, cop.y);
      if (d > range2 || d >= bestD) continue;
      const dx = cop.x - p.x;
      const dy = cop.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      if ((dx / len) * fx + (dy / len) * fy <= 0.2) continue;
      best = cop;
      bestD = d;
    }
    if (best && G.peds.includes(best)) {
      killPed(G, best);
    } else if (best) {
      best.hp -= PLAYER.punchDamage;
      blood(G, best.x, best.y, 6);
      if (best.hp <= 0) {
        const idx = G.cops.indexOf(best);
        if (idx >= 0) G.cops.splice(idx, 1);
        addWanted(G, WANTED.killCop, 'killCop');
        G.events.sounds.push('punch');
      }
    } else {
      let carBest = null;
      let carD = Infinity;
      const cr2 = (PLAYER.punchRange + 20) * (PLAYER.punchRange + 20);
      for (const car of G.cars) {
        const d = dist2(p.x, p.y, car.x, car.y);
        if (d < cr2 && d < carD) {
          carBest = car;
          carD = d;
        }
      }
      if (carBest) {
        carBest.hp -= 10;
        G.events.sounds.push('punch');
      }
    }
  }

  p.shootCd -= dt;
  const wdef = WEAPONS[p.weapon] || WEAPONS.fists;
  if (input.shoot && p.weapon !== 'fists' && p.ammo > 0 && p.shootCd <= 0) {
    p.shootCd = wdef.cooldown;
    p.ammo -= 1;
    const baseA = input.aimWorld
      ? Math.atan2(input.aimWorld.y - p.y, input.aimWorld.x - p.x)
      : p.angle;
    const bca = Math.cos(baseA);
    const bsa = Math.sin(baseA);
    for (let k = 0; k < wdef.pellets; k++) {
      const a = baseA + (G.random() - 0.5) * wdef.spread * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      G.bullets.push({
        x: p.x + ca * 20,
        y: p.y + sa * 20,
        vx: ca * WEAPON.bulletSpeed,
        vy: sa * WEAPON.bulletSpeed,
        life: wdef.range / WEAPON.bulletSpeed,
        damage: wdef.damage,
        fromPlayer: true,
      });
    }
    G.events.sounds.push('shot');
    addWanted(G, WANTED.shoot, 'shoot');
    for (let i = 0; i < 3; i++) {
      G.parts.push({
        x: p.x + bca * 22,
        y: p.y + bsa * 22,
        vx: bca * 90 + (G.random() - 0.5) * 60,
        vy: bsa * 90 + (G.random() - 0.5) * 60,
        life: 0.12,
        maxLife: 0.12,
        color: '#ffd94a',
        size: 2,
      });
    }
    if (p.ammo <= 0) p.weapon = 'fists';
  }

  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = false;
    if (b.life <= 0) {
      dead = true;
    } else if (pointInBuilding(b.x, b.y, buildings)) {
      spark(G, b.x, b.y, 3);
      dead = true;
    }
    if (!dead && b.fromPlayer) {
      for (const ped of G.peds) {
        if (ped.state !== 'walk' && ped.state !== 'flee') continue;
        if (dist2(b.x, b.y, ped.x, ped.y) < 256) {
          killPed(G, ped);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.fromPlayer) {
      for (let j = G.cops.length - 1; j >= 0; j--) {
        const cop = G.cops[j];
        if (dist2(b.x, b.y, cop.x, cop.y) < 256) {
          cop.hp -= b.damage;
          blood(G, cop.x, cop.y, 6);
          if (cop.hp <= 0) {
            G.cops.splice(j, 1);
            addWanted(G, WANTED.killCop, 'killCop');
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.fromPlayer) {
      for (const car of G.cars) {
        if (car === p.inCar) continue;
        if (dist2(b.x, b.y, car.x, car.y) < 676) {
          car.hp -= b.damage;
          spark(G, b.x, b.y, 4);
          if (car.hp <= 0) {
            car.hp = 0;
            car.speed = 0;
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      if (dist2(b.x, b.y, p.x, p.y) < PLAYER.radius * PLAYER.radius) {
        p.health -= b.damage;
        p.lastHurtT = G.time;
        G.events.playerHurt = true;
        dead = true;
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }

  const shotThisStep = G.events.sounds.includes('shot');

  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    if (ped.state === 'dead') {
      ped.deadT += dt;
      if (ped.deadT > 8) G.peds.splice(i, 1);
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const a = Math.atan2(ped.y - ped.fy, ped.x - ped.fx);
      ped.angle = a;
      movePed(G, ped, a, ped.speed * 2.2, dt);
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else {
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      if (Math.hypot(dx, dy) < 20) {
        const t = randomSidewalkPoint(G.random);
        ped.tx = t.x;
        ped.ty = t.y;
      } else {
        const a = Math.atan2(dy, dx);
        ped.angle = a;
        movePed(G, ped, a, ped.speed, dt);
      }
    }
    if (shotThisStep) {
      ped.state = 'flee';
      ped.fleeT = 3;
      ped.fx = p.x;
      ped.fy = p.y;
    } else {
      for (const car of G.cars) {
        if (Math.abs(car.speed) > 150 && dist2(ped.x, ped.y, car.x, car.y) < 4900) {
          ped.state = 'flee';
          ped.fleeT = 3;
          ped.fx = car.x;
          ped.fy = car.y;
          break;
        }
      }
    }
  }

  if (p.inCar && Math.abs(p.inCar.speed) > 50) {
    for (let i = G.peds.length - 1; i >= 0; i--) {
      const ped = G.peds[i];
      if (ped.state === 'dead') continue;
      if (dist2(p.inCar.x, p.inCar.y, ped.x, ped.y) < 900) {
        killPed(G, ped);
        addWanted(G, WANTED.hitPed, 'hitPed');
        G.events.sounds.push('crash');
      }
    }
  }

  for (let i = G.cops.length - 1; i >= 0; i--) {
    const cop = G.cops[i];
    if (p.wanted <= 0) {
      G.cops.splice(i, 1);
      continue;
    }
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    const nx = cop.x + Math.cos(cop.angle) * POLICE.footSpeed * dt;
    const ny = cop.y + Math.sin(cop.angle) * POLICE.footSpeed * dt;
    const c = asPoint(collideBuildings(nx, ny, 12, buildings), nx, ny);
    const w = clampXY(c.x, c.y);
    cop.x = w.x;
    cop.y = seaClamp(w.y, 12);
    cop.shootCd -= dt;
    if (!p.inCar && d < POLICE.arrestRange && p.speed < POLICE.arrestPlayerSpeed) {
      G.events.busted = true;
    }
    if (d < POLICE.shootRange && cop.shootCd <= 0) {
      cop.shootCd = POLICE.shootCooldown;
      const a = Math.atan2(dy, dx) + (G.random() - 0.5) * POLICE.shootSpread * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      G.bullets.push({
        x: cop.x + ca * 18,
        y: cop.y + sa * 18,
        vx: ca * WEAPON.bulletSpeed * 0.9,
        vy: sa * WEAPON.bulletSpeed * 0.9,
        life: WEAPON.pistolRange / WEAPON.bulletSpeed,
        damage: POLICE.shootDamage,
        fromPlayer: false
      });
      G.events.sounds.push('shot');
    }
  }

  if (p.wanted > 0) {
    let nearest = Infinity;
    for (const cop of G.cops) {
      const d = Math.hypot(cop.x - p.x, cop.y - p.y);
      if (d < nearest) nearest = d;
    }
    for (const car of G.cars) {
      if (car.kind !== 'police') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < nearest) nearest = d;
    }
    if (G.time - p.lastCrimeT > WANTED.decayDelay && nearest > 500) {
      p.wantedT += dt;
      if (p.wantedT >= WANTED.decayInterval) {
        p.wanted -= 1;
        p.wantedT = 0;
      }
    }
    let policeCars = 0;
    for (const car of G.cars) if (car.kind === 'police') policeCars++;
    const wantCars = Math.min(p.wanted * POLICE.carsPerStar, POLICE.maxCars);
    while (policeCars < wantCars) {
      addPoliceCar(G);
      policeCars++;
    }
    const wantFoot = Math.min(p.wanted * POLICE.footPerStar, POLICE.maxFoot);
    while (G.cops.length < wantFoot) {
      if (!spawnFootCop(G)) break;
    }
  } else {
    let policeCars = 0;
    for (const car of G.cars) if (car.kind === 'police') policeCars++;
    if (policeCars > 0) removePoliceCars(G);
    G.cops.length = 0;
  }

  if (G.time - p.lastHurtT > PLAYER.regenDelay && p.health < p.maxHealth && p.health > 0) {
    p.health = Math.min(p.maxHealth, p.health + PLAYER.regenRate * dt);
  }

  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.phase += dt;
    if (dist2(p.x, p.y, pk.x, pk.y) > 1296) continue;
    if (pk.kind === 'cash') {
      p.money += pk.amount;
      G.events.pickedUp = { kind: 'cash', amount: pk.amount };
    } else if (pk.kind === 'ammo') {
      p.ammo = Math.min(WEAPON.maxAmmo, p.ammo + pk.amount);
      G.events.pickedUp = { kind: 'ammo', amount: pk.amount };
    } else {
      p.health = Math.min(p.maxHealth, p.health + pk.amount);
      G.events.pickedUp = { kind: 'health', amount: pk.amount };
    }
    G.events.sounds.push('pickup');
    G.respawns.push({ kind: pk.kind, amount: pk.amount, at: G.time + 20 });
    G.pickups.splice(i, 1);
  }

  for (let i = G.respawns.length - 1; i >= 0; i--) {
    const r = G.respawns[i];
    if (G.time >= r.at) {
      spawnPickupOfKind(G, r.kind, r.amount);
      G.respawns.splice(i, 1);
    }
  }

  for (let i = G.parts.length - 1; i >= 0; i--) {
    const pt = G.parts[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.97;
    pt.vy *= 0.97;
    if (pt.life <= 0) G.parts.splice(i, 1);
  }
  while (G.parts.length > 300) G.parts.shift();

  if (p.health <= 0) {
    p.health = 0;
    G.events.wasted = true;
  }

  G.events.siren = p.wanted > 0;
}
