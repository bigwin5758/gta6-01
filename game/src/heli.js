// Police helicopter — spawns at wanted 4-5, circles the player from above
// with a spotlight; at wanted 5 it shoots (badly). Flies above buildings,
// never collides, despawns when the heat drops below 4.
import { HELI, WEAPON } from './config.js';

export function createHeli() {
  return null;
}

export function stepHeli(G, dt) {
  if (G.player.wanted < HELI.minWanted) {
    if (G.heli) G.heli = null;
    return;
  }
  if (!G.heli) {
    G.heli = {
      x: G.player.x + 400,
      y: G.player.y - 300,
      z: HELI.altitude,
      angle: 0,
      rotor: 0,
      shootCd: 3,
    };
    return;
  }
  const h = G.heli;
  h.rotor += dt * 25;
  // Circle the player.
  const orbitAngle = G.time * 0.35;
  const tx = G.player.x + Math.cos(orbitAngle) * HELI.orbitRadius;
  const ty = G.player.y + Math.sin(orbitAngle) * HELI.orbitRadius;
  const dx = tx - h.x;
  const dy = ty - h.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    const step = Math.min(d, HELI.speed * dt);
    h.x += (dx / d) * step;
    h.y += (dy / d) * step;
  }
  h.z = HELI.altitude;
  h.angle = Math.atan2(G.player.y - h.y, G.player.x - h.x);
  // Shoot at wanted 5.
  h.shootCd -= dt;
  if (G.player.wanted >= 5 && h.shootCd <= 0) {
    h.shootCd = HELI.shootCooldown;
    const a = Math.atan2(G.player.y - h.y, G.player.x - h.x) + (G.random() - 0.5) * HELI.shootSpread * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const spd = WEAPON.bulletSpeed * 0.9;
    G.bullets.push({
      x: h.x + ca * 30,
      y: h.y + sa * 30,
      vx: ca * spd,
      vy: sa * spd,
      life: HELI.shootRange / spd,
      damage: HELI.shootDamage,
      fromPlayer: false,
    });
    G.events.sounds.push('shot');
  }
}
