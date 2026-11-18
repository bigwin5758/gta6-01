// Solmar City 3D — 8 story jobs for Joey "Jinx" Calloway and fixer Mama Rosa.
// Same state machine pattern as the 2D version: each mission has a stage,
// an objective, a target, and an update function. Side fares continue after
// the story is done.
import { MISSIONS, MONEY, PALETTE } from './config.js';
import { addWanted } from './actors.js';

const STORY_LEN = 8;
const SIDE_LANDMARKS = ['garage', 'gunshop', 'hospital', 'police', 'park', 'pier', 'drop'];

const DEFS = [
  { id: 'wheels', name: 'Wheels', pay: 500, objective: 'Steal a car — walk up to a parked car and press E', target: null, stage: 'steal', packages: [], collected: 0, timer: 0 },
  { id: 'packages', name: 'Package Run', pay: 1200, objective: 'Collect the 3 packages', target: null, stage: 'collect', packages: [], collected: 0, timer: 0 },
  { id: 'race', name: 'Coastal Rush', pay: 1500, objective: 'Race the checkpoints — 90 seconds', target: null, stage: 'race', packages: [], collected: 0, timer: 90 },
  { id: 'rival', name: 'Rival Turf', pay: 1800, objective: 'Grab the package from the rival block', target: null, stage: 'grab', packages: [], collected: 0, timer: 0 },
  { id: 'heat', name: 'Heat', pay: 2500, objective: 'The job went loud — lose the heat, then get to the safehouse', target: null, stage: 'lose', packages: [], collected: 0, timer: 0 },
  { id: 'escort', name: 'Family Ride', pay: 2200, objective: "Pick up Rosa's niece at the park", target: null, stage: 'pickup', packages: [], collected: 0, timer: 0 },
  { id: 'sabotage', name: 'Quiet Work', pay: 2600, objective: 'Sabotage the two points — stand in each marker for 3 seconds', target: null, stage: 'sabotage', packages: [], collected: 0, timer: 0 },
  { id: 'final', name: 'The Big One', pay: 5000, objective: 'Grab the money at the drop point', target: null, stage: 'grab', packages: [], collected: 0, timer: 0 },
];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function near(a, b, r) {
  return b ? dist(a, b) <= r : false;
}

function rnd(G) {
  const r = typeof G.random === 'function' ? G.random() : 0.5;
  return r >= 1 ? 0.999999 : r < 0 ? 0 : r;
}

function nearestPackage(G, mission) {
  let best = null;
  let bestD = Infinity;
  for (const p of mission.packages) {
    if (p.taken) continue;
    const d = dist(G.player, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function pickLandmark(G) {
  const L = G.city.landmarks;
  const names = SIDE_LANDMARKS.filter((n) => L[n]);
  if (!names.length) return null;
  let closest = null;
  let bestD = Infinity;
  for (const n of names) {
    const d = dist(G.player, L[n]);
    if (d < bestD) {
      bestD = d;
      closest = n;
    }
  }
  const pool = names.filter((n) => n !== closest);
  const list = pool.length ? pool : names;
  const pick = list[Math.floor(rnd(G) * list.length) % list.length];
  return L[pick];
}

function startMission(G, M, index) {
  const def = DEFS[index];
  const mission = { ...def, packages: [], collected: 0, target: null, timer: def.timer || 0 };
  const L = G.city.landmarks;
  if (mission.id === 'packages') {
    mission.packages = [
      { x: L.park.x + 60, y: L.park.y, taken: false },
      { x: L.pier.x - 60, y: L.pier.y, taken: false },
      { x: L.hospital.x, y: L.hospital.y + 60, taken: false },
    ];
    mission.target = nearestPackage(G, mission);
  } else if (mission.id === 'race') {
    mission.packages = [
      { x: L.garage.x, y: L.garage.y, taken: false },
      { x: L.park.x, y: L.park.y, taken: false },
      { x: L.pier.x, y: L.pier.y, taken: false },
      { x: L.drop.x, y: L.drop.y, taken: false },
    ];
    mission.target = mission.packages[0];
    mission.timer = 90;
  } else if (mission.id === 'rival') {
    mission.target = L.police;
  } else if (mission.id === 'heat') {
    addWanted(G, 3, 'heat1');
    addWanted(G, 3, 'heat2');
    addWanted(G, 3, 'heat3');
    mission.objective = 'Lose the heat, then reach the safehouse';
    mission.target = L.safehouse;
  } else if (mission.id === 'escort') {
    mission.target = L.park;
  } else if (mission.id === 'sabotage') {
    mission.packages = [
      { x: L.gunshop.x, y: L.gunshop.y, taken: false, hold: 0 },
      { x: L.hospital.x, y: L.hospital.y, taken: false, hold: 0 },
    ];
    mission.target = mission.packages[0];
  } else if (mission.id === 'final') {
    mission.target = L.drop;
  }
  M.current = mission;
  M.banner = { title: mission.name, sub: mission.objective, color: PALETTE && PALETTE.accent };
  return mission;
}

function completeMission(G, M, mission) {
  G.player.money += mission.pay;
  M.done.push(mission.id);
  G.events.sounds.push('jingle');
  M.index += 1;
  if (M.index < STORY_LEN) {
    startMission(G, M, M.index);
    M.pendingStart = true;
  } else {
    M.stage = 'done';
    M.current = null;
    M.sideJobTimer = 8;
  }
  return { type: 'completed', mission };
}

function failMission(G, M, mission) {
  startMission(G, M, M.index);
  M.pendingStart = true;
  return { type: 'failed', mission };
}

function updateWheels(G, M, mission) {
  if (mission.stage === 'steal') {
    if (G.player.inCar) {
      mission.stage = 'drive';
      mission.objective = 'Drive to the garage';
      mission.target = G.city.landmarks.garage;
      return { type: 'started', mission };
    }
    return null;
  }
  if (mission.stage === 'drive' && G.player.inCar && near(G.player, G.city.landmarks.garage, 100)) {
    return completeMission(G, M, mission);
  }
  return null;
}

function updatePackages(G, M, mission) {
  if (mission.stage === 'collect') {
    for (const p of mission.packages) {
      if (p.taken) continue;
      if (near(G.player, p, 70)) {
        p.taken = true;
        mission.collected += 1;
        G.events.sounds.push('pickup');
        if (mission.collected >= 3) {
          mission.stage = 'deliver';
          mission.objective = 'Deliver the packages to the drop point';
          mission.target = G.city.landmarks.drop;
        } else {
          mission.target = nearestPackage(G, mission);
        }
        return null;
      }
    }
    return null;
  }
  if (mission.stage === 'deliver' && near(G.player, G.city.landmarks.drop, 100)) {
    return completeMission(G, M, mission);
  }
  return null;
}

function updateRace(G, M, mission, dt) {
  mission.timer -= dt;
  if (mission.timer <= 0) return failMission(G, M, mission);
  const next = mission.packages.find((p) => !p.taken);
  if (!next) return completeMission(G, M, mission);
  mission.target = next;
  mission.objective = `Checkpoint ${mission.collected}/4 — ${Math.ceil(mission.timer)}s left`;
  if (near(G.player, next, 90)) {
    next.taken = true;
    mission.collected += 1;
    G.events.sounds.push('pickup');
    if (mission.collected >= 4) return completeMission(G, M, mission);
  }
  return null;
}

function updateRival(G, M, mission) {
  if (mission.stage === 'grab') {
    if (near(G.player, G.city.landmarks.police, 90)) {
      addWanted(G, 2, 'rival');
      mission.stage = 'deliver';
      mission.objective = 'Deliver the package to the drop point';
      mission.target = G.city.landmarks.drop;
      G.events.sounds.push('pickup');
    }
    return null;
  }
  if (mission.stage === 'deliver' && near(G.player, G.city.landmarks.drop, 100)) {
    return completeMission(G, M, mission);
  }
  return null;
}

function updateHeat(G, M, mission) {
  mission.target = G.city.landmarks.safehouse;
  if (G.player.wanted === 0 && near(G.player, G.city.landmarks.safehouse, 110)) {
    return completeMission(G, M, mission);
  }
  return null;
}

function updateEscort(G, M, mission) {
  if (mission.stage === 'pickup') {
    if (near(G.player, G.city.landmarks.park, 90)) {
      mission.stage = 'ride';
      mission.objective = 'Drive her to the pier — keep the car alive';
      mission.target = G.city.landmarks.pier;
      addWanted(G, 2, 'escort');
      G.events.sounds.push('pickup');
    }
    return null;
  }
  if (mission.stage === 'ride') {
    if (G.player.inCar && G.player.inCar.hp < 25) return failMission(G, M, mission);
    if (near(G.player, G.city.landmarks.pier, 110)) return completeMission(G, M, mission);
  }
  return null;
}

function updateSabotage(G, M, mission, dt) {
  if (mission.stage === 'sabotage') {
    const next = mission.packages.find((p) => !p.taken);
    if (!next) {
      mission.stage = 'return';
      mission.objective = 'Get back to the safehouse';
      mission.target = G.city.landmarks.safehouse;
      return null;
    }
    mission.target = next;
    if (near(G.player, next, 80)) {
      next.hold += dt;
      if (next.hold >= 3) {
        next.taken = true;
        G.events.sounds.push('pickup');
        const rest = mission.packages.find((p) => !p.taken);
        if (!rest) {
          mission.stage = 'return';
          mission.objective = 'Get back to the safehouse';
          mission.target = G.city.landmarks.safehouse;
        }
      }
    } else {
      next.hold = 0;
    }
    return null;
  }
  if (mission.stage === 'return' && near(G.player, G.city.landmarks.safehouse, 110)) {
    return completeMission(G, M, mission);
  }
  return null;
}

function updateFinal(G, M, mission) {
  if (mission.stage === 'grab') {
    if (!G.player.inCar && near(G.player, G.city.landmarks.drop, 90)) {
      addWanted(G, 4, 'final');
      mission.stage = 'deliver';
      mission.objective = 'The money is yours — lose the heat and reach the safehouse';
      mission.target = G.city.landmarks.safehouse;
      G.events.sounds.push('pickup');
    }
    return null;
  }
  if (mission.stage === 'deliver' && G.player.wanted === 0 && near(G.player, G.city.landmarks.safehouse, 110)) {
    return completeMission(G, M, mission);
  }
  return null;
}

function tickSideJobs(G, M, dt) {
  if (M.sideJob) {
    if (G.player.inCar && near(G.player, M.sideJob.target, 100)) {
      G.player.money += MONEY.sideJob;
      G.events.sounds.push('jingle');
      M.sideJob = null;
      M.sideJobTimer = 10;
      return { type: 'completed', mission: { id: 'fare', name: 'Fare', pay: MONEY.sideJob } };
    }
    return null;
  }
  M.sideJobTimer -= dt;
  if (M.sideJobTimer > 0) return null;
  const target = pickLandmark(G);
  if (!target) return null;
  M.sideJob = { name: 'Fare', pay: MONEY.sideJob, target, objective: 'Drive a fare to the marker' };
  return { type: 'sidejob', job: M.sideJob };
}

export function createMissions() {
  return {
    index: 0,
    stage: 'idle',
    current: null,
    done: [],
    sideJob: null,
    sideJobTimer: 0,
    banner: null,
    pendingStart: false,
  };
}

export function startMissions(G, M) {
  M.index = 0;
  M.stage = 'active';
  return startMission(G, M, 0);
}

export function updateMissions(G, M, dt) {
  if (M.pendingStart) {
    M.pendingStart = false;
    if (M.current) return { type: 'started', mission: M.current };
  }
  if (M.stage === 'idle') return null;
  if (!M.current) {
    if (M.stage === 'done') return tickSideJobs(G, M, dt);
    return null;
  }
  const mission = M.current;
  if (mission.id === 'wheels') return updateWheels(G, M, mission);
  if (mission.id === 'packages') return updatePackages(G, M, mission);
  if (mission.id === 'race') return updateRace(G, M, mission, dt);
  if (mission.id === 'rival') return updateRival(G, M, mission);
  if (mission.id === 'heat') return updateHeat(G, M, mission);
  if (mission.id === 'escort') return updateEscort(G, M, mission);
  if (mission.id === 'sabotage') return updateSabotage(G, M, mission, dt);
  if (mission.id === 'final') return updateFinal(G, M, mission);
  return null;
}

export function missionTarget(G, M) {
  if (M.sideJob) return M.sideJob.target;
  if (M.current) {
    if (M.current.id === 'wheels' && M.current.stage === 'steal') return null;
    return M.current.target;
  }
  return null;
}

export function missionObjective(M) {
  if (M.stage === 'idle') return 'Talk to Mama Rosa — press Enter to start';
  if (M.sideJob) return M.sideJob.objective;
  if (M.current) return M.current.objective;
  if (M.stage === 'done') return 'Free roam — cause trouble or take a fare';
  return 'Talk to Mama Rosa — press Enter to start';
}
