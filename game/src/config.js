// Solmar City 3D — tuning numbers and colours in one place.
// The SIMULATION still runs on the 2D grid from the 2D version (x, y in
// world units, 3080x3080 city). The 3D renderer maps sim coords to Three.js
// as: threeX = x, threeZ = y, mesh.rotation.y = -angle.
//   pitch 440 = one road (80 wide) + one block (360 wide). 7 roads and
//   7 blocks per axis. The south edge (y near 3080) is the beach and sea.

export const WORLD = {
  size: 3080,
  pitch: 440,
  road: 80,
  blocks: 7,
  beachY: 2920,
  seaY: 3000,
};

export const STEP = 1 / 60;

/** Player on foot. */
export const PLAYER = {
  radius: 14,
  walkSpeed: 250,
  runSpeed: 330,
  health: 100,
  regenDelay: 6,
  regenRate: 4,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.35,
};

/** Cars: length along their heading, width across it. */
export const CAR = {
  length: 62,
  width: 30,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 180,
  steerRate: 2.6,
  crashSpeed: 300,
  crashDamage: 22,
  enterRange: 70,
};

/** Traffic: how many cars and pedestrians the city holds. */
export const TRAFFIC = {
  cars: 26,
  peds: 30,
  carSpeed: 170,
  pedSpeed: 55,
};

/** Police. */
export const POLICE = {
  carsPerStar: 2,
  maxCars: 8,
  footPerStar: 1,
  maxFoot: 4,
  carSpeed: 560,
  footSpeed: 265,
  arrestRange: 26,
  arrestPlayerSpeed: 120,
  shootRange: 320,
  shootCooldown: 1.1,
  shootDamage: 6,
  shootSpread: 0.22,
};

/** Police helicopter (wanted 4-5). */
export const HELI = {
  minWanted: 4,
  altitude: 240,
  speed: 300,
  // Horizontal distance it keeps from the player while circling.
  orbitRadius: 170,
  // At wanted 5 it shoots (badly) every few seconds.
  shootCooldown: 2.2,
  shootDamage: 8,
  shootRange: 520,
  shootSpread: 0.3,
};

/** Wanted level. */
export const WANTED = {
  max: 5,
  decayDelay: 18,
  decayInterval: 8,
  stealCar: 1,
  hitPed: 1,
  killPed: 1,
  shoot: 1,
  killCop: 2,
  ramCop: 1,
};

/** Combat — legacy pistol defaults (kept so old call sites still work). */
export const WEAPON = {
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
  bulletSpeed: 900,
  startAmmo: 24,
  maxAmmo: 120,
  ammoPrice: 150,
  ammoPack: 24,
};

/** Four weapons. ammo is ONE shared pool (WEAPON.startAmmo / maxAmmo).
 *  damage = per pellet, pellets = bullets per shot, spread = radians,
 *  auto = hold to keep firing, cooldown = seconds between shots. */
export const WEAPONS = {
  fists: { name: 'Fists', damage: 0, cooldown: 0, range: 0, pellets: 0, spread: 0, auto: false },
  pistol: { name: 'Pistol', damage: 34, cooldown: 0.28, range: 420, pellets: 1, spread: 0.01, auto: false },
  smg: { name: 'SMG', damage: 16, cooldown: 0.09, range: 360, pellets: 1, spread: 0.06, auto: true },
  shotgun: { name: 'Shotgun', damage: 18, cooldown: 0.9, range: 260, pellets: 5, spread: 0.16, auto: false },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

/** Garage upgrades: 3 levels each. Prices are per level (level 1, 2, 3). */
export const UPGRADES = {
  speed: { name: 'Engine', desc: '+12% top speed / level', prices: [400, 800, 1400], perLevel: 0.12 },
  armor: { name: 'Armor', desc: '-25% crash & bullet damage to car / level', prices: [350, 700, 1200], perLevel: 0.25 },
  handling: { name: 'Handling', desc: '+15% steering / level', prices: [300, 600, 1000], perLevel: 0.15 },
};
export const UPGRADE_KEYS = ['speed', 'armor', 'handling'];

/** Radio stations (WebAudio synth loops). */
export const RADIO = {
  stations: [
    { id: 'solmar', name: 'SOLMAR FM', desc: 'sunset synth', bpm: 96, wave: 'sawtooth', root: 110 },
    { id: 'rumba', name: 'RUMBA 88', desc: 'island groove', bpm: 120, wave: 'square', root: 130 },
    { id: 'night', name: 'NIGHT DRIVE', desc: 'midnight bass', bpm: 80, wave: 'triangle', root: 82 },
  ],
};

/** Money. */
export const MONEY = {
  mission1: 500,
  mission2: 1200,
  mission3: 1500,
  mission4: 1800,
  mission5: 2500,
  mission6: 2200,
  mission7: 2600,
  mission8: 5000,
  sideJob: 300,
  bustLoss: 300,
  wasteLoss: 400,
  medkitPrice: 100,
  medkitHeal: 50,
};

/** Missions: ids in story order (8 story jobs). */
export const MISSIONS = [
  { id: 'wheels', name: 'Wheels', pay: MONEY.mission1 },
  { id: 'packages', name: 'Package Run', pay: MONEY.mission2 },
  { id: 'race', name: 'Coastal Rush', pay: MONEY.mission3 },
  { id: 'rival', name: 'Rival Turf', pay: MONEY.mission4 },
  { id: 'heat', name: 'Heat', pay: MONEY.mission5 },
  { id: 'escort', name: 'Family Ride', pay: MONEY.mission6 },
  { id: 'sabotage', name: 'Quiet Work', pay: MONEY.mission7 },
  { id: 'final', name: 'The Big One', pay: MONEY.mission8 },
];

export const SAVE_KEY = 'solmar.save.v1';

/** Sun-soaked palette. */
export const PALETTE = {
  grass: '#7fae5a',
  park: '#6da34e',
  sand: '#e8d29a',
  sea: '#2fa8b8',
  seaDeep: '#1e7f9e',
  road: '#4a4a52',
  roadEdge: '#33333a',
  lane: '#e8d44d',
  sidewalk: '#b9b3a4',
  building: '#c98f5f',
  buildingRoof: '#a86b45',
  buildingRoof2: '#8f7f6a',
  buildingRoof3: '#b56a5e',
  glass: '#7fc4d4',
  wall: '#8a6a4a',
  player: '#2f7fe0',
  playerShirt: '#f2c94c',
  ped: '#e07a5f',
  cop: '#2b4acb',
  copCar: '#1f3a93',
  taxi: '#f2c230',
  carColors: ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#e74c3c', '#2c3e50'],
  health: '#e5534b',
  money: '#f2c94c',
  star: '#ffd94a',
  text: '#f4f1e6',
  muted: '#b8b2a0',
  panel: 'rgba(20, 22, 30, 0.78)',
  marker: '#ffdd33',
  markerRing: '#ff5533',
  blood: '#a02020',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
