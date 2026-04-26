import type {
  Player, PlayerRoleRatingRecord, PlayerRole, BuyType,
  Team, MatchResult, MapResult, RoundResultSummary, PlayerMatchStat,
} from '../types';
import {
  SIDE_MODS, EQUIP_MOD, KILL_BONUS, WIN_INCOME, SPIKE_PLANT_BONUS,
  CREDIT_CAP, FULL_BUY_THRESHOLD, HALF_BUY_THRESHOLD,
  getLossBonus, SURVIVAL_BONUS, MAP_POOL,
} from '../types';
import type { SeededRng } from './rng';
import { randFloat, randInt, randChoice, shuffle, clamp } from './rng';

// ─── Player State for sim ────────────────────────────────────────────────────

interface PlayerState {
  id: string;
  trueAim: number;
  trueGameSense: number;
  clutch: number;
  morale: number;
  assignedRole: PlayerRole;
  roleRating: number;
  credits: number;
  kills: number;
  deaths: number;
  assists: number;
  roundDamage: number;
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
  return base * roleMultiplier * equipMod * sideMod * moraleMod;
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

// ─── Round Stats Generation ───────────────────────────────────────────────────

interface RoundOutcome {
  survived: boolean;
  kills: number;
  planted: boolean;
  damage: number;
}

function generateRoundStats(
  attackers: PlayerState[],
  defenders: PlayerState[],
  attackerWins: boolean,
  planted: boolean,
  rng: SeededRng
): { attackerOutcomes: RoundOutcome[]; defenderOutcomes: RoundOutcome[] } {
  // Distribute kills
  const totalKills = randInt(rng, 2, 5);
  const attackerOutcomes: RoundOutcome[] = attackers.map(() => ({
    survived: false, kills: 0, planted, damage: 0,
  }));
  const defenderOutcomes: RoundOutcome[] = defenders.map(() => ({
    survived: false, kills: 0, planted: false, damage: 0,
  }));

  // Winning team survives more
  const attackerSurvivors = attackerWins ? randInt(rng, 1, 3) : randInt(rng, 0, 1);
  const defenderSurvivors = !attackerWins ? randInt(rng, 1, 3) : randInt(rng, 0, 1);

  // Mark survivors randomly
  const atkIndices = shuffle(rng, [0, 1, 2, 3, 4]);
  const defIndices = shuffle(rng, [0, 1, 2, 3, 4]);
  atkIndices.slice(0, attackerSurvivors).forEach(i => { attackerOutcomes[i].survived = true; });
  defIndices.slice(0, defenderSurvivors).forEach(i => { defenderOutcomes[i].survived = true; });

  // Assign kills weighted by combat power
  for (let k = 0; k < totalKills; k++) {
    const killerIsAttacker = rng() < (attackerWins ? 0.6 : 0.4);
    if (killerIsAttacker) {
      const idx = Math.floor(rng() * 5);
      attackerOutcomes[idx].kills++;
    } else {
      const idx = Math.floor(rng() * 5);
      defenderOutcomes[idx].kills++;
    }
  }

  // Assign damage
  [...attackerOutcomes, ...defenderOutcomes].forEach(o => {
    o.damage = o.kills * randInt(rng, 100, 180) + randInt(rng, 0, 80);
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

  const attackerWins = rng() < finalAtkPower / (finalAtkPower + finalDefPower);
  const { attackerOutcomes, defenderOutcomes } =
    generateRoundStats(attackers, defenders, attackerWins, planted, rng);

  return {
    winner: attackerWins ? 'attack' : 'defense',
    planted,
    atkBuyType,
    defBuyType,
    attackerOutcomes,
    defenderOutcomes,
  };
}

// ─── OT Rounds ────────────────────────────────────────────────────────────────

function simOvertimeRounds(
  teamAPlayers: PlayerState[],
  teamBPlayers: PlayerState[],
  lastAttackSide: 'A' | 'B',
  rng: SeededRng
): { otA: number; otB: number } {
  // Sides switch at OT start: whoever attacked last in regulation now defends.
  // Sides then alternate every round. Play until one team leads by 2.
  let otAttackSide: 'A' | 'B' = lastAttackSide === 'A' ? 'B' : 'A';
  let otA = 0, otB = 0;

  for (let i = 0; i < 40; i++) {
    const freshEcon: PlayerEconomy[] = [0,1,2,3,4].map(j => ({ playerId: `ot${j}`, credits: 5000 }));
    const atk = otAttackSide === 'A' ? teamAPlayers : teamBPlayers;
    const def = otAttackSide === 'A' ? teamBPlayers : teamAPlayers;
    const r = simRound(atk, def, freshEcon, freshEcon, 0, 0, 99, null, null, rng);
    const aWon = (otAttackSide === 'A') === (r.winner === 'attack');
    if (aWon) otA++; else otB++;
    if (Math.abs(otA - otB) >= 2) break;
    otAttackSide = otAttackSide === 'A' ? 'B' : 'A';
  }

  // Pathological fallback (probability ~(0.5)^20 ≈ negligible)
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
    trueAim: player.trueAim,
    trueGameSense: player.trueGameSense,
    clutch: player.clutch,
    morale: player.morale,
    assignedRole: player.primaryRole,
    roleRating: rr?.trueRating ?? 60,
    credits: 800,
    kills: 0,
    deaths: 0,
    assists: 0,
    roundDamage: 0,
  };
}

function simMap(
  teamA: Team,
  teamB: Team,
  mapName: string,
  playersA: Player[],
  playersB: Player[],
  roleRatings: Map<string, PlayerRoleRatingRecord>,
  rng: SeededRng,
  modA = 1.0,
  modB = 1.0
): MapResult {
  const statesA = playersA.map(p => {
    const s = buildPlayerState(p, roleRatings);
    s.trueAim = clamp(s.trueAim * modA, 1, 100);
    s.trueGameSense = clamp(s.trueGameSense * modA, 1, 100);
    return s;
  });
  const statesB = playersB.map(p => {
    const s = buildPlayerState(p, roleRatings);
    s.trueAim = clamp(s.trueAim * modB, 1, 100);
    s.trueGameSense = clamp(s.trueGameSense * modB, 1, 100);
    return s;
  });

  const econA: PlayerEconomy[] = statesA.map(s => ({ playerId: s.id, credits: 800 }));
  const econB: PlayerEconomy[] = statesB.map(s => ({ playerId: s.id, credits: 800 }));

  // Map pool practice bonus
  const practiceA = teamA.mapPool[mapName] ?? 50;
  const practiceB = teamB.mapPool[mapName] ?? 50;
  const mapBonusA = 1.0 + (practiceA - 50) * 0.001;
  const mapBonusB = 1.0 + (practiceB - 50) * 0.001;
  statesA.forEach(s => { s.trueAim *= mapBonusA; s.trueGameSense *= mapBonusA; });
  statesB.forEach(s => { s.trueAim *= mapBonusB; s.trueGameSense *= mapBonusB; });

  let scoreA = 0, scoreB = 0;
  let attackSide: 'A' | 'B' = 'A';
  let lossStreakA = 0, lossStreakB = 0;
  let prevAtkBuy: BuyType | null = null;
  let prevDefBuy: BuyType | null = null;
  const roundResults: RoundResultSummary[] = [];

  for (let round = 1; round <= 24; round++) {
    if (scoreA >= 13 || scoreB >= 13) break;
    if (round === 13) attackSide = attackSide === 'A' ? 'B' : 'A';

    const atk = attackSide === 'A' ? statesA : statesB;
    const def = attackSide === 'A' ? statesB : statesA;
    const atkEcon = attackSide === 'A' ? econA : econB;
    const defEcon = attackSide === 'A' ? econB : econA;
    const atkStreak = attackSide === 'A' ? lossStreakA : lossStreakB;
    const defStreak = attackSide === 'A' ? lossStreakB : lossStreakA;

    const result = simRound(
      atk, def, atkEcon, defEcon,
      atkStreak, defStreak, round,
      prevAtkBuy, prevDefBuy, rng
    );

    prevAtkBuy = result.atkBuyType;
    prevDefBuy = result.defBuyType;

    const aWon = attackSide === 'A'
      ? result.winner === 'attack'
      : result.winner === 'defense';

    if (aWon) { scoreA++; lossStreakA = 0; lossStreakB++; }
    else       { scoreB++; lossStreakB = 0; lossStreakA++; }

    // Update economies
    const atkOutcomes = result.attackerOutcomes;
    const defOutcomes = result.defenderOutcomes;
    const atkTeamWon = result.winner === 'attack';

    atkEcon.forEach((econ, i) => {
      const o = atkOutcomes[i];
      atkEcon[i] = updateEconomy(econ, { ...o, planted: result.planted }, atkTeamWon, atkStreak, true);
    });
    defEcon.forEach((econ, i) => {
      const o = defOutcomes[i];
      defEcon[i] = updateEconomy(econ, { ...o, planted: false }, !atkTeamWon, defStreak, false);
    });

    // Accumulate stats back to player states
    atk.forEach((s, i) => {
      s.kills += atkOutcomes[i].kills;
      s.roundDamage += atkOutcomes[i].damage;
      if (!atkOutcomes[i].survived) s.deaths++;
    });
    def.forEach((s, i) => {
      s.kills += defOutcomes[i].kills;
      s.roundDamage += defOutcomes[i].damage;
      if (!defOutcomes[i].survived) s.deaths++;
    });

    roundResults.push({
      roundNum: round,
      winner: result.winner,
      planted: result.planted,
      buyTypeA: attackSide === 'A' ? result.atkBuyType : result.defBuyType,
      buyTypeB: attackSide === 'A' ? result.defBuyType : result.atkBuyType,
    });
  }

  // OT
  if (scoreA === 12 && scoreB === 12) {
    const { otA, otB } = simOvertimeRounds(statesA, statesB, attackSide, rng);
    scoreA += otA;
    scoreB += otB;
  }

  return {
    mapName,
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? 'A' : 'B',
    roundResults,
  };
}

// ─── Map Veto (simplified) ────────────────────────────────────────────────────

function resolveMapVeto(
  teamA: Team,
  teamB: Team,
  format: 'bo1' | 'bo3' | 'bo5',
  rng: SeededRng
): string[] {
  const needed = { bo1: 1, bo3: 3, bo5: 5 }[format];
  const pool = [...MAP_POOL];
  // Sort by average team practice preference
  pool.sort((a, b) => {
    const scoreA = (teamA.mapPool[a] ?? 50) + (teamB.mapPool[a] ?? 50);
    const scoreB = (teamA.mapPool[b] ?? 50) + (teamB.mapPool[b] ?? 50);
    return scoreB - scoreA + (rng() - 0.5) * 20;
  });
  return pool.slice(0, needed);
}

// ─── Series Simulation ────────────────────────────────────────────────────────

function computePlayerStats(
  matchId: string,
  statesA: PlayerState[],
  statesB: PlayerState[],
  totalRounds: number
): PlayerMatchStat[] {
  const allStates = [...statesA, ...statesB];
  return allStates.map(s => {
    const kd = s.deaths === 0 ? s.kills : s.kills / s.deaths;
    const adr = totalRounds > 0 ? s.roundDamage / totalRounds : 0;
    const rating = clamp((kd * 0.5 + adr / 150 * 0.5), 0, 3);
    return {
      playerId: s.id,
      matchId,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      adr: Math.round(adr),
      rating: Math.round(rating * 100) / 100,
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
  modifiers = { teamAMod: 1.0, teamBMod: 1.0 },
  coachTacticsA = 0,
  coachTacticsB = 0
): MatchResult {
  const maps = resolveMapVeto(teamA, teamB, format, rng);
  const needed = { bo1: 1, bo3: 2, bo5: 3 }[format];
  let winsA = 0, winsB = 0;
  const mapResults: MapResult[] = [];

  // Apply tactics boost: boosts effective gameSense (×0.20 max) and clutch (×0.13 max) per player
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

  const allStatesA: PlayerState[] = applyTactics(playersA.map(p => buildPlayerState(p, roleRatings)), coachTacticsA);
  const allStatesB: PlayerState[] = applyTactics(playersB.map(p => buildPlayerState(p, roleRatings)), coachTacticsB);
  let totalRounds = 0;

  for (const mapName of maps) {
    if (winsA >= needed || winsB >= needed) break;
    const mapResult = simMap(
      teamA, teamB, mapName,
      playersA, playersB, roleRatings, rng,
      modifiers.teamAMod, modifiers.teamBMod
    );
    mapResults.push(mapResult);
    totalRounds += mapResult.scoreA + mapResult.scoreB;
    if (mapResult.winner === 'A') winsA++; else winsB++;
  }

  const playerStats = computePlayerStats(matchId, allStatesA, allStatesB, totalRounds);

  // MVP = highest rated player on winning team
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
