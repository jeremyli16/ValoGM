import type {
  Player, PlayerRoleRatingRecord, PlayerRole, PlayerArchetype, RegionId,
} from '../types';
import {
  AGE_RANGES, QUALITY_RANGES, SALARY_RANGES, OFF_ROLE_BASE,
  ROLE_AGENTS, ARCHETYPE_WEIGHTS, MORALE_BASELINE, MORALE_DECAY_RATE,
} from '../types';
import type { Rng } from './rng';
import { randInt, randFloat, randChoice, weightedChoice, clamp } from './rng';
import { generateNationality, generateNationalityForRegion, generateName, generateAlias } from './names';

const ROLES: PlayerRole[] = ['duelist', 'initiator', 'controller', 'sentinel'];

function generateAge(archetype: PlayerArchetype, rng: Rng): number {
  const [min, max] = AGE_RANGES[archetype];
  return randInt(rng, min, max);
}

function generatePeakAge(archetype: PlayerArchetype, age: number, rng: Rng): number {
  const base = archetype === 'prodigy' ? randInt(rng, 21, 24)
    : archetype === 'star' ? randInt(rng, 22, 26)
    : archetype === 'veteran' ? age - randInt(rng, 0, 3)
    : archetype === 'journeyman' ? randInt(rng, 22, 27)
    : randInt(rng, 22, 26);
  return Math.max(age, base);
}

function generateCoreRatings(
  archetype: PlayerArchetype, age: number, peakAge: number, rng: Rng
): { trueAim: number; trueGameSense: number; potential: number } {
  const { min, max } = QUALITY_RANGES[archetype];
  let base = randFloat(rng, min, max);

  // Age modifier
  if (age < peakAge) {
    // Pre-peak: each year toward peak adds a bit
    base += (peakAge - age) * 0.5;
  } else {
    // Post-peak decline
    const years = age - peakAge;
    base -= years * 2.5;
  }
  base = clamp(base, 10, 99);

  const aimWeight = archetype === 'veteran' ? 0.80 : 1.0;
  const gsWeight  = archetype === 'veteran' ? 1.20 : 1.0;

  const trueAim = clamp(Math.round(base * aimWeight + randFloat(rng, -5, 5)), 10, 99);
  const trueGameSense = clamp(Math.round(base * gsWeight + randFloat(rng, -5, 5)), 10, 99);

  const potentialBase = archetype === 'prodigy' ? randFloat(rng, 80, 99)
    : archetype === 'star' ? randFloat(rng, 75, 95)
    : archetype === 'veteran' ? randFloat(rng, 60, 80)
    : archetype === 'journeyman' ? randFloat(rng, 60, 78)
    : randFloat(rng, 65, 85);
  const potential = Math.round(clamp(potentialBase, trueAim, 99));

  return { trueAim, trueGameSense, potential };
}

function generateRoleRatings(
  playerId: string,
  primaryRole: PlayerRole,
  archetype: PlayerArchetype,
  trueGameSense: number,
  rng: Rng
): PlayerRoleRatingRecord[] {
  const offBase = OFF_ROLE_BASE[archetype];
  return ROLES.map(role => {
    let trueRating: number;
    if (role === primaryRole) {
      const cap = 95;
      const base = QUALITY_RANGES[archetype].min + rng() * (QUALITY_RANGES[archetype].max - QUALITY_RANGES[archetype].min);
      trueRating = clamp(Math.round(base + trueGameSense * 0.15), 40, cap);
    } else {
      trueRating = clamp(Math.round(offBase + randFloat(rng, -15, 15)), 5, 80);
    }
    return {
      id: `${playerId}:${role}`,
      playerId,
      role,
      trueRating,
      scoutedRating: null,
      scoutConfidence: 0,
      lastPlayedSeason: null,
    };
  });
}

function generateAdaptability(archetype: PlayerArchetype, rng: Rng): number {
  const bases: Record<PlayerArchetype, [number, number]> = {
    prodigy:    [40, 70],
    star:       [35, 65],
    veteran:    [55, 80],
    journeyman: [55, 85],
    specialist: [10, 35],
  };
  const [lo, hi] = bases[archetype];
  return Math.round(randFloat(rng, lo, hi));
}

function generateClutch(archetype: PlayerArchetype, rng: Rng): number {
  const bases: Record<PlayerArchetype, [number, number]> = {
    prodigy:    [30, 65],
    star:       [60, 90],
    veteran:    [55, 80],
    journeyman: [35, 65],
    specialist: [45, 75],
  };
  const [lo, hi] = bases[archetype];
  return Math.round(randFloat(rng, lo, hi));
}

function generateCommunication(archetype: PlayerArchetype, age: number, rng: Rng): number {
  const base = 40 + age * 0.8;
  const noise = randFloat(rng, -15, 15);
  const bonus = archetype === 'veteran' ? 15 : archetype === 'journeyman' ? 5 : 0;
  return clamp(Math.round(base + noise + bonus), 20, 100);
}

function generateSalary(archetype: PlayerArchetype, rng: Rng): number {
  const [lo, hi] = SALARY_RANGES[archetype];
  const raw = randFloat(rng, lo, hi);
  // Round to nearest 5k
  return Math.round(raw / 5_000) * 5_000;
}

export function pickArchetype(rng: Rng): PlayerArchetype {
  const archetypes = Object.keys(ARCHETYPE_WEIGHTS) as PlayerArchetype[];
  const weights = archetypes.map(a => ARCHETYPE_WEIGHTS[a]);
  return weightedChoice(rng, archetypes, weights);
}

export interface GeneratedPlayer {
  player: Player;
  roleRatings: PlayerRoleRatingRecord[];
}

export function generatePlayer(
  id: string,
  primaryRole: PlayerRole,
  archetype: PlayerArchetype,
  rng: Rng,
  regionId?: RegionId
): GeneratedPlayer {
  const pool = regionId ? generateNationalityForRegion(rng, regionId) : generateNationality(rng);
  const { firstName, lastName } = generateName(pool, rng);
  const alias = generateAlias(firstName, pool.nationality, rng);

  const age = generateAge(archetype, rng);
  const peakAge = generatePeakAge(archetype, age, rng);
  const { trueAim, trueGameSense, potential } = generateCoreRatings(archetype, age, peakAge, rng);
  const roleRatings = generateRoleRatings(id, primaryRole, archetype, trueGameSense, rng);
  const salary = generateSalary(archetype, rng);

  const player: Player = {
    id,
    firstName,
    lastName,
    alias,
    nationality: pool.nationality,
    region: pool.region,
    age,
    peakAge,
    primaryRole,
    mainAgent: randChoice(rng, ROLE_AGENTS[primaryRole]),
    archetype,
    trueAim,
    trueGameSense,
    potential,
    aim: clamp(Math.round(trueAim + randFloat(rng, -8, 8)), 10, 99),
    gameSense: clamp(Math.round(trueGameSense + randFloat(rng, -8, 8)), 10, 99),
    clutch: generateClutch(archetype, rng),
    communication: generateCommunication(archetype, age, rng),
    adaptability: generateAdaptability(archetype, rng),
    morale: 70 + Math.round(rng() * 30),
    salary,
    teamId: null,
    contractId: null,
  };

  return { player, roleRatings };
}

export function generatePlayerPool(
  totalPlayers: number,
  rng: Rng,
  startIndex = 0,
  regionId?: RegionId
): GeneratedPlayer[] {
  const roleDistribution: PlayerRole[] = [];
  const countPerRole = Math.floor(totalPlayers / 4);
  ROLES.forEach(r => {
    for (let i = 0; i < countPerRole; i++) roleDistribution.push(r);
  });
  // Fill remainder with random roles
  while (roleDistribution.length < totalPlayers) {
    roleDistribution.push(randChoice(rng, ROLES));
  }
  // Shuffle
  for (let i = roleDistribution.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roleDistribution[i], roleDistribution[j]] = [roleDistribution[j], roleDistribution[i]];
  }

  const idPrefix = regionId ? `p${regionId}_` : 'p';
  return roleDistribution.map((role, i) => {
    const archetype = pickArchetype(rng);
    return generatePlayer(`${idPrefix}${startIndex + i}`, role, archetype, rng, regionId);
  });
}

// Scouting
export function scoutRoleRating(
  rr: PlayerRoleRatingRecord,
  scoutQuality: number,
  playerPrimaryRole: PlayerRole,
  roleBeingScouted: PlayerRole,
  rng: Rng
): PlayerRoleRatingRecord {
  const roleFactor = roleBeingScouted === playerPrimaryRole ? 1.0 : 0.4;
  const gain = (scoutQuality / 100) * (1 - rr.scoutConfidence / 100) * 20 * roleFactor;
  const newConfidence = Math.min(100, rr.scoutConfidence + gain);
  const uncertainty = 1 - newConfidence / 100;
  const noise = (rng() * 2 - 1) * 30 * uncertainty;
  const scoutedRating = Math.round(clamp(rr.trueRating + noise, 0, 100));
  return { ...rr, scoutConfidence: Math.round(newConfidence), scoutedRating };
}

// End-of-season role rating evolution
export function updateRoleRatings(
  player: Player,
  rr: PlayerRoleRatingRecord,
  currentSeason: number
): PlayerRoleRatingRecord {
  const adaptFactor = player.adaptability / 100;
  const seasonsIdle = rr.lastPlayedSeason === null
    ? Infinity
    : currentSeason - rr.lastPlayedSeason;

  let trueRating = rr.trueRating;
  if (seasonsIdle === 0) {
    const growth = 6 * adaptFactor;
    const cap = rr.role === player.primaryRole ? 95 : 80;
    trueRating = Math.min(cap, trueRating + growth);
  } else if (seasonsIdle > 3) {
    const decayRate = 8 * (1 - adaptFactor * 0.6);
    trueRating = Math.max(0, trueRating - decayRate);
  }
  return { ...rr, trueRating: Math.round(trueRating) };
}

// Player development (weekly)
export function developPlayer(player: Player): Player {
  if (player.age >= player.peakAge) return player;
  const rate = (player.potential / 100) * 0.02;
  return {
    ...player,
    trueAim:       clamp(player.trueAim + rate, 0, player.potential),
    trueGameSense: clamp(player.trueGameSense + rate * 0.5, 0, player.potential),
  };
}

// Morale mean-reversion
export function updateMorale(player: Player): Player {
  const next = player.morale + (MORALE_BASELINE - player.morale) * MORALE_DECAY_RATE;
  return { ...player, morale: Math.round(next) };
}

// Annual aging
export function applyAgingEffects(player: Player): Player {
  if (player.age <= player.peakAge) return { ...player, age: player.age + 1 };
  const years = player.age + 1 - player.peakAge;
  return {
    ...player,
    age: player.age + 1,
    trueAim:       Math.max(20, player.trueAim - years * 2.5),
    trueGameSense: Math.max(20, player.trueGameSense - years * 1.0),
  };
}
