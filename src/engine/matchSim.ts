import type {
  Player, PlayerRoleRatingRecord, PlayerRole, BuyType,
  Team, MatchResult, MapResult, RoundResultSummary, PlayerMatchStat,
} from '../types';
import {
  SIDE_MODS, EQUIP_MOD, KILL_BONUS, WIN_INCOME, SPIKE_PLANT_BONUS,
  CREDIT_CAP, FULL_BUY_THRESHOLD, HALF_BUY_THRESHOLD,
  getLossBonus, SURVIVAL_BONUS, MAP_ATTACK_BIAS,
} from '../types';
import type { SeededRng } from './rng';
import { randInt, clamp, weightedChoice } from './rng';

// ─── Player State for sim ────────────────────────────────────────────────────

interface PlayerState {
  id: string;
  mainAgent: string;
  trueAim: number;
  trueGameSense: number;
  clutch: number;
  morale: number;
  assignedRole: PlayerRole;
  roleRating: number;
  agentMetaMod: number;
  agentMapDelta: number;
  credits: number;
  kills: number;
  deaths: number;
  assists: number;
  roundDamage: number;
  acs: number;
}

interface PlayerEconomy {
  playerId: string;
  credits: number;
}

// ─── Role Performance ─────────────────────────────────────────────────────────

function getRolePerformanceMultiplier(trueRating: number): number {
  return 0.5 + (trueRating / 100) * 0.5;
}

// ─── Combat Power ─────────────────────────────────────────────────────────────

function playerCombatPower(p: PlayerState, buy: BuyType, side: 'attack' | 'defense'): number {
  const roleMultiplier = getRolePerformanceMultiplier(p.roleRating);
  const base = (p.trueAim * 0.55 + p.trueGameSense * 0.30 + p.clutch * 0.15) / 100;
  const equipMod = EQUIP_MOD[buy];
  const sideMod = SIDE_MODS[p.assignedRole][side];
  const moraleMod = 0.90 + (p.morale / 100) * 0.15;
  return base * roleMultiplier * equipMod * sideMod * moraleMod * p.agentMetaMod + p.agentMapDelta;
}

function teamCombatPower(
  players: PlayerState[],
  buys: BuyType[],
  side: 'attack' | 'defense'
): number {
  const roles = new Set(players.map(p => p.assignedRole));
  const synergyBonus = roles.size === 4 ? 1.06 : 1.0;
  const total = players.reduce((sum, p, i) => sum + playerCombatPower(p, buys[i], side), 0);
  return total * synergyBonus;
}

// ─── Economy ─────────────────────────────────────────────────────────────────

function updateEconomy(
  econ: PlayerEconomy,
  outcome: { survived: boolean; kills: number; planted: boolean },
  teamWon: boolean,
  teamLossStreak: number,
  isAttacker: boolean
): PlayerEconomy {
  let income: number;
  if (teamWon) {
    income = WIN_INCOME;
  } else {
    income = outcome.survived ? SURVIVAL_BONUS : getLossBonus(teamLossStreak);
  }
  income += outcome.kills * KILL_BONUS;
  if (isAttacker && outcome.planted) income += SPIKE_PLANT_BONUS;
  return { playerId: econ.playerId, credits: Math.min(CREDIT_CAP, econ.credits + income) };
}

function decideTeamBuy(
  players: PlayerEconomy[],
  lossStreak: number,
  roundNum: number,
  opponentBuyType: BuyType | null
): { teamBuyType: BuyType; individualBuys: BuyType[] } {
  if (roundNum === 1 || roundNum === 13) {
    return { teamBuyType: 'pistol', individualBuys: players.map(() => 'pistol') };
  }

  // Force ECO on round 2/14 if just lost pistol — save full budget for round 3/15.
  if ((roundNum === 2 || roundNum === 14) && lossStreak === 1) {
    return { teamBuyType: 'eco', individualBuys: players.map(() => 'eco') };
  }

  const canFullBuy = players.filter(p => p.credits >= FULL_BUY_THRESHOLD).length;
  const canHalfBuy = players.filter(p => p.credits >= HALF_BUY_THRESHOLD).length;

  let teamBuyType: BuyType;
  if (canFullBuy >= 4)                                       teamBuyType = 'fullBuy';
  else if (canFullBuy >= 3 && opponentBuyType === 'eco')    teamBuyType = 'halfBuy';
  else if (lossStreak >= 3 && canHalfBuy >= 3)              teamBuyType = 'forceBuy';
  else if (canFullBuy < 2)                                  teamBuyType = 'eco';
  else                                                      teamBuyType = 'halfBuy';

  const individualBuys: BuyType[] = players.map(p => {
    if (teamBuyType === 'fullBuy' && p.credits < FULL_BUY_THRESHOLD) {
      return p.credits >= HALF_BUY_THRESHOLD ? 'halfBuy' : 'eco';
    }
    return teamBuyType;
  });

  return { teamBuyType, individualBuys };
}

// ─── Role Weights ─────────────────────────────────────────────────────────────

// Survival probability modifier per role — sentinels hold safe angles and die least;
// duelists entry-frag and die most.
const ROLE_SURVIVAL_MOD: Record<PlayerRole, number> = {
  duelist:    0.80,
  initiator:  1.10,
  controller: 1.00,
  sentinel:   1.25,
};

// Kill credit modifier per role — duelists get the most individual kills;
// controllers are util-focused and frag less.
const ROLE_KILL_MOD: Record<PlayerRole, number> = {
  duelist:    1.30,
  initiator:  0.90,
  controller: 0.80,
  sentinel:   0.95,
};

function playerSkillScore(p: PlayerState): number {
  return p.trueAim * 0.55 + p.trueGameSense * 0.30 + p.clutch * 0.15 + 1;
}

function survivalWeight(p: PlayerState): number {
  return playerSkillScore(p) * ROLE_SURVIVAL_MOD[p.assignedRole];
}

function killWeight(p: PlayerState): number {
  return playerSkillScore(p) * ROLE_KILL_MOD[p.assignedRole];
}

// Weighted sampling without replacement: pick `count` indices from players.
function pickSurvivorIndices(
  rng: SeededRng,
  players: PlayerState[],
  count: number,
  weightFn: (p: PlayerState) => number = playerSkillScore
): Set<number> {
  const survivors = new Set<number>();
  const pool = players.map((p, i) => ({ i, w: weightFn(p) }));
  for (let k = 0; k < count && pool.length > 0; k++) {
    const chosen = weightedChoice(rng, pool, pool.map(x => x.w));
    survivors.add(chosen.i);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return survivors;
}

// ─── ACS Computation ─────────────────────────────────────────────────────────

// Kill-point values by enemies-alive-at-time-of-kill (index = kill number, 0-based).
// First kill: 5 enemies alive → 150 pts, second: 4 alive → 130 pts, etc.
const KILL_POINTS = [150, 130, 110, 90, 70];

function computeRoundACS(kills: number, damage: number, assists: number): number {
  let killPts = 0;
  for (let i = 0; i < Math.min(kills, 5); i++) killPts += KILL_POINTS[i];
  const multiKillBonus = Math.max(0, kills - 1) * 50 + (kills >= 5 ? 200 : 0);
  return damage + killPts + multiKillBonus + assists * 25;
}

// ─── Round Stats Generation ───────────────────────────────────────────────────

interface RoundOutcome {
  survived: boolean;
  kills: number;
  assists: number;
  planted: boolean;
  damage: number;
}

function generateRoundStats(
  attackers: PlayerState[],
  defenders: PlayerState[],
  attackerWins: boolean,
  planted: boolean,
  isMatchPoint: boolean,
  rng: SeededRng
): { attackerOutcomes: RoundOutcome[]; defenderOutcomes: RoundOutcome[] } {
  const attackerOutcomes: RoundOutcome[] = attackers.map(() => ({
    survived: false, kills: 0, assists: 0, planted, damage: 0,
  }));
  const defenderOutcomes: RoundOutcome[] = defenders.map(() => ({
    survived: false, kills: 0, assists: 0, planted: false, damage: 0,
  }));

  const winners = attackerWins ? attackers : defenders;
  const losers  = attackerWins ? defenders : attackers;
  const winnerOutcomes = attackerWins ? attackerOutcomes : defenderOutcomes;
  const loserOutcomes  = attackerWins ? defenderOutcomes : attackerOutcomes;

  // Step 1: Role+skill-weighted survivor selection
  const winnerSurvivorCount = randInt(rng, 1, 3);
  const loserSurvivorCount  = randInt(rng, 0, 1);
  let winnerSurvivorSet = pickSurvivorIndices(rng, winners, winnerSurvivorCount, survivalWeight);
  let loserSurvivorSet  = pickSurvivorIndices(rng, losers,  loserSurvivorCount,  survivalWeight);

  // Step 2: Clutch check — 1 loser survivor facing 2+ winner survivors.
  // Real pro clutch rates (VLR.gg): 1v2 ≈ 28%, 1v3 ≈ 12%, 1v4 ≈ 5%, 1v5 ≈ 2%.
  // Player's clutch stat scales the base rate (×0.7 at clutch=0, ×1.3 at clutch=100).
  let clutchSucceeded = false;
  let clutchPlayerIdx = -1;

  if (loserSurvivorSet.size === 1 && winnerSurvivorSet.size >= 2) {
    clutchPlayerIdx = [...loserSurvivorSet][0];
    const clutchPlayer = losers[clutchPlayerIdx];
    const nOpponents   = winnerSurvivorSet.size;
    const baseRates    = [0, 0, 0.28, 0.12, 0.05, 0.02];
    const baseRate     = baseRates[Math.min(nOpponents, 5)];
    const clutchMod    = 0.7 + (clutchPlayer.clutch / 100) * 0.6;

    if (rng() < baseRate * clutchMod) {
      // Clutch! All winner survivors die.
      clutchSucceeded  = true;
      winnerSurvivorSet = new Set<number>();
    } else if (isMatchPoint) {
      // Last round — no saves, loser fights to the death.
      loserSurvivorSet = new Set<number>();
    }
    // else: loser player escapes (saves weapon for next round).
  }

  // Step 3: Apply survival flags
  winnerSurvivorSet.forEach(i => { winnerOutcomes[i].survived = true; });
  loserSurvivorSet.forEach(i =>  { loserOutcomes[i].survived  = true; });

  // Step 4: Kill assignment — each death credits one kill to a role+skill-weighted opponent.
  // This keeps total kills === total deaths per round.
  const winnerKillWeights = winners.map(killWeight);
  const loserKillWeights  = losers.map(killWeight);
  const winnerIndices = [0, 1, 2, 3, 4];
  const loserIndices  = [0, 1, 2, 3, 4];

  loserOutcomes.forEach(o => {
    if (!o.survived) {
      winnerOutcomes[weightedChoice(rng, winnerIndices, winnerKillWeights)].kills++;
    }
  });

  if (clutchSucceeded && clutchPlayerIdx >= 0) {
    // Clutch player personally accounts for all remaining winner kills.
    winnerOutcomes.forEach(o => {
      if (!o.survived) loserOutcomes[clutchPlayerIdx].kills++;
    });
  } else {
    winnerOutcomes.forEach(o => {
      if (!o.survived) {
        loserOutcomes[weightedChoice(rng, loserIndices, loserKillWeights)].kills++;
      }
    });
  }

  // Step 5: Damage — kill damage + chip damage for every player
  ;[...attackerOutcomes, ...defenderOutcomes].forEach(o => {
    o.damage = o.kills * randInt(rng, 100, 150) + randInt(rng, 10, 80);
  });

  // Step 6: Assists — 60% chance per kill to give a random teammate an assist
  ;[attackerOutcomes, defenderOutcomes].forEach(outcomes => {
    outcomes.forEach((o, i) => {
      for (let k = 0; k < o.kills; k++) {
        if (rng() < 0.6) {
          const candidates = [0, 1, 2, 3, 4].filter(x => x !== i);
          outcomes[candidates[Math.floor(rng() * candidates.length)]].assists++;
        }
      }
    });
  });

  return { attackerOutcomes, defenderOutcomes };
}

// ─── Round Simulation ─────────────────────────────────────────────────────────

interface RoundSimResult {
  winner: 'attack' | 'defense';
  planted: boolean;
  atkBuyType: BuyType;
  defBuyType: BuyType;
  attackerOutcomes: RoundOutcome[];
  defenderOutcomes: RoundOutcome[];
}

function simRound(
  attackers: PlayerState[],
  defenders: PlayerState[],
  atkEcon: PlayerEconomy[],
  defEcon: PlayerEconomy[],
  atkLossStreak: number,
  defLossStreak: number,
  roundNum: number,
  prevAtkBuy: BuyType | null,
  prevDefBuy: BuyType | null,
  mapBias: number,
  isMatchPoint: boolean,
  rng: SeededRng
): RoundSimResult {
  const { teamBuyType: atkBuyType, individualBuys: atkBuys } =
    decideTeamBuy(atkEcon, atkLossStreak, roundNum, prevDefBuy);
  const { teamBuyType: defBuyType, individualBuys: defBuys } =
    decideTeamBuy(defEcon, defLossStreak, roundNum, prevAtkBuy);

  const atkPower = teamCombatPower(attackers, atkBuys, 'attack');
  const defPower = teamCombatPower(defenders, defBuys, 'defense');

  const plantChance = (atkPower / (atkPower + defPower)) * 1.04;
  const planted = rng() < plantChance;

  const finalAtkPower = atkPower * (planted ? 0.85 : 1.0);
  const finalDefPower = defPower * (planted ? 1.15 : 1.0);

  // Apply map-specific attack/defense bias (clamped to avoid extreme values).
  const rawWinChance = finalAtkPower / (finalAtkPower + finalDefPower);
  const attackerWins = rng() < clamp(rawWinChance + mapBias, 0.05, 0.95);

  const { attackerOutcomes, defenderOutcomes } =
    generateRoundStats(attackers, defenders, attackerWins, planted, isMatchPoint, rng);

  return {
    winner: attackerWins ? 'attack' : 'defense',
    planted,
    atkBuyType,
    defBuyType,
    attackerOutcomes,
    defenderOutcomes,
  };
}

// ─── OT Rounds (MR2 per set) ──────────────────────────────────────────────────

// Real Valorant OT: each set = 2 rounds, sides swap within the set.
// A team wins the map by winning both rounds in a set (leading by 2).
// If 1-1 in a set, play another set (same side starts as previous set).
function simOvertimeRounds(
  teamAPlayers: PlayerState[],
  teamBPlayers: PlayerState[],
  lastAttackSide: 'A' | 'B',
  mapBias: number,
  rng: SeededRng
): { otA: number; otB: number } {
  // Team that was defending at end of regulation attacks first in OT.
  let otAttackSide: 'A' | 'B' = lastAttackSide === 'A' ? 'B' : 'A';
  let otA = 0, otB = 0;
  const freshEcon = (): PlayerEconomy[] =>
    [0, 1, 2, 3, 4].map(j => ({ playerId: `ot${j}`, credits: 5000 }));

  for (let set = 0; set < 20; set++) {
    // 2 rounds per OT set, sides swap after each round within the set.
    for (let r = 0; r < 2; r++) {
      const atk = otAttackSide === 'A' ? teamAPlayers : teamBPlayers;
      const def = otAttackSide === 'A' ? teamBPlayers : teamAPlayers;
      const result = simRound(atk, def, freshEcon(), freshEcon(), 0, 0, 99, null, null, mapBias, true, rng);
      const aWon = (otAttackSide === 'A') === (result.winner === 'attack');
      if (aWon) otA++; else otB++;
      otAttackSide = otAttackSide === 'A' ? 'B' : 'A';
    }
    // After 2 rounds, otAttackSide has been swapped twice → back to set start.
    if (Math.abs(otA - otB) >= 2) break;
  }

  // Safety: force resolution if somehow still tied after all sets.
  if (Math.abs(otA - otB) < 2) {
    if (rng() < 0.5) otA += 2; else otB += 2;
  }

  return { otA, otB };
}

// ─── Map Simulation ───────────────────────────────────────────────────────────

function buildPlayerState(
  player: Player,
  roleRatings: Map<string, PlayerRoleRatingRecord>
): PlayerState {
  const rrKey = `${player.id}:${player.primaryRole}`;
  const rr = roleRatings.get(rrKey);
  return {
    id: player.id,
    mainAgent: player.mainAgent,
    trueAim: player.trueAim,
    trueGameSense: player.trueGameSense,
    clutch: player.clutch,
    morale: player.morale,
    assignedRole: player.primaryRole,
    roleRating: rr?.trueRating ?? 60,
    agentMetaMod: 1.0,
    agentMapDelta: 0,
    credits: 800,
    kills: 0,
    deaths: 0,
    assists: 0,
    roundDamage: 0,
    acs: 0,
  };
}

// statesA/statesB are mutated — stats for this map are accumulated into them.
function simMap(
  teamA: Team,
  teamB: Team,
  mapName: string,
  statesA: PlayerState[],
  statesB: PlayerState[],
  rng: SeededRng,
  agentMeta: Record<string, number> = {},
  agentMapMeta: Record<string, Record<string, number>> = {},
): MapResult {
  const mapBias = MAP_ATTACK_BIAS[mapName] ?? 0;
  const practiceA = teamA.mapPool[mapName] ?? 50;
  const practiceB = teamB.mapPool[mapName] ?? 50;
  const mapBonusA = 1.0 + (practiceA - 50) * 0.001;
  const mapBonusB = 1.0 + (practiceB - 50) * 0.001;

  // Local copies with map bonus, agent meta modifiers, and zeroed stats.
  const localA: PlayerState[] = statesA.map(s => {
    const globalMeta = agentMeta[s.mainAgent] ?? 60;
    const agentMetaMod = 0.90 + (globalMeta / 100) * 0.20;
    const agentMapDelta = agentMapMeta[s.mainAgent]?.[mapName] ?? 0;
    return {
      ...s,
      trueAim: clamp(s.trueAim * mapBonusA, 1, 100),
      trueGameSense: clamp(s.trueGameSense * mapBonusA, 1, 100),
      agentMetaMod,
      agentMapDelta,
      kills: 0, deaths: 0, assists: 0, roundDamage: 0, acs: 0,
    };
  });
  const localB: PlayerState[] = statesB.map(s => {
    const globalMeta = agentMeta[s.mainAgent] ?? 60;
    const agentMetaMod = 0.90 + (globalMeta / 100) * 0.20;
    const agentMapDelta = agentMapMeta[s.mainAgent]?.[mapName] ?? 0;
    return {
      ...s,
      trueAim: clamp(s.trueAim * mapBonusB, 1, 100),
      trueGameSense: clamp(s.trueGameSense * mapBonusB, 1, 100),
      agentMetaMod,
      agentMapDelta,
      kills: 0, deaths: 0, assists: 0, roundDamage: 0, acs: 0,
    };
  });

  const econA: PlayerEconomy[] = localA.map(s => ({ playerId: s.id, credits: 800 }));
  const econB: PlayerEconomy[] = localB.map(s => ({ playerId: s.id, credits: 800 }));

  let scoreA = 0, scoreB = 0;
  let attackSide: 'A' | 'B' = 'A';
  let lossStreakA = 0, lossStreakB = 0;
  let prevAtkBuy: BuyType | null = null;
  let prevDefBuy: BuyType | null = null;
  const roundResults: RoundResultSummary[] = [];

  for (let round = 1; round <= 24; round++) {
    if (scoreA >= 13 || scoreB >= 13) break;
    if (round === 13) attackSide = attackSide === 'A' ? 'B' : 'A';

    const atk = attackSide === 'A' ? localA : localB;
    const def = attackSide === 'A' ? localB : localA;
    const atkEcon = attackSide === 'A' ? econA : econB;
    const defEcon = attackSide === 'A' ? econB : econA;
    const atkStreak = attackSide === 'A' ? lossStreakA : lossStreakB;
    const defStreak = attackSide === 'A' ? lossStreakB : lossStreakA;
    const isMatchPoint = scoreA === 12 || scoreB === 12;

    const result = simRound(
      atk, def, atkEcon, defEcon,
      atkStreak, defStreak, round,
      prevAtkBuy, prevDefBuy, mapBias, isMatchPoint, rng
    );

    prevAtkBuy = result.atkBuyType;
    prevDefBuy = result.defBuyType;

    const aWon = attackSide === 'A'
      ? result.winner === 'attack'
      : result.winner === 'defense';

    if (aWon) { scoreA++; lossStreakA = 0; lossStreakB++; }
    else       { scoreB++; lossStreakB = 0; lossStreakA++; }

    const atkOutcomes = result.attackerOutcomes;
    const defOutcomes = result.defenderOutcomes;
    const atkTeamWon = result.winner === 'attack';

    atkEcon.forEach((econ, i) => {
      atkEcon[i] = updateEconomy(econ, { ...atkOutcomes[i], planted: result.planted }, atkTeamWon, atkStreak, true);
    });
    defEcon.forEach((econ, i) => {
      defEcon[i] = updateEconomy(econ, { ...defOutcomes[i], planted: false }, !atkTeamWon, defStreak, false);
    });

    atk.forEach((s, i) => {
      s.kills      += atkOutcomes[i].kills;
      s.assists    += atkOutcomes[i].assists;
      s.roundDamage += atkOutcomes[i].damage;
      if (!atkOutcomes[i].survived) s.deaths++;
      s.acs += computeRoundACS(atkOutcomes[i].kills, atkOutcomes[i].damage, atkOutcomes[i].assists);
    });
    def.forEach((s, i) => {
      s.kills      += defOutcomes[i].kills;
      s.assists    += defOutcomes[i].assists;
      s.roundDamage += defOutcomes[i].damage;
      if (!defOutcomes[i].survived) s.deaths++;
      s.acs += computeRoundACS(defOutcomes[i].kills, defOutcomes[i].damage, defOutcomes[i].assists);
    });

    roundResults.push({
      roundNum: round,
      winner: result.winner,
      planted: result.planted,
      buyTypeA: attackSide === 'A' ? result.atkBuyType : result.defBuyType,
      buyTypeB: attackSide === 'A' ? result.defBuyType : result.atkBuyType,
    });
  }

  if (scoreA === 12 && scoreB === 12) {
    const { otA, otB } = simOvertimeRounds(localA, localB, attackSide, mapBias, rng);
    scoreA += otA;
    scoreB += otB;
  }

  // Accumulate this map's stats into the series totals.
  statesA.forEach((s, i) => {
    s.kills      += localA[i].kills;
    s.deaths     += localA[i].deaths;
    s.assists    += localA[i].assists;
    s.roundDamage += localA[i].roundDamage;
    s.acs        += localA[i].acs;
  });
  statesB.forEach((s, i) => {
    s.kills      += localB[i].kills;
    s.deaths     += localB[i].deaths;
    s.assists    += localB[i].assists;
    s.roundDamage += localB[i].roundDamage;
    s.acs        += localB[i].acs;
  });

  return {
    mapName,
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? 'A' : 'B',
    roundResults,
  };
}

// ─── Map Veto ─────────────────────────────────────────────────────────────────

// Teams ban the map most favorable to their opponent, pick the map most
// favorable to themselves. Relative scores are pre-computed with a small jitter
// so the same teams always play the same maps (deterministic per-match RNG).
function resolveMapVeto(
  teamA: Team,
  teamB: Team,
  format: 'bo1' | 'bo3' | 'bo5',
  activeMapPool: string[],
  rng: SeededRng
): string[] {
  // relScore > 0 means Team A favored; < 0 means Team B favored.
  const relScores: Record<string, number> = {};
  for (const m of activeMapPool) {
    relScores[m] = (teamA.mapPool[m] ?? 50) - (teamB.mapPool[m] ?? 50) + (rng() - 0.5) * 15;
  }

  // Ban: remove map most advantageous to opponent.
  const ban = (pool: string[], banning: 'A' | 'B'): string[] => {
    const sorted = [...pool].sort((a, b) =>
      banning === 'A'
        ? relScores[a] - relScores[b]   // ascending: A bans its worst (B's best)
        : relScores[b] - relScores[a]   // descending: B bans A's best
    );
    return sorted.slice(1);
  };

  // Pick: select map most advantageous to picker.
  const pick = (pool: string[], picking: 'A' | 'B'): [string, string[]] => {
    const sorted = [...pool].sort((a, b) =>
      picking === 'A'
        ? relScores[b] - relScores[a]   // descending: A picks its best
        : relScores[a] - relScores[b]   // ascending: B picks its best (A's worst)
    );
    return [sorted[0], sorted.slice(1)];
  };

  if (format === 'bo1') {
    // Alternating bans (A first) until 1 map remains: 8 bans from 9-map pool.
    let pool = [...activeMapPool];
    for (let i = 0; i < 8; i++) pool = ban(pool, i % 2 === 0 ? 'A' : 'B');
    return pool;
  }

  if (format === 'bo3') {
    // A ban → B ban → A pick → B pick → A ban → B ban → decider
    let pool = [...activeMapPool];
    pool = ban(pool, 'A');
    pool = ban(pool, 'B');
    const [m1, p1] = pick(pool, 'A'); pool = p1;
    const [m2, p2] = pick(pool, 'B'); pool = p2;
    pool = ban(pool, 'A');
    pool = ban(pool, 'B');
    return [m1, m2, pool[0]];
  }

  // bo5: A ban → B ban → A pick → B pick → B pick → A pick → decider
  let pool = [...activeMapPool];
  pool = ban(pool, 'A');
  pool = ban(pool, 'B');
  const [m1, p1] = pick(pool, 'A'); pool = p1;
  const [m2, p2] = pick(pool, 'B'); pool = p2;
  const [m3, p3] = pick(pool, 'B'); pool = p3;
  const [m4, p4] = pick(pool, 'A'); pool = p4;
  return [m1, m2, m3, m4, pool[0]];
}

// ─── Series Simulation ────────────────────────────────────────────────────────

// VLR Rating 2.0 approximation.
// Components: ACS-based kill contribution, death penalty, reduced assists, ADRa.
// Calibrated so an average pro (KPR≈0.75, DPR≈0.75, APR≈0.30, ADR≈130) → 1.00.
function computePlayerStats(
  matchId: string,
  statesA: PlayerState[],
  statesB: PlayerState[],
  totalRounds: number
): PlayerMatchStat[] {
  return [...statesA, ...statesB].map(s => {
    const r = Math.max(1, totalRounds);
    const adr = s.roundDamage / r;
    const acsPerRound = s.acs / r;
    const dpr = s.deaths / r;
    const apr = s.assists / r;
    // ADRa: damage not already accounted for by kills (avg ~130 dmg/kill)
    const adraNorm = Math.max(0, s.roundDamage - s.kills * 130) / r / 32;

    const rating = clamp(
      (acsPerRound / 250) * 0.60
      - (dpr / 0.75) * 0.24
      + (apr / 0.30) * 0.10
      + adraNorm * 0.10
      + 0.44,
      0, 3
    );
    return {
      playerId: s.id,
      matchId,
      kills:   s.kills,
      deaths:  s.deaths,
      assists: s.assists,
      adr:     Math.round(adr),
      acs:     Math.round(acsPerRound),
      rounds:  totalRounds,
      rating:  Math.round(rating * 100) / 100,
    };
  });
}

export function simMatch(
  matchId: string,
  teamA: Team,
  teamB: Team,
  playersA: Player[],
  playersB: Player[],
  roleRatings: Map<string, PlayerRoleRatingRecord>,
  format: 'bo1' | 'bo3' | 'bo5',
  rng: SeededRng,
  activeMapPool: string[],
  modifiers = { teamAMod: 1.0, teamBMod: 1.0 },
  coachTacticsA = 0,
  coachTacticsB = 0,
  agentMeta: Record<string, number> = {},
  agentMapMeta: Record<string, Record<string, number>> = {},
): MatchResult {
  const maps = resolveMapVeto(teamA, teamB, format, activeMapPool, rng);
  const needed = { bo1: 1, bo3: 2, bo5: 3 }[format];
  let winsA = 0, winsB = 0;
  const mapResults: MapResult[] = [];

  function applyTactics(states: PlayerState[], tactics: number): PlayerState[] {
    if (tactics <= 0) return states;
    const gsMod = 1 + tactics / 500;
    const clutchMod = 1 + tactics / 750;
    return states.map(s => ({
      ...s,
      trueGameSense: Math.min(99, s.trueGameSense * gsMod),
      clutch: Math.min(99, s.clutch * clutchMod),
    }));
  }

  function applyMod(states: PlayerState[], mod: number): PlayerState[] {
    if (mod === 1.0) return states;
    return states.map(s => ({
      ...s,
      trueAim: clamp(s.trueAim * mod, 1, 100),
      trueGameSense: clamp(s.trueGameSense * mod, 1, 100),
    }));
  }

  // Build series-level states — stats accumulate across all maps into these.
  const allStatesA = applyMod(
    applyTactics(playersA.map(p => buildPlayerState(p, roleRatings)), coachTacticsA),
    modifiers.teamAMod
  );
  const allStatesB = applyMod(
    applyTactics(playersB.map(p => buildPlayerState(p, roleRatings)), coachTacticsB),
    modifiers.teamBMod
  );
  let totalRounds = 0;

  for (const mapName of maps) {
    if (winsA >= needed || winsB >= needed) break;
    const mapResult = simMap(teamA, teamB, mapName, allStatesA, allStatesB, rng, agentMeta, agentMapMeta);
    mapResults.push(mapResult);
    totalRounds += mapResult.scoreA + mapResult.scoreB;
    if (mapResult.winner === 'A') winsA++; else winsB++;
  }

  const playerStats = computePlayerStats(matchId, allStatesA, allStatesB, totalRounds);

  const winner = winsA > winsB ? 'A' : 'B';
  const winnerIds = (winner === 'A' ? playersA : playersB).map(p => p.id);
  const mvpStat = playerStats
    .filter(s => winnerIds.includes(s.playerId))
    .sort((a, b) => b.rating - a.rating)[0];

  return {
    winner,
    winsA,
    winsB,
    mapResults,
    mvpId: mvpStat?.playerId ?? null,
    playerStats,
  };
}
