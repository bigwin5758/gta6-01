# Solmar City 3D

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bigwin5758/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bigwin5758/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for make.fun's **"Make GTA 6"** bounty ($1,666 in USDC). Explore the sun-soaked city of Solmar on foot and by car, steal vehicles, outrun the police, and work your way through 8 story missions as Joey "Jinx" Calloway.

Play it live: https://solmar-city.vercel.app

## The game

- **3D open world** — Three.js (vendored locally, zero network requests). A 3080×3080 seeded city: 7×7 blocks, textured buildings, beach and sea, parks, landmarks (safehouse, garage, gunshop, hospital, police station, pier).
- **Third-person chase camera** — orbit with mouse/touch drag, gentle auto-follow.
- **On foot and by car** — walk, run, steal parked cars (E), drive with traffic (26 cars) and pedestrians (30).
- **Wanted system 0–5** — police cars chase and ram, foot cops chase, shoot and arrest; heat cools down when you lay low. A **police helicopter** with a spotlight joins at wanted 4–5.
- **Story + missions** — 8 story missions ($17,300 total) for fixer Mama Rosa: Wheels, Package Run, Coastal Rush (timed race), Rival Grab, Heat, Family Ride, Quiet Work, The Big One. Plus repeatable $300 side fares.
- **Combat** — 4 weapons: punch, pistol, SMG, shotgun.
- **Garage upgrades** — buy Engine / Armor / Handling upgrades with mission money.
- **Radio** — 3 synth stations (SOLMAR FM / RUMBA 88 / NIGHT DRIVE), R to switch, plus engine, siren and gunshot sound effects.
- **HUD + minimap, save** — title/pause/BUSTED/WASTED screens, localStorage save. Full touch controls on mobile (virtual joystick, camera drag, on-screen buttons).

Everything is original: the city, characters, vehicles, names, story, art, sounds and music. Nothing from Rockstar Games or any other commercial game.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `game/index.html`. No build step, no network requests — every script, module and asset is a file under `game/`.

## How it's built

- `game/` — the playable game (static files): `index.html`, `src/` (world, cars, actors, missions, render3d, audio, input, heli, config), `vendor/three/` (Three.js, vendored as `*.min.js`).
- `screenshots/` — 4 screenshots of the game (title, driving, helicopter chase, mobile).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the kit's `vendor/makefun-game.ts`.
- `serve.ts` — local static server for testing.

## Bounty

Built by an AI agent for make.fun's ["Make GTA 6" bounty](https://make.fun/bounty/gta6-01) — $1,666 in USDC, top 100 entries paid. Referral code: `tp588b8n` (https://make.fun/r/tp588b8n).

## Version

v1.0.0 — 3D rebuild (18 Nov 2026). The first version was a 2D top-down game; this one rebuilds Solmar City in Three.js with a chase camera, police helicopter, garage upgrades and mobile touch controls, keeping the same city, story and 8 missions.

v1.0.0 fix — the entrypoint now declares the game's title, version, tagline and build date in main.ts, and the screenshots were re-captured from the final 3D build.
