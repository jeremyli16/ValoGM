# ValoGM

A Valorant team management simulator. Build a franchise in one of four regional leagues, recruit players, manage your roster, and compete through a double-elimination playoff bracket.

**[Play it live →](https://valo-gm.vercel.app)**

---

## Tech Stack

- **Frontend:** React + TypeScript (Vite)
- **Styling:** Global CSS with custom design tokens
- **Persistence:** IndexedDB (offline, browser-local saves)
- **Deployment:** Vercel

---

## Features

### Screens

**Dashboard** — Win/loss record, standings, budget/payroll summary, upcoming match preview, notification inbox.

**Roster** — Starter/bench tabs, player detail panel with stats and role ratings, import rule enforcement, auto-fill from bench/free agents.

**Transfer Market** — Browse free agents and contracted players; hire coaches; send transfer offers with AI acceptance modelling and counter-offers.

**Schedule** — Full season match list with expandable per-player stats.

**Standings** — All four regions with group standings; your team highlighted.

**Playoffs** — Projected bracket during regular season, live bracket during playoffs. Full double-elimination layout with structured weekly schedule.

**Match Day** — Per-series detail: map scores, round timeline (attack/defense coloring, OT groups), full player stat tables.

**Stats** — League-wide leaderboard filterable by season, split, phase, role, team, and region.

**Finances** — Contract list, renewal offers, coach contracts, payroll vs. budget summary.

**History** — Flat per-season table of Champions/Masters results and regional split winners; per-split standings; season awards.

**International Tournaments** — Full bracket viewer for Masters (Swiss play-in + double-elim) and Champions (group stage + double-elim).

---

### Simulation Engine

- Round-by-round economy (buy decisions, pistol/eco/bonus cadence, kill/plant income)
- Player combat power from Aim, Game Sense, and Clutch stats with role and equipment modifiers
- Role-differentiated kill/death/assist rates matching real VLR.gg pro-play profiles
- Team synergy bonus and pairwise chemistry modifier
- Map-specific attack/defense bias from VLR.gg data; real map veto (bo1/bo3/bo5)
- Clutch mechanic (1v2–1v5 checks), weapon saves, overtime (MR2 per set)
- VLR Rating 2.0 formula derived from ML feature importances against real VLR.gg data
- 12-map universe with 7-map active rotation; per-split map pool rotations
- Player archetypes, hidden true ratings, aging/development, and morale ticks
- Pairwise chemistry growth; passive scouting confidence ticks
- Coach Tactics/Scouting/Morale Boost ratings affecting match and roster outcomes
- Free agency window and full transfer system with buyout fees and AI acceptance model
- All 4 regions fully simulated each split with background auto-simulation
- International tournament qualification via Champions Points
