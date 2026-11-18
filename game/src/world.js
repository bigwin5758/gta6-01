import { WORLD, PALETTE } from './config.js';

const SIZE = WORLD.size;
const PITCH = WORLD.pitch;
const ROAD = WORLD.road;
const BLOCKS = WORLD.blocks;
const BEACH_Y = WORLD.beachY;
const SEA_Y = WORLD.seaY;
const BLOCK = PITCH - ROAD;
const HALF = BLOCK / 2;
const ROAD_INDICES = Array.from({ length: BLOCKS }, (_, i) => i);
const ROAD_XS = ROAD_INDICES.map((i) => i * PITCH);
const ROAD_YS = ROAD_INDICES.map((i) => i * PITCH);

const LOT = 150;
const GAP = 20;
const MARGIN = 16;
const CLEAR = 40;
const ROOF_COUNT = 3;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function blockOrigin(bx, by) {
  return { x: bx * PITCH + ROAD, y: by * PITCH + ROAD };
}

function blockCentre(bx, by) {
  const o = blockOrigin(bx, by);
  return { x: o.x + HALF, y: o.y + HALF };
}

function perimeterPoint(random, bx, by, inset) {
  const o = blockOrigin(bx, by);
  const x0 = o.x + inset;
  const y0 = o.y + inset;
  const s = BLOCK - 2 * inset;
  const t = random() * 4 * s;
  if (t < s) return { x: x0 + t, y: y0 };
  if (t < 2 * s) return { x: x0 + s, y: y0 + (t - s) };
  if (t < 3 * s) return { x: x0 + s - (t - 2 * s), y: y0 + s };
  return { x: x0, y: y0 + s - (t - 3 * s) };
}

function clearLandmark(b, px, py, c) {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  if (dx >= c || dy >= c) return;
  const options = [
    { side: 'l', cost: (px + c - b.x) * b.h, size: b.x + b.w - (px + c) },
    { side: 'r', cost: (b.x + b.w - (px - c)) * b.h, size: px - c - b.x },
    { side: 't', cost: (py + c - b.y) * b.w, size: b.y + b.h - (py + c) },
    { side: 'b', cost: (b.y + b.h - (py - c)) * b.w, size: py - c - b.y },
  ].filter((o) => o.size > 0);
  if (!options.length) return;
  options.sort((a, b2) => a.cost - b2.cost);
  const o = options[0];
  if (o.side === 'l') {
    b.x = px + c;
    b.w = o.size;
  } else if (o.side === 'r') {
    b.w = o.size;
  } else if (o.side === 't') {
    b.y = py + c;
    b.h = o.size;
  } else {
    b.h = o.size;
  }
}

function makeBuilding(random, lx, ly) {
  const inset = 8 + random() * 10;
  const w = Math.max(60, LOT - 2 * inset);
  const h = Math.max(60, LOT - 2 * inset);
  return {
    x: lx + inset,
    y: ly + inset,
    w,
    h,
    roof: Math.floor(random() * ROOF_COUNT),
    height: 18 + random() * 28,
  };
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const landmarks = {};

  const landmarkBlocks = {
    '0,0': 'safehouse',
    '5,2': 'garage',
    '2,4': 'gunshop',
    '6,0': 'hospital',
    '0,6': 'police',
    '6,5': 'drop',
  };
  const parkBlocks = new Set(['3,3', '4,4']);

  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      const key = bx + ',' + by;
      const o = blockOrigin(bx, by);
      if (parkBlocks.has(key)) {
        parks.push({ x: o.x, y: o.y, w: BLOCK, h: BLOCK });
        continue;
      }
      if (o.y + BLOCK > BEACH_Y) continue;

      const start = buildings.length;
      const startX = o.x + MARGIN + (BLOCK - 2 * MARGIN - (2 * LOT + GAP)) / 2;
      const startY = o.y + MARGIN + (BLOCK - 2 * MARGIN - (2 * LOT + GAP)) / 2;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          if (random() >= 0.75) continue;
          const lx = startX + col * (LOT + GAP);
          const ly = startY + row * (LOT + GAP);
          buildings.push(makeBuilding(random, lx, ly));
        }
      }

      if (landmarkBlocks[key]) {
        const c = blockCentre(bx, by);
        for (let i = start; i < buildings.length; i++) {
          clearLandmark(buildings[i], c.x, c.y, CLEAR);
        }
      }
    }
  }

  landmarks.safehouse = blockCentre(0, 0);
  landmarks.garage = blockCentre(5, 2);
  landmarks.gunshop = blockCentre(2, 4);
  landmarks.hospital = blockCentre(6, 0);
  landmarks.police = blockCentre(0, 6);
  landmarks.park = blockCentre(3, 3);
  landmarks.pier = { x: 1540, y: 2960 };
  landmarks.drop = blockCentre(6, 5);

  for (let i = 0; i < 26; i++) {
    const p = parks[Math.floor(random() * parks.length)];
    trees.push({
      x: p.x + 20 + random() * (p.w - 40),
      y: p.y + 20 + random() * (p.h - 40),
      r: 10 + random() * 6,
    });
  }
  for (let i = 0; i < 18; i++) {
    trees.push({ x: random() * SIZE, y: 2930 + random() * 50, r: 10 + random() * 6 });
  }
  for (let i = 0; i < 12; i++) {
    const bx = Math.floor(random() * BLOCKS);
    const by = Math.floor(random() * BLOCKS);
    const p = perimeterPoint(random, bx, by, 8);
    trees.push({ x: p.x, y: p.y, r: 10 + random() * 6 });
  }

  return {
    buildings,
    trees,
    landmarks,
    roadXs: ROAD_XS.slice(),
    roadYs: ROAD_YS.slice(),
    parks,
    beach: { x: 0, y: BEACH_Y, w: SIZE, h: SEA_Y - BEACH_Y },
    sea: { x: 0, y: SEA_Y, w: SIZE, h: SIZE - SEA_Y },
  };
}

export function isOnRoad(x, y) {
  if (y >= SEA_Y) return false;
  for (let i = 0; i < BLOCKS; i++) {
    const c = i * PITCH;
    if (x >= c && x <= c + ROAD) return true;
    if (y >= c && y <= c + ROAD) return true;
  }
  return false;
}

export function roadCenterX(i) {
  return i * PITCH + ROAD / 2;
}

export function roadCenterY(i) {
  return i * PITCH + ROAD / 2;
}

function nearestCentre(v) {
  const i = clamp(Math.round((v - ROAD / 2) / PITCH), 0, BLOCKS - 1);
  return i * PITCH + ROAD / 2;
}

export function nearestRoadPoint(x, y) {
  const vx = nearestCentre(x);
  const hy = nearestCentre(y);
  let nx = x;
  let ny = y;
  if (Math.abs(x - vx) <= Math.abs(y - hy)) nx = vx;
  else ny = hy;
  return { x: clamp(nx, 0, SIZE), y: clamp(ny, 0, SIZE) };
}

export function collideBuildings(x, y, r, buildings) {
  let px = x;
  let py = y;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const cx = clamp(px, b.x, b.x + b.w);
    const cy = clamp(py, b.y, b.y + b.h);
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = r - d;
      px += (dx / d) * push;
      py += (dy / d) * push;
    } else {
      const left = px - b.x;
      const right = b.x + b.w - px;
      const top = py - b.y;
      const bottom = b.y + b.h - py;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = b.x - r;
      else if (m === right) px = b.x + b.w + r;
      else if (m === top) py = b.y - r;
      else py = b.y + b.h + r;
    }
  }
  return { x: px, y: py };
}

export function pointInBuilding(x, y, buildings) {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function randomRoadSpawn(random) {
  const vertical = random() < 0.5;
  const i = Math.floor(random() * BLOCKS);
  const along = 80 + random() * (SIZE - 160);
  const forward = random() < 0.5;
  const centre = i * PITCH + ROAD / 2;
  if (vertical) {
    return {
      x: forward ? centre + 20 : centre - 20,
      y: along,
      angle: forward ? -Math.PI / 2 : Math.PI / 2,
    };
  }
  return {
    x: along,
    y: forward ? centre + 20 : centre - 20,
    angle: forward ? 0 : Math.PI,
  };
}

export function randomSidewalkPoint(random) {
  const bx = Math.floor(random() * BLOCKS);
  const by = Math.floor(random() * BLOCKS);
  return perimeterPoint(random, bx, by, 8);
}

export function randomParkedSpot(random) {
  const vertical = random() < 0.5;
  const i = Math.floor(random() * BLOCKS);
  const along = 80 + random() * (SIZE - 160);
  const side = random() < 0.5 ? -30 : 30;
  const centre = i * PITCH + ROAD / 2;
  if (vertical) {
    return {
      x: centre + side,
      y: along,
      angle: side > 0 ? Math.PI / 2 : -Math.PI / 2,
    };
  }
  return {
    x: along,
    y: centre + side,
    angle: side > 0 ? 0 : Math.PI,
  };
}

export function clampToWorld(x, y, r) {
  return {
    x: clamp(x, r, SIZE - r),
    y: clamp(y, r, SEA_Y - 10 - r),
  };
}
