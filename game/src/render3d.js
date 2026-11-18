// Solmar City 3D renderer — Three.js, vendored locally, zero network.
// Sim coords are 2D (x, y). Mapping: threeX = x, threeZ = y,
// mesh.rotation.y = -simAngle. Ground is y=0. No shadows (swiftshader perf).
import * as THREE from 'three';
import { WORLD } from './config.js';

const SIZE = WORLD.size;
const ROOF_COLORS = [0xa86b45, 0x8f7f6a, 0xb56a5e];

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const geoCache = new Map();
const matCache = new Map();

function box(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
function cyl(rt, rb, h, seg) {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg || 10); geoCache.set(k, g); }
  return g;
}
function sph(r, w, h) {
  const k = `s${r}|${w}|${h}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, w || 10, h || 8); geoCache.set(k, g); }
  return g;
}
function lam(color) {
  const k = `m${color}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(k, m); }
  return m;
}
function basic(color, opts) {
  const k = `basic${color}|${opts ? JSON.stringify(opts) : ''}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...(opts || {}) }); matCache.set(k, m); }
  return m;
}

function windowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#b98a63';
  c.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = ((row * 4 + col) % 3) !== 0;
      c.fillStyle = lit ? '#ffe9a8' : '#3a4a5a';
      c.fillRect(10 + col * 30, 12 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A little humanoid figure. Returns { group, armL, armR, legL, legR }. */
function makeFigure(torsoColor, legColor, skinColor, scale) {
  const g = new THREE.Group();
  const legL = new THREE.Mesh(box(5, 16, 6), lam(legColor));
  legL.position.set(-4, 8, 0);
  const legR = new THREE.Mesh(box(5, 16, 6), lam(legColor));
  legR.position.set(4, 8, 0);
  const torso = new THREE.Mesh(box(16, 20, 10), lam(torsoColor));
  torso.position.set(0, 26, 0);
  const armL = new THREE.Mesh(box(5, 16, 5), lam(torsoColor));
  armL.position.set(-11, 26, 0);
  const armR = new THREE.Mesh(box(5, 16, 5), lam(torsoColor));
  armR.position.set(11, 26, 0);
  const head = new THREE.Mesh(sph(7, 10, 8), lam(skinColor));
  head.position.set(0, 44, 0);
  g.add(legL, legR, torso, armL, armR, head);
  g.scale.setScalar(scale || 1);
  return { group: g, armL, armR, legL, legR, head };
}

function swingWalk(fig, t, speed) {
  const amp = speed > 20 ? 0.55 : 0;
  const s = Math.sin(t * 10);
  fig.armL.rotation.x = s * amp;
  fig.armR.rotation.x = -s * amp;
  fig.legL.rotation.x = -s * amp;
  fig.legR.rotation.x = s * amp;
}

export function createRenderer(canvas, minimapCanvas) {
  let renderer = null;
  let scene = null;
  let camera = null;
  let built = false;
  let lastT = performance.now();
  // camYaw is an ABSOLUTE world angle: the direction the camera faces.
  // It is NOT player.angle + an offset — that relative form feeds back
  // (the player turns toward the move direction, the camera swings with
  // the player, the move direction changes) and the player spins whenever
  // the camera is orbited. Instead the camera sits at a fixed world yaw
  // and slowly auto-follows the player's heading (soft chase): on foot
  // it drifts gently, in a car it swings behind the car faster.
  // The player moves relative to camYaw, and camYaw only changes by
  // user orbit or the slow auto-follow — no feedback loop.
  let camYaw = -Math.PI / 2;
  let orbitCooldown = 0;
  const camPos = new THREE.Vector3(1540, 700, 400);
  const camLook = new THREE.Vector3(1540, 0, 1540);

  const carMeshes = new Map();
  const pedMeshes = new Map();
  const copMeshes = new Map();
  const bulletMeshes = new Map();
  const partMeshes = new Map();
  const pickupMeshes = new Map();
  let playerFig = null;
  let heliGroup = null;
  let heliSpot = null;
  let heliCone = null;
  let markerGroup = null;
  let markerRing = null;

  const mm = minimapCanvas ? minimapCanvas.getContext('2d') : null;

  function initGL() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      renderer = null;
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b5d6);
    scene.fog = new THREE.Fog(0x87b5d6, 900, 2600);
    camera = new THREE.PerspectiveCamera(62, 1, 1, 6000);
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
    sun.position.set(800, 1200, 400);
    scene.add(sun);
    return true;
  }

  function buildCity(city) {
    // Ground.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), lam(0x7fae5a));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(SIZE / 2, 0, SIZE / 2);
    scene.add(ground);

    // Roads.
    const roadMat = lam(0x4a4a52);
    const dashGeo = box(14, 1, 3);
    const dashMat = lam(0xe8d44d);
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(80, SIZE), roadMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(i * 440 + 40, 0.1, SIZE / 2);
      scene.add(v);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 80), roadMat);
      h.rotation.x = -Math.PI / 2;
      h.position.set(SIZE / 2, 0.1, i * 440 + 40);
      scene.add(h);
      // Center dashes along both directions.
      for (let d = 60; d < SIZE; d += 120) {
        const d1 = new THREE.Mesh(dashGeo, dashMat);
        d1.position.set(i * 440 + 40, 0.15, d);
        scene.add(d1);
        const d2 = new THREE.Mesh(dashGeo, dashMat);
        d2.rotation.y = Math.PI / 2;
        d2.position.set(d, 0.15, i * 440 + 40);
        scene.add(d2);
      }
    }

    // Sidewalks / parks per block.
    const walkMat = lam(0xb9b3a4);
    const parkMat = lam(0x6da34e);
    for (let by = 0; by < 7; by++) {
      for (let bx = 0; bx < 7; bx++) {
        const o = { x: bx * 440 + 80, y: by * 440 + 80 };
        if (o.y + 360 > 2920) continue;
        const isPark = city.parks.some((p) => p.x === o.x && p.y === o.y);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), isPark ? parkMat : walkMat);
        p.rotation.x = -Math.PI / 2;
        p.position.set(o.x + 180, 0.05, o.y + 180);
        scene.add(p);
      }
    }

    // Beach + sea.
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 80), lam(0xe8d29a));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(SIZE / 2, 0.06, 2960);
    scene.add(beach);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 80), lam(0x2fa8b8));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(SIZE / 2, 0.04, 3040);
    scene.add(sea);

    // Buildings with window texture + coloured roof.
    const wallTex = windowTexture();
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const roofMats = ROOF_COLORS.map((c) => lam(c));
    for (const b of city.buildings) {
      const mats = [wallMat, wallMat, roofMats[b.roof], roofMats[b.roof], wallMat, wallMat];
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.height, b.h), mats);
      m.position.set(b.x + b.w / 2, b.height / 2, b.y + b.h / 2);
      scene.add(m);
    }

    // Trees (cap 60).
    const trunkMat = lam(0x8a6a4a);
    const leafMat = lam(0x4e8a3a);
    const trees = city.trees.slice(0, 60);
    for (const t of trees) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(cyl(3, 4, 22, 8), trunkMat);
      trunk.position.y = 11;
      const leaf = new THREE.Mesh(sph(Math.max(8, t.r), 8, 6), leafMat);
      leaf.position.y = 26;
      g.add(trunk, leaf);
      g.position.set(t.x, 0, t.y);
      scene.add(g);
    }

    // Streetlights (cap 60).
    const poleMat = lam(0x2a2d38);
    const lampMat = basic(0xffe27a);
    let lights = 0;
    for (let i = 0; i < 7 && lights < 60; i++) {
      for (let j = 0; j < 7 && lights < 60; j++) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(cyl(1.5, 1.5, 60, 6), poleMat);
        pole.position.y = 30;
        const lamp = new THREE.Mesh(sph(4, 8, 6), lampMat);
        lamp.position.y = 61;
        g.add(pole, lamp);
        g.position.set(i * 440 + 40, 0, j * 440 + 40);
        scene.add(g);
        lights++;
      }
    }

    // Landmark beacons.
    const beaconColors = { garage: 0xffd94a, gunshop: 0xff5533, hospital: 0xffffff, police: 0x2b4acb, safehouse: 0x27ae60, drop: 0xffdd33, pier: 0x7fc4d4 };
    for (const [name, lm] of Object.entries(city.landmarks)) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(cyl(1, 1, 30, 6), poleMat);
      pole.position.y = 15;
      const top = new THREE.Mesh(box(10, 10, 10), lam(beaconColors[name] || 0xffffff));
      top.position.y = 34;
      g.add(pole, top);
      g.position.set(lm.x, 0, lm.y);
      scene.add(g);
    }

    // Marker ring + beam (hidden until a target exists).
    markerGroup = new THREE.Group();
    markerRing = new THREE.Mesh(new THREE.TorusGeometry(46, 4, 8, 32), basic(0xffdd33));
    markerRing.rotation.x = Math.PI / 2;
    markerRing.position.y = 3;
    const beam = new THREE.Mesh(cyl(6, 6, 300, 10), new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.22 }));
    beam.position.y = 150;
    markerGroup.add(markerRing, beam);
    markerGroup.visible = false;
    scene.add(markerGroup);

    // Player figure.
    playerFig = makeFigure(0xf2c94c, 0x2f7fe0, 0xe8b98a, 1);
    scene.add(playerFig.group);

    // Helicopter group (hidden until spawned).
    heliGroup = new THREE.Group();
    const hBody = new THREE.Mesh(box(60, 18, 26), lam(0x2b4acb));
    const hTail = new THREE.Mesh(box(50, 8, 8), lam(0x2b4acb));
    hTail.position.set(-50, 2, 0);
    const hRotor = new THREE.Mesh(box(120, 2, 6), lam(0x1a1a1a));
    hRotor.position.y = 14;
    heliGroup.add(hBody, hTail, hRotor);
    heliGroup.userData.rotor = hRotor;
    heliCone = new THREE.Mesh(new THREE.ConeGeometry(60, 260, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    heliCone.rotation.x = Math.PI;
    heliCone.position.y = -130;
    heliGroup.add(heliCone);
    heliSpot = new THREE.SpotLight(0xfff2b0, 2.5, 700, 0.35, 0.5, 0);
    heliSpot.position.set(0, -10, 0);
    heliGroup.add(heliSpot);
    heliGroup.add(heliSpot.target);
    heliGroup.visible = false;
    scene.add(heliGroup);
  }

  function makeCarMesh(car) {
    const g = new THREE.Group();
    const bodyMat = car.wrecked ? lam(0x333333) : lam(parseInt(car.color.slice(1), 16));
    const body = new THREE.Mesh(box(62, 14, 30), bodyMat);
    body.position.y = 10;
    const cabin = new THREE.Mesh(box(30, 10, 26), lam(0x222831));
    cabin.position.set(-4, 21, 0);
    g.add(body, cabin);
    const wheelGeo = cyl(7, 7, 5, 10);
    const wheelMat = lam(0x1a1a1a);
    for (const [wx, wz] of [[20, 14], [20, -14], [-20, 14], [-20, -14]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 7, wz);
      g.add(w);
    }
    if (car.kind === 'police') {
      const bar = new THREE.Mesh(box(16, 4, 8), lam(0x111111));
      bar.position.set(-4, 28, 0);
      g.add(bar);
      const lightL = new THREE.Mesh(box(7, 4, 8), basic(0xff2222));
      lightL.position.set(-4, 28, -4.5);
      const lightR = new THREE.Mesh(box(7, 4, 8), basic(0x2244ff));
      lightR.position.set(-4, 28, 4.5);
      g.add(lightL, lightR);
      g.userData.police = true;
      g.userData.lightL = lightL;
      g.userData.lightR = lightR;
    }
    if (car.color === '#f2c230' && car.kind === 'parked') {
      const sign = new THREE.Mesh(box(12, 5, 10), lam(0x111111));
      sign.position.set(-4, 29, 0);
      g.add(sign);
    }
    return g;
  }

  function syncCars(G) {
    const seen = new Set();
    for (const car of G.cars) {
      seen.add(car.id);
      let m = carMeshes.get(car.id);
      if (!m) {
        m = makeCarMesh(car);
        carMeshes.set(car.id, m);
        scene.add(m);
      }
      m.position.set(car.x, 0, car.y);
      m.rotation.y = -car.angle;
      if (car.wrecked) m.rotation.z = 0.25;
      else m.rotation.z = 0;
      if (m.userData.police) {
        const on = Math.sin(G.time * 10 + car.id) > 0;
        m.userData.lightL.material = on ? basic(0xff2222) : basic(0x551111);
        m.userData.lightR.material = on ? basic(0x111155) : basic(0x2244ff);
      }
    }
    for (const [id, m] of carMeshes) {
      if (!seen.has(id)) { scene.remove(m); carMeshes.delete(id); }
    }
  }

  function syncFigures(G) {
    // Player.
    const p = G.player;
    playerFig.group.visible = !p.inCar;
    if (p.inCar) {
      // Keep the figure glued to the car so it reappears in the right spot.
      playerFig.group.position.set(p.x, 0, p.y);
      playerFig.group.rotation.y = -p.angle;
    } else {
      playerFig.group.position.set(p.x, 0, p.y);
      playerFig.group.rotation.y = -p.angle;
      swingWalk(playerFig, G.time, p.speed);
    }
    // Peds.
    const seenP = new Set();
    G.peds.forEach((ped, i) => {
      seenP.add(i);
      let f = pedMeshes.get(i);
      if (!f) {
        f = makeFigure(parseInt(ped.color.slice(1), 16), 0x3a3a44, 0xe8b98a, 0.95);
        pedMeshes.set(i, f);
        scene.add(f.group);
      }
      f.group.position.set(ped.x, 0, ped.y);
      if (ped.state === 'dead') {
        f.group.rotation.set(0, -ped.angle, Math.PI / 2);
        f.group.position.y = 4;
      } else {
        f.group.rotation.set(0, -ped.angle, 0);
        f.group.position.y = 0;
        swingWalk(f, G.time + i, ped.speed);
      }
    });
    for (const [i, f] of pedMeshes) {
      if (!seenP.has(i)) { scene.remove(f.group); pedMeshes.delete(i); }
    }
    // Cops.
    const seenC = new Set();
    G.cops.forEach((cop, i) => {
      seenC.add(i);
      let f = copMeshes.get(i);
      if (!f) {
        f = makeFigure(0x2b4acb, 0x1a1a2e, 0xe8b98a, 1);
        const cap = new THREE.Mesh(cyl(7, 7, 4, 10), lam(0x1a1a2e));
        cap.position.y = 50;
        f.group.add(cap);
        copMeshes.set(i, f);
        scene.add(f.group);
      }
      f.group.position.set(cop.x, 0, cop.y);
      f.group.rotation.y = -cop.angle;
      swingWalk(f, G.time + i * 2, cop.speed);
    });
    for (const [i, f] of copMeshes) {
      if (!seenC.has(i)) { scene.remove(f.group); copMeshes.delete(i); }
    }
  }

  function syncBullets(G) {
    const seen = new Set();
    G.bullets.forEach((b, i) => {
      seen.add(i);
      let m = bulletMeshes.get(i);
      if (!m) {
        m = new THREE.Mesh(box(14, 2, 2), basic(0xffe27a));
        bulletMeshes.set(i, m);
        scene.add(m);
      }
      m.position.set(b.x, 12, b.y);
      m.rotation.y = -Math.atan2(b.vy, b.vx);
    });
    for (const [i, m] of bulletMeshes) {
      if (!seen.has(i)) { scene.remove(m); bulletMeshes.delete(i); }
    }
  }

  function syncParts(G) {
    const seen = new Set();
    G.parts.forEach((pt, i) => {
      seen.add(i);
      let m = partMeshes.get(i);
      if (!m) {
        m = new THREE.Mesh(box(1, 1, 1), lam(parseInt(String(pt.color).slice(1), 16) || 0xffffff));
        partMeshes.set(i, m);
        scene.add(m);
      }
      const s = Math.max(0.2, (pt.size || 3) * Math.max(0.05, pt.life / (pt.maxLife || 0.5)));
      m.scale.setScalar(s);
      m.position.set(pt.x, 8, pt.y);
    });
    for (const [i, m] of partMeshes) {
      if (!seen.has(i)) { scene.remove(m); partMeshes.delete(i); }
    }
  }

  function syncPickups(G) {
    const seen = new Set();
    G.pickups.forEach((pk, i) => {
      seen.add(i);
      let m = pickupMeshes.get(i);
      if (!m) {
        const g = new THREE.Group();
        if (pk.kind === 'cash') {
          g.add(new THREE.Mesh(box(18, 6, 12), lam(0x27ae60)));
        } else if (pk.kind === 'ammo') {
          g.add(new THREE.Mesh(box(12, 12, 12), lam(0xf2c94c)));
        } else {
          const w = new THREE.Mesh(box(14, 14, 4), lam(0xffffff));
          const c1 = new THREE.Mesh(box(10, 3, 5), lam(0xe5534b));
          const c2 = new THREE.Mesh(box(3, 10, 5), lam(0xe5534b));
          g.add(w, c1, c2);
        }
        pickupMeshes.set(i, g);
        scene.add(g);
        m = g;
      }
      m.position.set(pk.x, 14 + Math.sin(G.time * 3 + pk.phase) * 4, pk.y);
      m.rotation.y = G.time * 2;
    });
    for (const [i, m] of pickupMeshes) {
      if (!seen.has(i)) { scene.remove(m); pickupMeshes.delete(i); }
    }
  }

  function syncHeli(G) {
    if (!G.heli) {
      heliGroup.visible = false;
      return;
    }
    heliGroup.visible = true;
    heliGroup.position.set(G.heli.x, G.heli.z, G.heli.y);
    heliGroup.rotation.y = -G.heli.angle;
    heliGroup.userData.rotor.rotation.y = G.heli.rotor;
    // Spotlight target = player.
    _v1.set(G.player.x, 0, G.player.y);
    heliSpot.target.position.copy(_v1);
    heliSpot.target.updateMatrixWorld();
  }

  function syncMarker(G) {
    if (!G.marker) {
      markerGroup.visible = false;
      return;
    }
    markerGroup.visible = true;
    markerGroup.position.set(G.marker.x, 0, G.marker.y);
    const s = 1 + 0.12 * Math.sin(G.time * 4);
    markerRing.scale.setScalar(s);
  }

  function updateCamera(G, screen, dt) {
    if (screen === 'title') {
      const a = G.time * 0.05;
      _v1.set(1540 + Math.cos(a) * 1200, 700, 1540 + Math.sin(a) * 1200);
      _v2.set(1540, 0, 1540);
    } else {
      const p = G.player;
      // Soft chase: slowly swing the absolute camYaw behind the player's
      // heading (faster in a car) — but ONLY while the player is actually
      // moving, so a parked camera never drifts back after the user
      // orbits it to look around. Paused briefly after a user orbit so
      // the camera never fights the player's drag.
      if (orbitCooldown > 0) {
        orbitCooldown -= dt;
      } else if (p.speed > 30) {
        const desired = p.inCar ? p.inCar.angle : p.angle;
        let diff = desired - camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const rate = p.inCar ? 2.5 : 0.8;
        camYaw += diff * Math.min(1, rate * dt);
      }
      const fx = p.x;
      const fz = p.y;
      const yaw = camYaw + Math.PI;
      const dist = p.inCar ? 330 : 250;
      const height = p.inCar ? 165 : 140;
      _v1.set(fx + Math.cos(yaw) * dist, height, fz + Math.sin(yaw) * dist);
      _v1.x = Math.max(-200, Math.min(3280, _v1.x));
      _v1.z = Math.max(-200, Math.min(3280, _v1.z));
      _v1.y = Math.max(40, _v1.y);
      _v2.set(fx - Math.cos(yaw) * 40, 26, fz - Math.sin(yaw) * 40);
    }
    const k = 1 - Math.exp(-5 * dt);
    const k2 = 1 - Math.exp(-8 * dt);
    camPos.lerp(_v1, k);
    camLook.lerp(_v2, k2);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  function drawMinimap(G, marker) {
    if (!mm) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const s = w / SIZE;
    mm.fillStyle = '#20242e';
    mm.fillRect(0, 0, w, h);
    mm.fillStyle = '#2fa8b8';
    mm.fillRect(0, 3000 * s, w, 80 * s);
    mm.fillStyle = '#e8d29a';
    mm.fillRect(0, 2920 * s, w, 80 * s);
    mm.fillStyle = '#4a4a52';
    for (let i = 0; i < 7; i++) {
      mm.fillRect(i * 440 * s, 0, 80 * s, h);
      mm.fillRect(0, i * 440 * s, w, 80 * s);
    }
    mm.fillStyle = '#6a5a4a';
    for (const b of G.city.buildings) {
      mm.fillRect(b.x * s, b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
    }
    mm.fillStyle = '#6da34e';
    for (const p of G.city.parks) {
      mm.fillRect(p.x * s, p.y * s, p.w * s, p.h * s);
    }
    if (marker) {
      const r = 5 + Math.sin(G.time * 4) * 1.5;
      mm.fillStyle = '#ffdd33';
      mm.beginPath();
      mm.arc(marker.x * s, marker.y * s, r, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#ff5533';
      mm.lineWidth = 2;
      mm.stroke();
    }
    mm.fillStyle = '#2b4acb';
    for (const car of G.cars) {
      if (car.kind !== 'police') continue;
      mm.beginPath();
      mm.arc(car.x * s, car.y * s, 3, 0, Math.PI * 2);
      mm.fill();
    }
    if (G.heli) {
      mm.fillStyle = '#ffffff';
      mm.beginPath();
      mm.arc(G.heli.x * s, G.heli.y * s, 3.5, 0, Math.PI * 2);
      mm.fill();
    }
    // Player arrow.
    const p = G.player;
    mm.save();
    mm.translate(p.x * s, p.y * s);
    mm.rotate(p.angle);
    mm.fillStyle = '#ffd94a';
    mm.beginPath();
    mm.moveTo(7, 0);
    mm.lineTo(-5, -5);
    mm.lineTo(-5, 5);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  function resize() {
    if (!renderer || !camera) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  // Raycast from a screen point (CSS pixels, relative to the canvas) onto the
  // ground plane y=0. Returns {x, y} in sim coords, or null if it misses.
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function screenToGround(sx, sy) {
    if (!camera) return null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    _ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const hit = _ray.ray.intersectPlane(_plane, _v3);
    if (!hit) return null;
    return { x: _v3.x, y: _v3.z };
  }

  // Snap the camera instantly to its chase position (no lerp) and point
  // camYaw at the player's heading. Used by the ?shot= staging so the
  // screenshot is taken from the settled chase angle, not mid-lerp from
  // the title orbit (which reads as a steep top-down view).
  function snapCamera(G, screen) {
    if (screen === 'title') return;
    const p = G.player;
    camYaw = p.inCar ? p.inCar.angle : p.angle;
    orbitCooldown = 0;
    const yaw = camYaw + Math.PI;
    const dist = p.inCar ? 330 : 250;
    const height = p.inCar ? 165 : 140;
    camPos.set(p.x + Math.cos(yaw) * dist, height, p.y + Math.sin(yaw) * dist);
    camPos.x = Math.max(-200, Math.min(3280, camPos.x));
    camPos.z = Math.max(-200, Math.min(3280, camPos.z));
    camPos.y = Math.max(40, camPos.y);
    camLook.set(p.x - Math.cos(yaw) * 40, 26, p.y - Math.sin(yaw) * 40);
    // (The THREE camera itself is created lazily by draw(); it copies
    // camPos/camLook on the next draw, so don't touch it here.)
  }

  function draw(G, screen) {
    if (!renderer) {
      if (!initGL()) return;
      resize();
    }
    if (!built) {
      buildCity(G.city);
      built = true;
    }
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    syncCars(G);
    syncFigures(G);
    syncBullets(G);
    syncParts(G);
    syncPickups(G);
    syncHeli(G);
    syncMarker(G);
    updateCamera(G, screen, dt);
    renderer.render(scene, camera);
  }

  return {
    draw,
    drawMinimap,
    resize,
    screenToGround,
    snapCamera,
    addCamYaw(d) { camYaw += d; orbitCooldown = 1.0; },
    getCamYaw() { return camYaw; },
    // The camera's absolute forward angle (sim coords). Movement and aim
    // are relative to this; it only changes by user orbit or the slow
    // auto-follow in updateCamera, so it never feeds back into the
    // player's turning.
    getCamForward() { return camYaw; },
  };
}
