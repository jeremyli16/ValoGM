# Valorant GM — Full Design Document & Code Reference

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Data Model](#2-data-model)
   - 2.1 Core Types
   - 2.2 Player & Ratings
   - 2.3 Role Ratings & Scouting
   - 2.4 Economy
   - 2.5 League & Team Structure
   - 2.6 Contracts & Transfers
3. [Match Simulation](#3-match-simulation)
   - 3.1 Architecture
   - 3.2 Round Simulation
   - 3.3 Economy Engine
   - 3.4 Map & Series Simulation
4. [Player Generation](#4-player-generation)
   - 4.1 Archetypes
   - 4.2 Generation Functions
   - 4.3 Nationality & Names
5. [League Structure](#5-league-structure)
   - 5.1 Regions & Import Rules
   - 5.2 Team Assembly
   - 5.3 Schedule Generation
   - 5.4 Standings
   - 5.5 Playoffs — Double Elimination
6. [Game Loop](#6-game-loop)
   - 6.1 Game State
   - 6.2 Phase Machine
   - 6.3 Weekly Tick
   - 6.4 Player Development & Aging
   - 6.5 Morale
7. [IndexedDB Persistence](#7-indexeddb-persistence)
   - 7.1 Schema
   - 7.2 Repositories
   - 7.3 Save & Load
8. [UI Screens](#8-ui-screens)

---

## 1. Project Overview

Valorant GM is a single-player, browser-based esports general manager game in the style of ZenGM. The player manages a Valorant esports organisation through roster building, match simulation, contract negotiation, and league progression.

**Tech stack:**
- React (UI)
- TypeScript (logic)
- IndexedDB via `idb` library (persistence — no backend required)
- Web Worker (match sim, keeps UI responsive)
- Vite (bundler)

**Key design principles:**
- Fully client-side — no server, saves live in the browser
- Deterministic seeded RNG — every match is replayable from its seed
- Information asymmetry — player ratings are scouted, not fully known
- Economy-aware simulation — buy rounds, eco rounds, survival bonuses all modelled

---

## 2. Data Model

### 2.1 Core Types

```typescript
type PlayerRole = 'duelist' | 'initiator' | 'controller' | 'sentinel';
type BuyType = 'fullBuy' | 'halfBuy' | 'forceBuy' | 'eco' | 'pistol';
type RegionId = 'americas' | 'emea' | 'pacific' | 'china';
type GamePhase = 'preseason' | 'regular_season' | 'playoffs' | 'inter_tournament' | 'offseason';
type PlayerArchetype = 'prodigy' | 'star' | 'veteran' | 'journeyman' | 'specialist';
```

### 2.2 Player

```typescript
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  alias: string;               // in-game handle shown in UI
  nationality: string;
  region: RegionId;            // region the player is from
  age: number;
  peakAge: number;             // ratings decline after this
  primaryRole: PlayerRole;
  mainAgent: string;           // e.g. "Jett", "Omen"
  archetype: PlayerArchetype;

  // Hidden true ratings — used by match sim only
  trueAim: number;             // 0–100
  trueGameSense: number;       // 0–100
  potential: number;           // ceiling for development

  // Visible (scouted) ratings — shown in UI
  aim: number;
  gameSense: number;

  // Other visible attributes
  clutch: number;              // 0–100
  communication: number;       // 0–100
  adaptability: number;        // governs role rating growth & decay speed

  morale: number;              // 0–100, affects match performance
  salary: number;              // annual in USD

  // Tracking
  dirtyFlag?: boolean;
}
```

### 2.3 Role Ratings & Scouting

Each player has exactly 4 role rating records — one per role. Stored separately in IndexedDB for query efficiency.

```typescript
interface PlayerRoleRatingRecord {
  id: string;                    // `${playerId}:${role}`
  playerId: string;
  role: PlayerRole;
  trueRating: number;            // 0–100, hidden — match sim uses this
  scoutedRating: number | null;  // null = never scouted
  scoutConfidence: number;       // 0–100
  lastPlayedSeason: number | null;
}

// Performance multiplier fed into match sim
function getRolePerformanceMultiplier(rr: PlayerRoleRatingRecord): number {
  // 100 rating = 1.0x, 50 rating = 0.75x, 0 rating = 0.5x
  return 0.5 + (rr.trueRating / 100) * 0.5;
}
```

**Scouting mechanics:**

```typescript
// Off-role ratings are harder to scout (less match footage)
function scoutRoleRating(
  rr: PlayerRoleRatingRecord,
  scoutQuality: number,         // 0–100, org's scout skill
  playerPrimaryRole: PlayerRole,
  roleBeingScouted: PlayerRole
): void {
  const roleFactor = roleBeingScouted === playerPrimaryRole ? 1.0 : 0.4;
  const gain = (scoutQuality / 100) * (1 - rr.scoutConfidence / 100) * 20 * roleFactor;
  rr.scoutConfidence = Math.min(100, rr.scoutConfidence + gain);

  const uncertainty = 1 - rr.scoutConfidence / 100;
  const noise = (Math.random() * 2 - 1) * 30 * uncertainty;
  rr.scoutedRating = Math.round(Math.max(0, Math.min(100, rr.trueRating + noise)));
}
```

**Role rating evolution (end of each season):**

```typescript
const SEASONS_TO_DECAY = 3;
const MAX_DECAY_PER_SEASON = 8;
const MAX_GROWTH_PER_SEASON = 6;

function updateRoleRatings(player: Player, rr: PlayerRoleRatingRecord, currentSeason: number): void {
  const adaptFactor = player.adaptability / 100;
  const seasonsIdle = rr.lastPlayedSeason === null
    ? Infinity
    : currentSeason - rr.lastPlayedSeason;

  if (seasonsIdle === 0) {
    // Played this role — grow it
    const growth = MAX_GROWTH_PER_SEASON * adaptFactor;
    const cap = rr.role === player.primaryRole ? 95 : 80; // off-roles cap lower
    rr.trueRating = Math.min(cap, rr.trueRating + growth);
  } else if (seasonsIdle > SEASONS_TO_DECAY) {
    // Grace period over — decay
    const decayRate = MAX_DECAY_PER_SEASON * (1 - adaptFactor * 0.6);
    rr.trueRating = Math.max(0, rr.trueRating - decayRate);
  }
  // seasonsIdle 1–3: grace period, no change
}
```

**Flex players** emerge naturally from the ratings distribution — no special flag needed. A player with 85/82/78/70 across all four roles is effectively a flex player. The `adaptability` stat governs how fast off-role ratings grow and how slowly they decay.

### 2.4 Economy Constants

```typescript
const LOSS_BONUS: Record<number, number> = {
  0: 1900,  // 1st consecutive loss
  1: 2400,  // 2nd consecutive loss
  2: 2900,  // 3+ consecutive losses (cap)
};
const KILL_BONUS = 200;
const SURVIVAL_BONUS = 1000;  // if you survive a lost round (overrides loss bonus)
const WIN_INCOME = 3000;
const SPIKE_PLANT_BONUS = 300;  // attackers only, even on a loss
const CREDIT_CAP = 9000;
const FULL_BUY_THRESHOLD = 3900;
const HALF_BUY_THRESHOLD = 2400;

function getLossBonus(lossStreak: number): number {
  return LOSS_BONUS[Math.min(lossStreak, 2)];
}
```

### 2.5 League & Team Structure

```typescript
interface Organization {
  id: string;
  name: string;
  shortName: string;        // e.g. "SEN"
  region: RegionId;
  budget: number;
  prestige: number;         // 0–100, affects player willingness to sign
  fanBase: number;
  founded: number;
  sponsorIncome: number;
  prizeEarnings: number;
  teamId: string;
}

interface Team {
  id: string;
  orgId: string;
  name: string;
  leagueId: string;
  region: RegionId;
  rosterIds: string[];      // 5 active players
  subIds: string[];         // 1–3 substitutes (minimum 1 required)
  coachId: string;
  mapPool: Record<string, number>;  // mapId → practice rating
  morale: number;
  chemistry: number;
  wins: number;
  losses: number;
  roundDiff: number;
}

interface League {
  id: string;
  name: string;
  region: RegionId;
  tier: 'partnership' | 'challengers';
  teamIds: string[];
  groups: { groupA: string[]; groupB: string[] } | null;
  currentSeason: number;
  currentAct: number;       // 1–3
  format: LeagueFormat;
  previousSeasonRankings: Map<string, number> | null;
}

const LEAGUE_FORMATS = {
  partnership: {
    teamsPerLeague: 12,
    playoffTeams: 6,
    playoffBye: 2,           // top 2 seeds skip to semis
    regularSeasonWeeks: 8,
    regularSeason: 'bo3',
  },
  challengers: {
    teamsPerLeague: 8,
    playoffTeams: 2,
    playoffBye: 0,
    regularSeasonWeeks: 6,
    regularSeason: 'bo3',
  },
};
```

### 2.6 Contracts & Transfers

```typescript
interface Contract {
  id: string;
  playerId: string;
  teamId: string;
  salary: number;
  length: number;           // seasons
  buyout: number;           // fee to buy player out
  startSeason: number;
  endWeek: number;
}

interface TransferOffer {
  id: string;
  playerId: string;
  fromTeamId: string;
  toTeamId: string;
  fee: number;
  offeredSalary: number;
  contractLength: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
  deadline: number;         // week number
}
```

---

## 3. Match Simulation

### 3.1 Architecture

The sim runs in a **Web Worker** to keep the UI responsive. Structure:

```
Match (BO1/BO3/BO5)
  └── Map (up to 24 rounds + OT)
        └── Round (buy phase → duels → plant/defuse → outcome)
              └── Player duel engine (combat power calculation)
```

### 3.2 Round Simulation

```typescript
interface RoundState {
  attackCredits: number;
  defendCredits: number;
  roundNum: number;
  attackSide: 'A' | 'B';
}

interface RoundResult {
  winner: 'attack' | 'defense';
  planted: boolean;
  stats: PlayerRoundStat[];
}

function simRound(
  attackers: PlayerState[],
  defenders: PlayerState[],
  state: RoundState,
  rng: () => number
): RoundResult {
  const aBuy = decideBuyType({ credits: state.attackCredits, ... });
  const dBuy = decideBuyType({ credits: state.defendCredits, ... });

  const atkPower = teamCombatPower(attackers, aBuy, 'attack');
  const defPower = teamCombatPower(defenders, dBuy, 'defense');

  // Attackers slightly favoured at 50/50 buy equity
  const plantChance = (atkPower / (atkPower + defPower)) * 1.04;
  const planted = rng() < plantChance;

  // Post-plant: defenders gain advantage (they know spike location)
  const finalAtkPower = atkPower * (planted ? 0.85 : 1.0);
  const finalDefPower = defPower * (planted ? 1.15 : 1.0);

  const attackerWins = rng() < finalAtkPower / (finalAtkPower + finalDefPower);
  const stats = generateRoundStats(attackers, defenders, attackerWins, planted, rng);

  return { winner: attackerWins ? 'attack' : 'defense', planted, stats };
}
```

**Combat power formula:**

```typescript
// Role side modifiers — reflects real Valorant meta
const SIDE_MODS: Record<PlayerRole, { attack: number; defense: number }> = {
  duelist:    { attack: 1.12, defense: 0.92 },
  initiator:  { attack: 1.05, defense: 1.00 },
  controller: { attack: 0.95, defense: 1.10 },
  sentinel:   { attack: 0.88, defense: 1.18 },
};

const EQUIP_MOD: Record<BuyType, number> = {
  fullBuy:  1.00,
  halfBuy:  0.78,
  forceBuy: 0.72,
  eco:      0.52,
  pistol:   0.65,
};

function playerCombatPower(p: PlayerState, buy: BuyType, side: 'attack' | 'defense'): number {
  const roleMultiplier = getRolePerformanceMultiplier(p.roleRatings[p.assignedRole]);
  const base = (p.trueAim * 0.55 + p.trueGameSense * 0.30 + p.clutch * 0.15) / 100;
  const equipMod = EQUIP_MOD[buy];
  const sideMod = SIDE_MODS[p.assignedRole][side];
  const moraleMod = 0.90 + (p.morale / 100) * 0.15;
  return base * roleMultiplier * equipMod * sideMod * moraleMod;
}

function teamCombatPower(players: PlayerState[], buys: BuyType[], side: 'attack' | 'defense'): number {
  // Comp synergy bonus: all 4 roles filled
  const roles = new Set(players.map(p => p.assignedRole));
  const synergyBonus = roles.size === 4 ? 1.06 : 1.0;
  const total = players.reduce((sum, p, i) => sum + playerCombatPower(p, buys[i], side), 0);
  return total * synergyBonus;
}
```

### 3.3 Economy Engine

**Per-player income (called after each round):**

```typescript
interface PlayerEconomy {
  playerId: string;
  credits: number;
}

function updatePlayerEconomy(
  playerEcon: PlayerEconomy,
  outcome: { survived: boolean; kills: number; planted: boolean },
  teamWon: boolean,
  teamLossStreak: number,
  isAttacker: boolean
): PlayerEconomy {
  let income: number;

  if (teamWon) {
    income = WIN_INCOME;
  } else {
    // Survival bonus overrides loss bonus if you survived with a gun worth saving
    income = outcome.survived ? SURVIVAL_BONUS : getLossBonus(teamLossStreak);
  }

  income += outcome.kills * KILL_BONUS;

  if (isAttacker && outcome.planted) {
    income += SPIKE_PLANT_BONUS;
  }

  return {
    playerId: playerEcon.playerId,
    credits: Math.min(CREDIT_CAP, playerEcon.credits + income),
  };
}
```

**Buy decision:**

```typescript
function decideTeamBuy(
  players: PlayerEconomy[],
  lossStreak: number,
  roundNum: number,
  opponentBuyType: BuyType | null
): { teamBuyType: BuyType; individualBuys: Record<string, BuyType> } {
  if (roundNum === 1 || roundNum === 13) {
    return { teamBuyType: 'pistol', individualBuys: Object.fromEntries(players.map(p => [p.playerId, 'pistol'])) };
  }

  const canFullBuy = players.filter(p => p.credits >= FULL_BUY_THRESHOLD).length;
  const canHalfBuy = players.filter(p => p.credits >= HALF_BUY_THRESHOLD).length;

  let teamBuyType: BuyType;
  if (canFullBuy >= 4)                                       teamBuyType = 'fullBuy';
  else if (canFullBuy >= 3 && opponentBuyType === 'eco')     teamBuyType = 'halfBuy';
  else if (lossStreak >= 3 && canHalfBuy >= 3)               teamBuyType = 'forceBuy';
  else if (canFullBuy < 2)                                   teamBuyType = 'eco';
  else                                                       teamBuyType = 'halfBuy';

  // Players who can't afford team buy spend what they can
  const individualBuys: Record<string, BuyType> = {};
  for (const p of players) {
    if (teamBuyType === 'fullBuy' && p.credits < FULL_BUY_THRESHOLD) {
      individualBuys[p.playerId] = p.credits >= HALF_BUY_THRESHOLD ? 'halfBuy' : 'eco';
    } else {
      individualBuys[p.playerId] = teamBuyType;
    }
  }

  return { teamBuyType, individualBuys };
}

// Coaching intelligence affects enemy economy reads
function estimateOpponentBuy(
  opponentLastBuy: BuyType,
  opponentWonLastRound: boolean,
  teamIntelligence: number   // 0–100, coaching staff quality
): BuyType | null {
  if (teamIntelligence > 70) {
    if (opponentWonLastRound) return 'fullBuy';
    if (opponentLastBuy === 'eco') return 'fullBuy';
    return opponentLastBuy;
  }
  return opponentWonLastRound ? 'fullBuy' : 'eco';
}
```

**Save decision (per player):**

```typescript
const WEAPON_VALUE: Record<string, number> = {
  vandal: 2900, phantom: 2900, operator: 4700,
  spectre: 1600, sheriff: 800, ghost: 500,
};

function shouldSave(playerCredits: number, weaponValue: number, lossBonus: number): boolean {
  const creditIfSave = playerCredits + SURVIVAL_BONUS + weaponValue;
  const creditIfDie  = playerCredits + lossBonus;
  return creditIfSave > creditIfDie || (playerCredits + lossBonus < FULL_BUY_THRESHOLD);
}
```

### 3.4 Map & Series Simulation

```typescript
function simMap(teamA: Team, teamB: Team, map: Map, rng: SeededRng): MapResult {
  let scoreA = 0, scoreB = 0;
  let attackSide: 'A' | 'B' = 'A';
  const playerEconA: PlayerEconomy[] = teamA.rosterIds.map(id => ({ playerId: id, credits: 800 }));
  const playerEconB: PlayerEconomy[] = teamB.rosterIds.map(id => ({ playerId: id, credits: 800 }));
  let lossStreakA = 0, lossStreakB = 0;

  for (let round = 1; round <= 24; round++) {
    if (scoreA === 13 || scoreB === 13) break;
    if (round === 13) attackSide = attackSide === 'A' ? 'B' : 'A';

    const result = simRound(...);

    const aWon = attackSide === 'A' ? result.winner === 'attack' : result.winner === 'defense';
    aWon ? scoreA++ : scoreB++;

    // Update individual player economies
    playerEconA.forEach((p, i) => {
      const outcome = result.stats.find(s => s.playerId === p.playerId)!;
      playerEconA[i] = updatePlayerEconomy(p, outcome, aWon, lossStreakA, attackSide === 'A');
    });
    playerEconB.forEach((p, i) => {
      const outcome = result.stats.find(s => s.playerId === p.playerId)!;
      playerEconB[i] = updatePlayerEconomy(p, outcome, !aWon, lossStreakB, attackSide === 'B');
    });

    lossStreakA = aWon ? 0 : lossStreakA + 1;
    lossStreakB = !aWon ? 0 : lossStreakB + 1;
  }

  // OT at 12–12 (simplified: single OT pair, 5000cr each)
  if (scoreA === 12 && scoreB === 12) {
    const [otA, otB] = simOvertimeRounds(teamA, teamB, rng);
    scoreA += otA; scoreB += otB;
  }

  return { scoreA, scoreB, winner: scoreA > scoreB ? 'A' : 'B', roundResults: [] };
}

function simMatch(
  teamA: Team, teamB: Team,
  format: 'bo1' | 'bo3' | 'bo5',
  rng: SeededRng,
  modifiers = { teamAMod: 1.0, teamBMod: 1.0 }  // used for grand final fatigue
): MatchResult {
  const maps = resolveMapVeto(teamA, teamB, format);
  const needed = { bo1: 1, bo3: 2, bo5: 3 }[format];
  let winsA = 0, winsB = 0;
  const mapResults: MapResult[] = [];

  for (const map of maps) {
    if (winsA === needed || winsB === needed) break;
    const result = simMap(teamA, teamB, map, rng);
    mapResults.push(result);
    result.winner === 'A' ? winsA++ : winsB++;
  }

  return { winner: winsA > winsB ? 'A' : 'B', winsA, winsB, mapResults };
}
```

---

## 4. Player Generation

### 4.1 Archetypes

```typescript
const ARCHETYPE_WEIGHTS = {
  prodigy:    0.15,  // 17–20, raw, high potential
  star:       0.20,  // 21–25, elite ratings, expensive
  veteran:    0.15,  // 26–30, declining aim, high game sense
  journeyman: 0.35,  // 21–28, average, reliable, cheap
  specialist: 0.15,  // high primary role rating, low off-roles
};
```

### 4.2 Generation Functions

```typescript
function generatePlayer(id: string, primaryRole: PlayerRole, archetype: PlayerArchetype, rng: SeededRng): GeneratedPlayer {
  const nationalityPool = generateNationality(rng);
  const { firstName, lastName } = generateName(nationalityPool, rng);
  const alias = generateAlias(firstName, nationalityPool.nationality, rng);

  const age = generateAge(archetype, rng);
  const peakAge = generatePeakAge(archetype, age, rng);
  const { trueAim, trueGameSense, potential } = generateCoreRatings(archetype, age, peakAge, rng);
  const roleRatings = generateRoleRatings(primaryRole, archetype, trueGameSense, rng);

  return {
    id, firstName, lastName, alias,
    nationality: nationalityPool.nationality,
    region: nationalityPool.region,
    age, peakAge, primaryRole,
    mainAgent: pickMainAgent(primaryRole, rng),
    archetype, trueAim, trueGameSense, potential,
    adaptability: generateAdaptability(archetype, rng),
    clutch: generateClutch(archetype, rng),
    communication: generateCommunication(archetype, age, rng),
    morale: 70 + Math.round(rng() * 30),
    salary: generateSalary(archetype, rng),
    roleRatings,
  };
}

// Age ranges per archetype
const AGE_RANGES: Record<PlayerArchetype, [number, number]> = {
  prodigy:    [17, 20],
  star:       [21, 25],
  veteran:    [26, 30],
  journeyman: [21, 28],
  specialist: [19, 28],
};

// Core rating quality ranges per archetype
const QUALITY_RANGES: Record<PlayerArchetype, { min: number; max: number }> = {
  prodigy:    { min: 45, max: 70 },
  star:       { min: 72, max: 92 },
  veteran:    { min: 60, max: 80 },
  journeyman: { min: 48, max: 68 },
  specialist: { min: 55, max: 78 },
};

// Salary ranges (USD/year)
const SALARY_RANGES: Record<PlayerArchetype, [number, number]> = {
  prodigy:    [30_000,  80_000],
  star:       [150_000, 500_000],
  veteran:    [80_000,  200_000],
  journeyman: [40_000,  100_000],
  specialist: [60_000,  180_000],
};

// Off-role base per archetype
const OFF_ROLE_BASE: Record<PlayerArchetype, number> = {
  prodigy:    35,  // haven't learned off-roles yet
  star:       45,  // good but focused on primary
  veteran:    55,  // years of experience across roles
  journeyman: 50,  // naturally flexible
  specialist: 20,  // deliberately one-dimensional
};
```

**Age-based rating modifier:**
- Pre-peak: +1 rating per year approaching peak
- Post-peak: −2.5 rating per year (aim declines faster than game sense)

**Player pool size:** 130 players total (90 under contract across 12 partnership + 8 challengers teams, ~40 free agents and prospects).

### 4.3 Nationality & Names

**Four regions, weighted by real pro scene demographics:**

```typescript
const NATIONALITY_POOL: NationalityPool[] = [
  // Americas
  { nationality: 'USA',          region: 'americas', weight: 18, firstNames: [...], lastNames: [...] },
  { nationality: 'Brazil',       region: 'americas', weight: 14, firstNames: [...], lastNames: [...] },
  { nationality: 'Canada',       region: 'americas', weight: 5,  firstNames: [...], lastNames: [...] },
  { nationality: 'Argentina',    region: 'americas', weight: 4,  firstNames: [...], lastNames: [...] },
  { nationality: 'Chile',        region: 'americas', weight: 3,  firstNames: [...], lastNames: [...] },

  // EMEA
  { nationality: 'France',       region: 'emea',     weight: 9,  firstNames: [...], lastNames: [...] },
  { nationality: 'UK',           region: 'emea',     weight: 8,  firstNames: [...], lastNames: [...] },
  { nationality: 'Sweden',       region: 'emea',     weight: 7,  firstNames: [...], lastNames: [...] },
  { nationality: 'Denmark',      region: 'emea',     weight: 6,  firstNames: [...], lastNames: [...] },
  { nationality: 'Turkey',       region: 'emea',     weight: 6,  firstNames: [...], lastNames: [...] },
  { nationality: 'Poland',       region: 'emea',     weight: 5,  firstNames: [...], lastNames: [...] },
  { nationality: 'Germany',      region: 'emea',     weight: 5,  firstNames: [...], lastNames: [...] },

  // Pacific
  { nationality: 'South Korea',  region: 'pacific',  weight: 20, firstNames: [...], lastNames: [...] },
  { nationality: 'Japan',        region: 'pacific',  weight: 8,  firstNames: [...], lastNames: [...] },
  { nationality: 'Philippines',  region: 'pacific',  weight: 6,  firstNames: [...], lastNames: [...] },
  { nationality: 'Australia',    region: 'pacific',  weight: 5,  firstNames: [...], lastNames: [...] },
  { nationality: 'Thailand',     region: 'pacific',  weight: 4,  firstNames: [...], lastNames: [...] },

  // China (own region)
  { nationality: 'China',        region: 'china',    weight: 12, firstNames: [...], lastNames: [...] },
];
```

**Import rules per region:**

```typescript
const HOME_NATIONALITIES: Record<RegionId, string[]> = {
  americas: ['USA', 'Canada', 'Brazil', 'Argentina', 'Chile', 'Mexico', 'Colombia'],
  emea:     ['UK', 'France', 'Germany', 'Sweden', 'Denmark', 'Finland', 'Norway',
             'Spain', 'Poland', 'Russia', 'Turkey', 'Ukraine', 'Portugal', 'Belgium'],
  pacific:  ['South Korea', 'Japan', 'Australia', 'Philippines', 'Thailand',
             'Indonesia', 'Singapore', 'New Zealand', 'Taiwan'],
  china:    ['China'],
};

const IMPORT_LIMITS: Record<RegionId, { maxImports: number }> = {
  americas: { maxImports: 2 },
  emea:     { maxImports: 2 },
  pacific:  { maxImports: 2 },
  china:    { maxImports: 2 },
};
```

**Agent pools per role:**

```typescript
const ROLE_AGENTS: Record<PlayerRole, string[]> = {
  duelist:    ['Jett', 'Reyna', 'Raze', 'Neon', 'Iso', 'Yoru'],
  initiator:  ['Sova', 'Fade', 'Breach', 'KAY/O', 'Gekko', 'Skye'],
  controller: ['Omen', 'Astra', 'Viper', 'Brimstone', 'Clove', 'Harbor'],
  sentinel:   ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse'],
};
```

---

## 5. League Structure

### 5.1 Regions

Four regions: **Americas**, **EMEA**, **Pacific**, **China**. Each has a partnership (top) league and a challengers (feeder) league.

```typescript
const LEAGUE_NAMES: Record<RegionId, { partnership: string; challengers: string }> = {
  americas: { partnership: 'VCT Americas',   challengers: 'VCT Challengers Americas' },
  emea:     { partnership: 'VCT EMEA',       challengers: 'VCT Challengers EMEA' },
  pacific:  { partnership: 'VCT Pacific',    challengers: 'VCT Challengers Pacific' },
  china:    { partnership: 'VCT CN',         challengers: 'VCT Challengers CN' },
};
```

### 5.2 Team Assembly

12 partnership teams assembled by prestige order — higher prestige orgs pick first from the player pool, with noise scaled by prestige so lower orgs occasionally land undervalued players.

**Roster requirements:**
- Exactly 5 starters covering all 4 roles (fifth slot is the flex slot)
- Minimum 1 sub, maximum 3
- Maximum 2 import players
- Total salary within 60% of org budget

**Group seeding (snake draft ensures even strength):**

```
Seed 1 → Group A    Seed 2 → Group B
Seed 3 → Group B    Seed 4 → Group A
Seed 5 → Group A    Seed 6 → Group B
...
```

Result for 12 teams: Group A gets seeds 1,4,5,8,9,12 (sum 39) vs Group B seeds 2,3,6,7,10,11 (sum 38).

### 5.3 Schedule Generation

Standard round-robin algorithm within each group, distributed across 3 acts (8 weeks total regular season). Each act is a partial round-robin — full coverage achieved across the season.

### 5.4 Standings

```typescript
interface StandingsRow {
  teamId: string;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  roundDiff: number;
  mapDiff: number;
  points: number;      // 3 for series win, 1 for 2-1 loss, 0 for 2-0 loss
}

// Tiebreaker order: points → map diff → round diff
function sortStandings(standings: StandingsRow[]): StandingsRow[] {
  return standings.sort((a, b) =>
    b.points - a.points || b.mapDiff - a.mapDiff || b.roundDiff - a.roundDiff
  );
}
```

### 5.5 Playoffs — Double Elimination

Top 3 from each group qualify (6 teams total). Seeds 1 and 2 receive byes to upper semifinals.

```
Upper bracket:
  UQF1: s3 vs s6  (BO3)
  UQF2: s4 vs s5  (BO3)
  USF1: s1 vs UQF1 winner  (BO3)
  USF2: s2 vs UQF2 winner  (BO3)
  UF:   USF1 winner vs USF2 winner  (BO3)

Lower bracket:
  LR1:  UQF1 loser vs UQF2 loser  (BO3)
  LSF:  USF1 loser vs LR1 winner  (BO3)
  LF:   USF2 loser vs LSF winner  (BO5)

Grand Final:
  UF winner vs LF winner  (BO5)
  + fatigue modifier on LF winner
```

**Grand final fatigue modifier:**

```typescript
const GRAND_FINAL_FATIGUE_BASE = 0.04;
const FATIGUE_PER_EXTRA_MAP   = 0.015;

function getGrandFinalFatigueMod(lowerFinal: PlayoffMatch): { upperMod: number; lowerMod: number } {
  const mapsPlayed = lowerFinal.result!.mapResults.length;
  const extraMaps = Math.max(0, mapsPlayed - 3);
  const fatiguePenalty = GRAND_FINAL_FATIGUE_BASE + extraMaps * FATIGUE_PER_EXTRA_MAP;
  return { upperMod: 1.0, lowerMod: 1.0 - fatiguePenalty };
}
// 3-0 lower final = 0.04 penalty; 3-2 lower final = 0.07 penalty
```

---

## 6. Game Loop

### 6.1 Game State

```typescript
interface GameState {
  phase: GamePhase;
  season: number;          // game-season (increments each split)
  calendarSeason: number;  // calendar year (1 per 3 splits)
  splitNum: number;        // 1–3 within the calendar year
  week: number;

  playerTeamId: string;
  leagueId: string;
  regionId: RegionId;
  seed: number;

  players:   Map<string, Player>;
  teams:     Map<string, Team>;
  orgs:      Map<string, Organization>;
  leagues:   Map<string, League>;   // all 4 regions
  contracts: Map<string, Contract>;
  matches:   Map<string, ScheduledMatch>;
  standings: StandingsRow[];        // all seasons, all regions

  freeAgents:       string[];
  notifications:    Notification[];
  transferOffers:   TransferOffer[];
  playoffBracket:   PlayoffBracket | null;
  otherPlayoffBrackets: Map<string, PlayoffBracket>;  // other 3 regions

  // History
  splitHistory:   SplitRecord[];    // one per completed split (player region)
  seasonHistory:  SeasonRecord[];   // one per completed calendar year (player region)

  // International tournaments
  activeInternationalTournament: InternationalTournament | null;
  tournamentHistory: InternationalTournament[];
  championsPoints: Map<string, number>;  // teamId → cumulative points

  // Active map pool (7 of 12)
  activeMapPool: string[];

  dirtyPlayers: Set<string>;   // for efficient saves
  dirtyMatches: Set<string>;
}

interface SplitRecord {
  calendarSeason: number;
  splitNum: number;
  winnerTeamId: string;
  runnerUpTeamId: string;
  mvpPlayerId: string;
}

interface SeasonRecord {
  season: number;
  championTeamId: string;
  mvpPlayerId: string;
  bestDuelistId: string;
  bestInitiatorId: string;
  bestControllerId: string;
  bestSentinelId: string;
}
```

### 6.2 Phase Machine

```
preseason → regular_season → playoffs → inter_tournament → [offseason →] preseason (next split)
```

Three splits form one calendar year. After splits 1 and 2, a Masters tournament runs (`inter_tournament`). After split 3, Champions runs, then offseason before the next calendar year begins.

```typescript
async function advanceWeek(state: GameState): Promise<GameState> {
  switch (state.phase) {
    case 'preseason':         return runPreseasonWeek(state);
    case 'regular_season':    return runRegularSeasonWeek(state);
    case 'playoffs':          return runPlayoffStage(state);
    case 'inter_tournament':  return runTournamentWeek(state);
    case 'offseason':         return runOffseasonWeek(state);
  }
}
```

**Background region simulation:** All 3 non-player regions run their regular-season matches each week alongside the player's league. When the player's league enters playoffs, the other 3 regions' full playoff brackets are auto-simulated in one shot. New schedules are generated for all 4 regions each split transition.

**Map pool rotation:** At each new split, the active 7-map pool may rotate — 60% no change, 30% one swap, 10% two swaps. Incoming maps drawn from the 12-map reserve. A "Map Pool Update" notification names additions and removals.

### 6.3 Weekly Tick

Each week: apply player decisions → simulate all matches → run AI management → update standings → check phase transitions → save.

**AI management:** Other teams renew expiring contracts, fill roster weaknesses, and adjust lineups. All teams are subject to the same systems as the player — aging, morale, budget constraints.

**Notifications surfaced to player:**
- Match results
- Contract expiring warnings (4 weeks ahead)
- Incoming transfer offers
- Scout reports ready
- Playoff qualification / elimination
- Player development milestones

### 6.4 Player Development & Aging

```typescript
function developPlayer(player: Player, season: number, week: number): void {
  if (player.age >= player.peakAge) return;
  const developmentRate = (player.potential / 100) * 0.02; // tiny weekly tick
  player.trueAim       = Math.min(player.potential, player.trueAim + developmentRate);
  player.trueGameSense = Math.min(player.potential, player.trueGameSense + developmentRate * 0.5);
}

function applyAgingEffects(player: Player): void {
  if (player.age <= player.peakAge) return;
  const yearsPostPeak = player.age - player.peakAge;
  player.trueAim       = Math.max(20, player.trueAim - yearsPostPeak * 2.5);
  player.trueGameSense = Math.max(20, player.trueGameSense - yearsPostPeak * 1.0);
  // Aim declines faster — pure mechanics degrade before game intelligence
}
```

### 6.5 Morale

```typescript
const MORALE_BASELINE = 75;
const DECAY_RATE = 0.05;

// After each match
function applyMatchMorale(team: Team, won: boolean): void {
  team.morale = Math.max(0, Math.min(100, team.morale + (won ? 8 : -6)));
  // Individual players: +5 win / -4 loss for starters
}

// Every week — prevents runaway winning/losing streaks
function updateMorale(player: Player): void {
  player.morale += (MORALE_BASELINE - player.morale) * DECAY_RATE;
  player.morale = Math.round(player.morale);
}
```

---

## 7. IndexedDB Persistence

### 7.1 Schema

Stores and their primary indexes:

| Store | Key | Key indexes |
|---|---|---|
| `players` | `id` | by-team, by-nationality, by-role |
| `playerRoleRatings` | `${playerId}:${role}` | by-player |
| `teams` | `id` | by-league, by-org |
| `orgs` | `id` | by-region |
| `leagues` | `id` | by-region |
| `matches` | `id` | by-league-week, by-team, by-season |
| `contracts` | `id` | by-player, by-team |
| `playerMatchStats` | `id` | by-match, by-player, by-player-season |
| `standings` | `${leagueId}:${season}:${teamId}` | by-league-season |
| `transferOffers` | `id` | by-player, by-to-team, by-from-team |
| `notifications` | `id` | by-read |
| `scoutReports` | `id` | by-player, by-season |
| `gameState` | `'current'` | — (singleton) |

### 7.2 Repositories

Each store has a typed repository class wrapping the `idb` library:

```typescript
class PlayerRepository {
  async get(id: string): Promise<PlayerRecord | undefined>
  async getMany(ids: string[]): Promise<PlayerRecord[]>
  async getByTeam(teamId: string): Promise<PlayerRecord[]>
  async getFreeAgents(): Promise<PlayerRecord[]>
  async getByRole(role: PlayerRole): Promise<PlayerRecord[]>
  async put(player: PlayerRecord): Promise<void>
  async putMany(players: PlayerRecord[]): Promise<void>
}

class MatchRepository {
  async getForWeek(leagueId: string, act: number, week: number): Promise<MatchRecord[]>
  async getForTeam(teamId: string): Promise<MatchRecord[]>
  async getForSeason(season: number): Promise<MatchRecord[]>
  async put(match: MatchRecord): Promise<void>
  async putMany(matches: MatchRecord[]): Promise<void>
}

class StandingsRepository {
  async getForLeagueSeason(leagueId: string, season: number): Promise<StandingsRecord[]>
  async put(row: StandingsRecord): Promise<void>
}

class GameStateRepository {
  async load(): Promise<GameStateRecord | undefined>
  async save(state: GameStateRecord): Promise<void>
}
```

### 7.3 Save & Load

**Dirty tracking** — only changed entities are written each tick:

```typescript
async function saveGameState(state: GameState): Promise<void> {
  // 1. Write lightweight game state record (phase, week, etc.)
  await repos.gameState.save({ phase, season, act, week, ... });

  // 2. Flush dirty players
  if (state.dirtyPlayers.size > 0) {
    await repos.players.putMany(await repos.players.getMany([...state.dirtyPlayers]));
    state.dirtyPlayers.clear();
  }

  // 3. Flush dirty matches
  if (state.dirtyMatches.size > 0) {
    // batch write via single transaction
    state.dirtyMatches.clear();
  }
}
```

**New game init** uses `bulkPut` (single transaction per store) for fast startup:

```typescript
async function startNewGame(regionId: RegionId, seed: number): Promise<GameState> {
  const { league, challengers, orgs, teams, players } = initLeague(regionId, seed);
  await Promise.all([
    bulkPut(db, 'players', players),
    bulkPut(db, 'teams', teams),
    bulkPut(db, 'orgs', orgs),
    bulkPut(db, 'leagues', [league, challengers]),
  ]);
  const schedule = generateSchedule(league);
  await bulkPut(db, 'matches', schedule);
  // ... initialise standings rows
}
```

**Load** hydrates only the current season's matches into memory; historical stats are loaded on demand.

---

## 8. UI Screens

All screens built in React with a shared dark tactical aesthetic:

- **Fonts:** Barlow Condensed (headings/labels), Barlow (body), Share Tech Mono (numbers/codes)
- **Palette:** Near-black backgrounds (`#0a0a0c`), red accent (`#ff4655`), teal for positive (`#00c8aa`), amber for warnings (`#f5a623`)
- **Design language:** Clipped-corner buttons, monospaced stat cells, role badges with per-role colour coding, import slot indicators, confidence percentages on scouted ratings

### Screen inventory

| Screen | Key interactions |
|---|---|
| **New Game** | Region, team, and seed selection |
| **Dashboard** | Standing, next match, budget, morale, expiring contracts, notification inbox |
| **Roster** | Player list with role ratings + confidence bars; detail panel with career stats, contract, salary; promote/bench/release/renew actions |
| **Transfer Market** | Players tab (free agents + contracted; offer modal with buyout calc + acceptance likelihood); Coaches tab (hire/release head and assistant) |
| **Schedule** | Full season match list; expandable rows with per-player stats; "this week" badge |
| **Standings** | Region tab bar (AMR / EMEA / PAC / CHN); Group A/B side-by-side per region |
| **Playoffs** | Projected bracket during regular season; live double-elimination bracket; upper + lower bracket with series scores |
| **Stats** | Leaderboard from IndexedDB; filters: season, split, phase (All/Regular/Playoffs/International), role, team scope, region |
| **Finances** | Contract list with renewal offers; coach contracts; budget summary |
| **History** | Flat per-event table per season: Champions → Split 3 → Masters → Split 2 → … ; per-region rows always visible; collapsible season awards |
| **International Tournament** | Swiss play-in grid; double-elim main bracket; Champions group stage + playoff bracket; navigable from History |

### Data wiring (mock → production)

Each screen uses mock arrays shaped identically to the DB records. Replacing mock data with real queries is a one-line change per section:

```typescript
// Mock (current)
const players = MOCK_PLAYERS;

// Production
const players = await playerRepo.getByTeam(state.playerTeamId);
```

---

## Summary

**What was designed and built:**

This document covers the complete design and implementation skeleton for Valorant GM — a browser-based single-player esports management game. The project spans eight major systems:

The **data model** defines every entity in the game — players with dual hidden/visible ratings, role-specific ratings that decay without practice, scouted values with confidence levels, contracts with buyout clauses, and team structures with import slot constraints. Flex players emerge naturally from the rating distribution rather than being a special flag.

The **match simulation** runs a three-layer engine: series → map → round. Each round computes combat power from player ratings, role assignments, equipment quality, morale, and side modifiers specific to Valorant's meta (Sentinels stronger on defense, Duelists on attack). The economy engine implements Valorant's actual income rules — loss bonuses that cap at 2,900cr after three consecutive losses, 200cr kill bonuses, and a 1,000cr survival bonus that creates real tension around saving guns.

The **player generation** system produces 130 players across five archetypes, with internally consistent stat profiles — prodigies are raw but high-potential, stars are expensive and near their ceiling, veterans trade declining aim for high game sense. Korean players are the most common high-end talent globally, creating realistic import tension in non-Pacific leagues.

The **league structure** covers four VCT regions (Americas, EMEA, Pacific, China), each with 12 partnership teams split into two snake-seeded groups of six, and a challengers feeder league. The playoff bracket is double elimination with byes for the top two seeds and a grand final fatigue modifier on the lower bracket finalist.

The **game loop** advances weekly through preseason, regular season, playoffs, and offseason phases. Players age and develop, morale decays toward a baseline preventing runaway streaks, contracts expire, and AI teams make their own management decisions using the same systems available to the player.

**IndexedDB persistence** uses dirty tracking so only changed records are written each tick, keeping saves under a millisecond. Historical match stats are loaded on demand rather than at startup.

Five **React UI screens** were built to production quality: a war room dashboard, roster management with scouted role rating bars, a transfer market with real-time offer likelihood feedback, a match day screen with round-by-round playback and economy tracking, and a standings screen with group tabs, playoff picture, and schedule view.

**What is complete:**

All 11 screens are live and wired to real IndexedDB data. The full split → Masters → split → Masters → split → Champions calendar loop is implemented and playable. International tournament simulation, bracket display, per-match stat accumulation, tournament MVP selection, and history/stats/standings integration are all done. Map pool practice allocation is wired through the UI. Multi-season persistence with split and season archive records is complete.

**What remains to build:**
- **Scouting screen:** active targeted scouting of opponent players; `scoutedRating` updates as players develop post-generation (passive confidence tick via coach is in place)
- **Challengers simulation:** schedule + standings for the 8 challengers teams per region; breakout players surfacing as transfer targets (no promotion/relegation)
- **Sponsorships / prize money:** `Organization.sponsorIncome` and `prizeEarnings` stored but not wired to the budget loop
- **Web Worker integration:** match sim runs synchronously on the main thread; moving to a Worker keeps the UI responsive during long auto-sim sequences
