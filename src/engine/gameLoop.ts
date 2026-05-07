import type {
  GameState, ScheduledMatch, Player, Team, Organization, League,
  StandingsRow, PlayoffMatch, PlayerRole, Coach,
  Contract, TransferOffer, TransferStatus, SplitRecord, SeasonRecord,
  PlayerRoleRatingRecord, RegionId, InternationalTournament,
} from '../types';
import {
  MORALE_BASELINE, MORALE_DECAY_RATE, MORALE_WIN_DELTA, MORALE_LOSS_DELTA,
  PLAYER_WIN_DELTA, PLAYER_LOSS_DELTA,
  HOME_NATIONALITIES, IMPORT_LIMITS, MAP_POOL, AGENT_BASELINES, PRACTICE_BUDGET,
  AGENT_MAP_AFFINITY, AGENT_ROLE,
} from '../types';
import type { SeededRng } from './rng';
import { createRng, randFloat, clamp } from './rng';
import { developPlayer, applyAgingEffects, updateRoleRatings } from './playerGen';
import { simMatch } from './matchSim';
import {
  updateStandingsAfterMatch, sortStandings, buildPlayoffBracket,
  getGrandFinalFatigueMod, generateSchedule, initStandings, pickInitialMapPool,
} from './leagueInit';
import {
  buildMastersQualifiedTeams, buildChampionsQualifiedTeams,
  buildTournament, awardPlayoffChampionsPoints, awardMastersTournamentPoints,
  simMastersRound, simChampionsRound, MASTERS_ROUNDS, CHAMPIONS_ROUNDS,
} from './internationalTournament';

let _nextNotifId = 1;
function notifId() { return `notif_${_nextNotifId++}`; }

// ─── Morale ───────────────────────────────────────────────────────────────────

function updateMorale(player: Player): Player {
  const next = player.morale + (MORALE_BASELINE - player.morale) * MORALE_DECAY_RATE;
  return { ...player, morale: Math.round(next) };
}

// Returns the combined effective value of a coach stat (head full, assistant half)
export function effectiveCoachStat(
  team: Team,
  coaches: Map<string, Coach>,
  stat: 'tactics' | 'scouting' | 'moraleBoost'
): number {
  const head = team.headCoachId ? coaches.get(team.headCoachId) : null;
  const asst = team.assistantCoachId ? coaches.get(team.assistantCoachId) : null;
  return (head?.[stat] ?? 0) + (asst?.[stat] ?? 0) * 0.5;
}

function applyMatchMorale(
  team: Team,
  players: Map<string, Player>,
  won: boolean,
  moraleBoost: number
): void {
  const boostFactor = moraleBoost / 99;
  const teamDelta = won
    ? MORALE_WIN_DELTA * (1 + boostFactor * 0.5)
    : MORALE_LOSS_DELTA * (1 - boostFactor * 0.5);
  team.morale = Math.max(0, Math.min(100, team.morale + teamDelta));

  const playerDelta = won
    ? PLAYER_WIN_DELTA + Math.round(boostFactor * 3)
    : PLAYER_LOSS_DELTA + Math.round(boostFactor * 3);
  team.rosterIds.forEach(id => {
    const p = players.get(id);
    if (p) {
      players.set(id, { ...p, morale: Math.max(0, Math.min(100, p.morale + playerDelta)) });
    }
  });
}

// ─── Weekly tick helpers ──────────────────────────────────────────────────────

function getAllMatchesForWeek(state: GameState): ScheduledMatch[] {
  const out: ScheduledMatch[] = [];
  state.matches.forEach(m => {
    if (m.season === state.season && m.week === state.week && !m.isPlayoff) {
      out.push(m);
    }
  });
  return out;
}

function getRosterPlayers(state: GameState, teamId: string): Player[] {
  const team = state.teams.get(teamId);
  if (!team) return [];
  return team.rosterIds.map(id => state.players.get(id)!).filter(Boolean);
}

// ─── Map Pool Rotation ────────────────────────────────────────────────────────

function rotateMapPool(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 9999 + 777);
  const roll = rng();
  const swapCount = roll < 0.60 ? 0 : roll < 0.90 ? 1 : 2;
  if (swapCount === 0) return state;

  const current = [...state.activeMapPool];
  const reserve = MAP_POOL.filter(m => !current.includes(m));
  const removed: string[] = [];
  const added: string[] = [];

  for (let i = 0; i < swapCount && reserve.length > 0; i++) {
    const ri = Math.floor(rng() * current.length);
    const ai = Math.floor(rng() * reserve.length);
    removed.push(current.splice(ri, 1)[0]);
    const newMap = reserve.splice(ai, 1)[0];
    current.push(newMap);
    added.push(newMap);
  }

  state.activeMapPool = current;

  // Clear practice allocation for removed maps so points are freed for the player.
  const playerTeam = state.teams.get(state.playerTeamId);
  if (playerTeam?.practiceAllocation) {
    const cleaned = { ...playerTeam.practiceAllocation };
    removed.forEach(m => { delete cleaned[m]; });
    state.teams.set(state.playerTeamId, { ...playerTeam, practiceAllocation: cleaned });
  }

  state.notifications.push({
    id: notifId(),
    type: 'development',
    title: 'Map Pool Update',
    body: `${removed.join(', ')} removed — ${added.join(', ')} added`,
    week: state.week,
    read: false,
  });

  return state;
}

// ─── Practice Allocation ─────────────────────────────────────────────────────

function applyPracticeAllocation(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 9001 + state.week * 137);

  state.teams.forEach((team, teamId) => {
    const pool = team.mapPool ?? {};
    const newPool = { ...pool };

    if (teamId === state.playerTeamId) {
      // Player team: use explicit allocation
      const allocation = team.practiceAllocation ?? {};
      for (const mapName of MAP_POOL) {
        const pts = allocation[mapName] ?? 0;
        const current = newPool[mapName] ?? 50;
        if (pts > 0) {
          const rawGain = pts * 2;
          const diminishing = rawGain * (1 - current / 120);
          newPool[mapName] = Math.min(100, current + diminishing);
        } else {
          newPool[mapName] = Math.max(0, current - 0.5);
        }
      }
    } else {
      // AI teams: seeded random drift — active maps trend toward 60, reserve maps decay
      for (const mapName of MAP_POOL) {
        const current = newPool[mapName] ?? 50;
        if (state.activeMapPool.includes(mapName)) {
          const drift = randFloat(rng, -1, 2.5) + (60 - current) * 0.015;
          newPool[mapName] = Math.min(100, Math.max(0, current + drift));
        } else {
          newPool[mapName] = Math.max(0, current - 0.3);
        }
      }
    }

    state.teams.set(teamId, { ...team, mapPool: newPool });
  });

  return state;
}

// ─── Agent Map Meta ───────────────────────────────────────────────────────────

function buildInitialAgentMapMeta(
  agentMeta: Record<string, number>,
  mapPool: string[],
  rng: SeededRng
): Record<string, Record<string, number>> {
  const meta: Record<string, Record<string, number>> = {};
  for (const agent of Object.keys(agentMeta)) {
    meta[agent] = {};
    for (const mapName of mapPool) {
      const base = AGENT_MAP_AFFINITY[agent]?.[mapName] ?? 0;
      meta[agent][mapName] = clamp(base + randFloat(rng, -0.02, 0.02), -0.15, 0.15);
    }
  }
  return meta;
}

// ─── Agent Patch ──────────────────────────────────────────────────────────────

function applyAgentPatch(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 7777 + 333);
  const totalSlots = Object.values(state.agentPickCounts).reduce((a, b) => a + b, 0);

  const nerfs: string[] = [];
  const buffs: string[] = [];

  for (const [agent, currentStrength] of Object.entries(state.agentMeta)) {
    const pickCount = state.agentPickCounts[agent] ?? 0;
    const pickRate = totalSlots > 0 ? pickCount / totalSlots : 1 / 24;

    let delta = randFloat(rng, -8, 8);
    if (pickRate > 0.12) delta -= randFloat(rng, 8, 18);
    if (pickRate < 0.02) delta += randFloat(rng, 8, 18);
    if (currentStrength > 80) delta -= randFloat(rng, 5, 15);
    if (currentStrength < 20) delta += randFloat(rng, 5, 15);

    const newStrength = clamp(currentStrength + delta, 15, 90);
    const actualDelta = newStrength - currentStrength;
    state.agentMeta[agent] = newStrength;

    if (actualDelta <= -5) nerfs.push(`  ${agent}  ${Math.round(actualDelta)}  (${Math.round(pickRate * 100)}% pick rate)`);
    else if (actualDelta >= 5) buffs.push(`  ${agent}  +${Math.round(actualDelta)}  (${Math.round(pickRate * 100)}% pick rate)`);
  }

  // Map-specific drift — mean-revert toward AGENT_MAP_AFFINITY base
  for (const agent of Object.keys(state.agentMeta)) {
    if (!state.agentMapMeta[agent]) state.agentMapMeta[agent] = {};
    for (const mapName of state.activeMapPool) {
      const base = AGENT_MAP_AFFINITY[agent]?.[mapName] ?? 0;
      const current = state.agentMapMeta[agent][mapName] ?? base;
      const reversion = (base - current) * 0.2;
      state.agentMapMeta[agent][mapName] = clamp(current + reversion + randFloat(rng, -0.02, 0.02), -0.15, 0.15);
    }
  }

  const calSeason = Math.ceil(state.season / 3);
  const splitNum = ((state.season - 1) % 3) + 1;
  const lines: string[] = [];
  if (nerfs.length > 0) { lines.push('NERFS'); nerfs.forEach(l => lines.push(l)); }
  if (buffs.length > 0) { lines.push('BUFFS'); buffs.forEach(l => lines.push(l)); }
  if (lines.length === 0) lines.push('No significant changes this patch.');

  state.notifications.push({
    id: notifId(),
    type: 'development',
    title: `Patch S${calSeason}E${splitNum} — Agent Updates`,
    body: lines.join('\n'),
    week: state.week,
    read: false,
  });

  state.agentPickCounts = {};
  return state;
}

// ─── Regular Season Simulation ────────────────────────────────────────────────

function simWeekMatches(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 1000 + state.week);
  const weekMatches = getAllMatchesForWeek(state);
  const partnershipLeagueIds = new Set([state.leagueId, ...state.otherLeagueIds]);

  for (const match of weekMatches) {
    if (match.result) continue;
    const teamA = state.teams.get(match.teamAId);
    const teamB = state.teams.get(match.teamBId);
    if (!teamA || !teamB) continue;

    const playersA = getRosterPlayers(state, match.teamAId);
    const playersB = getRosterPlayers(state, match.teamBId);

    const tacticsA = effectiveCoachStat(teamA, state.coaches, 'tactics');
    const tacticsB = effectiveCoachStat(teamB, state.coaches, 'tactics');

    const result = simMatch(
      match.id, teamA, teamB, playersA, playersB,
      state.roleRatings, match.format, rng, state.activeMapPool,
      { teamAMod: 1.0, teamBMod: 1.0 }, tacticsA, tacticsB,
      state.agentMeta, state.agentMapMeta, false,
    );

    // Track agent picks for patch calculation
    for (const p of [...playersA, ...playersB]) {
      state.agentPickCounts[p.mainAgent] = (state.agentPickCounts[p.mainAgent] ?? 0) + 1;
    }

    const updated = { ...match, result };
    state.matches.set(match.id, updated);
    state.dirtyMatches.add(match.id);

    // Update standings
    updateStandingsAfterMatch(state.standings, match.leagueId, state.season, updated);

    // Morale
    const aWon = result.winner === 'A';
    applyMatchMorale(teamA, state.players, aWon, effectiveCoachStat(teamA, state.coaches, 'moraleBoost'));
    applyMatchMorale(teamB, state.players, !aWon, effectiveCoachStat(teamB, state.coaches, 'moraleBoost'));

    // Champions Points: +1 to winner for partnership league matches
    if (partnershipLeagueIds.has(match.leagueId)) {
      const winner = aWon ? teamA : teamB;
      winner.championsPoints = (winner.championsPoints ?? 0) + 1;
    }

    // Notify player about their team's match
    if (match.teamAId === state.playerTeamId || match.teamBId === state.playerTeamId) {
      const isA = match.teamAId === state.playerTeamId;
      const playerWon = isA ? aWon : !aWon;
      const opponentId = isA ? match.teamBId : match.teamAId;
      const opponent = state.teams.get(opponentId);
      state.notifications.push({
        id: notifId(),
        type: 'match_result',
        title: playerWon ? 'Victory!' : 'Defeat',
        body: `Your team ${playerWon ? 'won' : 'lost'} vs ${opponent?.name ?? 'Unknown'} ${result.winsA}-${result.winsB}`,
        week: state.week,
        read: false,
      });
    }
  }

  return state;
}

// ─── Weekly player tick ───────────────────────────────────────────────────────

// Deterministic [-1, 1] noise from a string key — used for stable initial scouted estimates
function stableNoise(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) / 0x100000000) * 2 - 1;
}

function weeklyCoachScoutingTick(state: GameState): GameState {
  const team = state.teams.get(state.playerTeamId);
  if (!team) return state;

  const effectiveScouting = effectiveCoachStat(team, state.coaches, 'scouting');

  // Confidence gain per week: up to ~1.5 pts/week at max combined scouting
  const confidenceGain = effectiveScouting / 66;

  const allPlayerIds = new Set([...team.rosterIds, ...team.subIds]);
  state.roleRatings.forEach((rr, key) => {
    if (!allPlayerIds.has(rr.playerId)) return;
    if (rr.scoutedRating === null) {
      // First exposure — initialize with noise inversely proportional to scouting quality.
      // Higher scouting = tighter initial estimate (noiseRange 5–30).
      const noiseRange = 30 - (effectiveScouting / 99) * 25;
      const scoutedRating = Math.round(
        Math.max(0, Math.min(100, rr.trueRating + stableNoise(key) * noiseRange))
      );
      const initConf = Math.round(30 + (effectiveScouting / 99) * 35); // 30–65%
      state.roleRatings.set(key, { ...rr, scoutedRating, scoutConfidence: initConf });
    } else {
      const newConf = Math.min(100, rr.scoutConfidence + confidenceGain);
      state.roleRatings.set(key, { ...rr, scoutConfidence: Math.round(newConf) });
    }
  });

  return state;
}

function weeklyPlayerTick(state: GameState): GameState {
  state.players.forEach((player, id) => {
    const developed = developPlayer(player);
    const moraleUpdated = updateMorale(developed);
    state.players.set(id, moraleUpdated);
    state.dirtyPlayers.add(id);
  });
  return weeklyCoachScoutingTick(state);
}

// ─── Contract expiry notifications ───────────────────────────────────────────

function checkContractExpiry(state: GameState): GameState {
  // Only warn in week 1 of the final split of a calendar year (season % 3 === 0)
  // so players get advance notice that their contract expires this offseason.
  if (state.season % 3 !== 0 || state.week !== 1) return state;

  const playerTeam = state.teams.get(state.playerTeamId);
  if (!playerTeam) return state;

  playerTeam.rosterIds.concat(playerTeam.subIds).forEach(playerId => {
    const player = state.players.get(playerId);
    if (!player?.contractId) return;
    const contract = state.contracts.get(player.contractId);
    if (!contract || contract.endSeason !== state.season) return;

    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Contract Expiring This Split',
      body: `${player.alias}'s contract expires at the end of this calendar year.`,
      week: state.week,
      read: false,
      data: { playerId },
    });
  });
  return state;
}

// ─── League history builders ──────────────────────────────────────────────────
// One split = one complete game-season (regular season + playoffs).
// Three splits = one calendar season shown in History.

function aggregatePlayerRatings(
  regularMatches: ScheduledMatch[],
  playoffMatches: PlayoffMatch[],
): Map<string, { total: number; games: number }> {
  const totals = new Map<string, { total: number; games: number }>();
  for (const m of regularMatches) {
    if (!m.result) continue;
    for (const ps of m.result.playerStats) {
      const curr = totals.get(ps.playerId) ?? { total: 0, games: 0 };
      totals.set(ps.playerId, { total: curr.total + ps.rating, games: curr.games + 1 });
    }
  }
  for (const m of playoffMatches) {
    if (!m.result) continue;
    for (const ps of m.result.playerStats) {
      const curr = totals.get(ps.playerId) ?? { total: 0, games: 0 };
      totals.set(ps.playerId, { total: curr.total + ps.rating, games: curr.games + 1 });
    }
  }
  return totals;
}

function buildSplitRecord(state: GameState, gameSeason: number): SplitRecord | null {
  const calendarSeason = Math.ceil(gameSeason / 3);
  const splitNum = ((gameSeason - 1) % 3) + 1;

  const winnerTeamId = state.playoffBracket?.champion ?? '';
  const gfMatch = state.playoffBracket?.matches.find(m => m.round === 'GF');
  const runnerUpTeamId = gfMatch?.result
    ? (gfMatch.result.winner === 'A' ? gfMatch.teamBId ?? '' : gfMatch.teamAId ?? '')
    : '';

  const regularMatches = [...state.matches.values()].filter(
    m => m.leagueId === state.leagueId && m.season === gameSeason && !!m.result,
  );
  const playoffMatches = (state.playoffBracket?.matches ?? []).filter(m => m.result !== null);
  const playerTotals = aggregatePlayerRatings(regularMatches, playoffMatches);

  let mvpPlayerId = '';
  let bestRating = -Infinity;
  playerTotals.forEach((v, id) => {
    const avg = v.total / v.games;
    if (avg > bestRating) { bestRating = avg; mvpPlayerId = id; }
  });

  if (!winnerTeamId && !mvpPlayerId) return null;
  return { calendarSeason, splitNum, winnerTeamId, runnerUpTeamId, mvpPlayerId };
}

// Season record is only captured at the end of every 3rd game-season.
// Awards are derived from the final split's data (the only season still in memory).
function buildSeasonRecord(state: GameState, gameSeason: number): SeasonRecord | null {
  if (gameSeason % 3 !== 0) return null;
  const calendarSeason = Math.ceil(gameSeason / 3);

  const regularMatches = [...state.matches.values()].filter(
    m => m.leagueId === state.leagueId && m.season === gameSeason && !!m.result,
  );
  const playoffMatches = (state.playoffBracket?.matches ?? []).filter(m => m.result !== null);
  const playerTotals = aggregatePlayerRatings(regularMatches, playoffMatches);
  if (playerTotals.size === 0) return null;

  let mvpPlayerId = '';
  let bestRating = -Infinity;
  const bestByRole: Record<string, { playerId: string; rating: number }> = {
    duelist:    { playerId: '', rating: -Infinity },
    initiator:  { playerId: '', rating: -Infinity },
    controller: { playerId: '', rating: -Infinity },
    sentinel:   { playerId: '', rating: -Infinity },
  };

  playerTotals.forEach((v, playerId) => {
    const avg = v.total / v.games;
    if (avg > bestRating) { bestRating = avg; mvpPlayerId = playerId; }
    const role = state.players.get(playerId)?.primaryRole;
    if (role && avg > bestByRole[role].rating) bestByRole[role] = { playerId, rating: avg };
  });

  return {
    season: calendarSeason,
    championTeamId: state.playoffBracket?.champion ?? '',
    mvpPlayerId,
    bestDuelistId:    bestByRole.duelist.playerId,
    bestInitiatorId:  bestByRole.initiator.playerId,
    bestControllerId: bestByRole.controller.playerId,
    bestSentinelId:   bestByRole.sentinel.playerId,
  };
}

// ─── Tournament helpers ───────────────────────────────────────────────────────

export function isTeamAliveInTournament(
  t: InternationalTournament,
  teamId: string,
): boolean {
  if (!t.qualifiedTeams.some(s => s.teamId === teamId)) return false;

  const playIn = t.playInBracket;
  if (t.name !== 'Champions' && playIn) {
    const swissLosses = playIn.matches.filter(m =>
      m.id.startsWith('SW_') && m.result &&
      ((m.teamAId === teamId && m.result.winner === 'B') ||
       (m.teamBId === teamId && m.result.winner === 'A'))
    ).length;
    if (swissLosses >= 2) return false;
  } else if (t.name === 'Champions' && playIn) {
    const groupElim = playIn.matches.some(m =>
      (m.id.includes('_LBR1') || m.id.includes('_LBF')) && m.result &&
      ((m.teamAId === teamId && m.result.winner === 'B') ||
       (m.teamBId === teamId && m.result.winner === 'A'))
    );
    if (groupElim) return false;
  }

  if (t.mainBracket) {
    const lbLoss = t.mainBracket.matches.some(m =>
      m.bracket === 'lower' && m.result &&
      ((m.teamAId === teamId && m.result.winner === 'B') ||
       (m.teamBId === teamId && m.result.winner === 'A'))
    );
    if (lbLoss) return false;
  }

  return true;
}

// ─── Phase transitions ────────────────────────────────────────────────────────

function checkPhaseTransition(state: GameState): GameState {
  const league = state.leagues.get(state.leagueId);
  if (!league) return state;

  const maxRegularWeek = league.format.regularSeasonWeeks;

  if (state.phase === 'regular_season' && state.week > maxRegularWeek) {
    // Transition to playoffs — eagerly simulate other leagues' full playoffs
    state = simOtherLeaguesPlayoffs(state);

    state.phase = 'playoffs';
    state.week = 1;

    const standingsArr: StandingsRow[] = [];
    state.standings.forEach(row => {
      if (row.leagueId === state.leagueId && row.season === state.season) {
        standingsArr.push(row);
      }
    });

    const sorted = sortStandings(standingsArr);
    const groupAIds = league.groups?.groupA ?? [];
    const groupBIds = league.groups?.groupB ?? [];

    const groupA = sortStandings(sorted.filter(r => groupAIds.includes(r.teamId)));
    const groupB = sortStandings(sorted.filter(r => groupBIds.includes(r.teamId)));

    // Top 4 from each group
    const seeds = [
      groupA[0]?.teamId, groupB[0]?.teamId,
      groupA[1]?.teamId, groupB[1]?.teamId,
      groupA[2]?.teamId, groupB[2]?.teamId,
      groupA[3]?.teamId, groupB[3]?.teamId,
    ].filter(Boolean) as string[];

    const bracket = buildPlayoffBracket(state.leagueId, state.season, seeds);
    state.playoffBracket = bracket;

    state.notifications.push({
      id: notifId(),
      type: 'playoff',
      title: 'Playoffs Begin!',
      body: 'Regular season is over. The playoff bracket is set.',
      week: state.week,
      read: false,
    });
  } else if (state.phase === 'playoffs' && state.playoffBracket?.champion) {
    const splitRec = buildSplitRecord(state, state.season);
    if (splitRec) state.splitHistory = [...state.splitHistory, splitRec];
    const seasonRec = buildSeasonRecord(state, state.season);
    if (seasonRec) state.seasonHistory = [...state.seasonHistory, seasonRec];

    // Award playoff Champions Points for all regions
    const isSplit3 = state.season % 3 === 0;
    awardPlayoffChampionsPoints(state, state.playoffBracket, isSplit3);
    state.otherPlayoffBrackets.forEach(bracket =>
      awardPlayoffChampionsPoints(state, bracket, isSplit3)
    );

    // Build inter-split international tournament
    const splitNum = ((state.season - 1) % 3 + 1) as 1 | 2 | 3;
    const calendarSeason = Math.ceil(state.season / 3);
    const tournamentName: InternationalTournament['name'] =
      splitNum === 1 ? 'Masters 1' : splitNum === 2 ? 'Masters 2' : 'Champions';
    const qualifiedTeams = splitNum === 3
      ? buildChampionsQualifiedTeams(state)
      : buildMastersQualifiedTeams(state);
    state.activeInternationalTournament = buildTournament(
      tournamentName, calendarSeason, splitNum, qualifiedTeams,
    );

    state.phase = 'inter_tournament';
    state.week = 1;
    state.notifications.push({
      id: notifId(),
      type: 'playoff',
      title: tournamentName,
      body: `${tournamentName} begins! ${qualifiedTeams.length} teams from all 4 regions compete.`,
      week: state.week,
      read: false,
    });
  } else if (state.phase === 'inter_tournament') {
    const t = state.activeInternationalTournament;
    if (t?.phase === 'complete') {
      if (t.name !== 'Champions') awardMastersTournamentPoints(state, t);
      state.tournamentHistory = [...state.tournamentHistory, t];
      state.activeInternationalTournament = null;
      const winnerName = t.champion ? (state.teams.get(t.champion)?.name ?? '') : '';
      state.phase = 'offseason';
      state.week = 1;
      state.notifications.push({
        id: notifId(),
        type: 'playoff',
        title: `${t.name} Complete`,
        body: `${winnerName} wins ${t.name}! Entering offseason.`,
        week: state.week,
        read: false,
      });
    }
  } else if (state.phase === 'offseason' && state.week > (state.season % 3 === 0 ? 4 : 1)) {
    // New season
    state.season++;
    state.act = 1;
    state.week = 1;
    state.phase = 'regular_season';
    state.playoffBracket = null;

    // Transfer window closed — clear all offers
    state.transferOffers = [];

    // Collect roles each player actually played this split from mapComps
    const rolesPlayedByPlayer = new Map<string, Set<PlayerRole>>();
    state.teams.forEach(team => {
      if (!team.mapComps) return;
      for (const [mapName, agents] of Object.entries(team.mapComps)) {
        if (!state.activeMapPool.includes(mapName)) continue;
        agents.forEach((agent, i) => {
          const playerId = team.rosterIds[i];
          if (!playerId || !agent) return;
          const role = AGENT_ROLE[agent];
          if (!role) return;
          if (!rolesPlayedByPlayer.has(playerId)) rolesPlayedByPlayer.set(playerId, new Set());
          rolesPlayedByPlayer.get(playerId)!.add(role);
        });
      }
    });

    // Age & develop players
    state.players.forEach((player, id) => {
      const aged = applyAgingEffects(player);
      state.players.set(id, aged);
      state.dirtyPlayers.add(id);

      // Update role ratings
      const playedRoles = rolesPlayedByPlayer.get(id);
      state.roleRatings.forEach((rr, rrId) => {
        if (rr.playerId === id) {
          const withSeason = playedRoles?.has(rr.role)
            ? { ...rr, lastPlayedSeason: state.season }
            : rr;
          const updated = updateRoleRatings(aged, withSeason, state.season);
          state.roleRatings.set(rrId, updated);
        }
      });
    });

    // Reset team records; also reset Champions Points at the start of each calendar year
    const newCalendarYear = state.season % 3 === 1;
    state.teams.forEach(team => {
      state.teams.set(team.id, {
        ...team,
        wins: 0, losses: 0, roundDiff: 0, mapDiff: 0, points: 0,
        championsPoints: newCalendarYear ? 0 : team.championsPoints,
      });
    });

    // Apply agent patch (pick-rate + threshold correction, map drift, notification)
    state = applyAgentPatch(state);

    // Rotate map pool (60% no change, 30% swap 1, 10% swap 2)
    state = rotateMapPool(state);

    // Generate new schedule for all 4 partnership leagues
    const allLeagueIds = [state.leagueId, ...state.otherLeagueIds];
    for (const lid of allLeagueIds) {
      const lg = state.leagues.get(lid);
      if (!lg) continue;
      const rng = createRng(state.seed + state.season * 10000 + lid.length);
      const newLeague = { ...lg, currentSeason: state.season, currentAct: 1 };
      state.leagues.set(lid, newLeague);
      generateSchedule(newLeague, state.season, rng).forEach(m => state.matches.set(m.id, m));
      initStandings(newLeague, state.season).forEach(row => {
        state.standings.set(`${row.leagueId}:${row.season}:${row.teamId}`, row);
      });
    }

    // Clear other leagues' playoff brackets from the previous split
    state.otherPlayoffBrackets.clear();

    // Prune matches from exactly the calendar season 3 behind the current one
    // (e.g. at calendar season 4, delete calendar season 1 = game-seasons 1–3)
    const calSeason = Math.ceil(state.season / 3);
    const targetCalSeason = calSeason - 3;
    if (targetCalSeason >= 1) {
      const toDelete: string[] = [];
      state.matches.forEach((m, id) => {
        if (Math.ceil(m.season / 3) === targetCalSeason) toDelete.push(id);
      });
      toDelete.forEach(id => {
        state.matches.delete(id);
        state.dirtyMatches.delete(id);
      });
    }
  }

  // Update act
  if (state.phase === 'regular_season') {
    state.act = state.week <= 3 ? 1 : state.week <= 6 ? 2 : 3;
  }

  return state;
}

// ─── Other-league playoff simulation ─────────────────────────────────────────

// Full round order respecting bracket dependencies.
const ALL_PLAYOFF_ROUNDS = ['UR1A', 'UR1B', 'LR1A', 'LR1B', 'USF1', 'USF2', 'LR2A', 'LR2B', 'UF', 'LR3', 'LF', 'GF'];

function simFullPlayoffBracket(
  bracket: import('../types').PlayoffBracket,
  state: GameState,
  rng: import('./rng').SeededRng,
): void {
  for (const roundId of ALL_PLAYOFF_ROUNDS) {
    const match = bracket.matches.find(m => m.round === roundId);
    if (!match || match.result || !match.teamAId || !match.teamBId) continue;

    const teamA = state.teams.get(match.teamAId);
    const teamB = state.teams.get(match.teamBId);
    if (!teamA || !teamB) continue;

    let modifiers = { teamAMod: 1.0, teamBMod: 1.0 };
    if (match.round === 'GF') {
      const lf = bracket.matches.find(m => m.round === 'LF');
      if (lf?.result) {
        const { upperMod, lowerMod } = getGrandFinalFatigueMod(lf);
        modifiers = { teamAMod: upperMod, teamBMod: lowerMod };
      }
    }

    const playersA = getRosterPlayers(state, match.teamAId);
    const playersB = getRosterPlayers(state, match.teamBId);
    const result = simMatch(
      match.id, teamA, teamB, playersA, playersB,
      state.roleRatings, match.format, rng, state.activeMapPool, modifiers,
      effectiveCoachStat(teamA, state.coaches, 'tactics'),
      effectiveCoachStat(teamB, state.coaches, 'tactics'),
      state.agentMeta, state.agentMapMeta, true,
    );

    match.result = result;

    if (match.feedsWinnerTo) {
      const next = bracket.matches.find(m => m.id === match.feedsWinnerTo);
      if (next) {
        if (!next.teamAId) next.teamAId = result.winner === 'A' ? match.teamAId : match.teamBId;
        else               next.teamBId = result.winner === 'A' ? match.teamAId : match.teamBId;
      }
    }
    if (match.feedsLoserTo) {
      const next = bracket.matches.find(m => m.id === match.feedsLoserTo);
      if (next) {
        const loserId = result.winner === 'A' ? match.teamBId : match.teamAId;
        if (!next.teamAId) next.teamAId = loserId;
        else               next.teamBId = loserId;
      }
    }
    if (match.round === 'GF') {
      bracket.champion = result.winner === 'A' ? match.teamAId : match.teamBId;
    }
  }
}

function simOtherLeaguesPlayoffs(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 1000 + 50000);

  for (const leagueId of state.otherLeagueIds) {
    const league = state.leagues.get(leagueId);
    if (!league) continue;

    const standingsArr: StandingsRow[] = [];
    state.standings.forEach(row => {
      if (row.leagueId === leagueId && row.season === state.season) standingsArr.push(row);
    });

    const groupAIds = league.groups?.groupA ?? [];
    const groupBIds = league.groups?.groupB ?? [];
    const groupA = sortStandings(standingsArr.filter(r => groupAIds.includes(r.teamId)));
    const groupB = sortStandings(standingsArr.filter(r => groupBIds.includes(r.teamId)));

    const seeds = [
      groupA[0]?.teamId, groupB[0]?.teamId,
      groupA[1]?.teamId, groupB[1]?.teamId,
      groupA[2]?.teamId, groupB[2]?.teamId,
      groupA[3]?.teamId, groupB[3]?.teamId,
    ].filter(Boolean) as string[];

    if (seeds.length < 8) continue;

    const bracket = buildPlayoffBracket(leagueId, state.season, seeds);
    simFullPlayoffBracket(bracket, state, rng);
    state.otherPlayoffBrackets.set(leagueId, bracket);
  }

  return state;
}

// ─── Playoff simulation ───────────────────────────────────────────────────────

// Rounds to simulate each playoff week, in play order.
const PLAYOFF_WEEK_ROUNDS: Record<number, string[]> = {
  1: ['UR1A', 'UR1B'],
  2: ['LR1A', 'LR1B'],
  3: ['USF1', 'USF2'],
  4: ['LR2A', 'LR2B'],
  5: ['UF', 'LR3'],
  6: ['LF'],
  7: ['GF'],
};

function simPlayoffStage(state: GameState): GameState {
  if (!state.playoffBracket) return state;
  const rng = createRng(state.seed + state.season * 1000 + state.week + 10000);

  const bracket = state.playoffBracket;
  const roundsThisWeek = PLAYOFF_WEEK_ROUNDS[state.week] ?? [];

  for (const round of roundsThisWeek) {
    const match = bracket.matches.find(m => m.round === round);
    if (!match || match.result) continue;
    if (!match.teamAId || !match.teamBId) continue;

    const teamA = state.teams.get(match.teamAId);
    const teamB = state.teams.get(match.teamBId);
    if (!teamA || !teamB) continue;

    let modifiers = { teamAMod: 1.0, teamBMod: 1.0 };

    if (match.round === 'GF') {
      const lf = bracket.matches.find(m => m.round === 'LF');
      if (lf?.result) {
        const { upperMod, lowerMod } = getGrandFinalFatigueMod(lf);
        modifiers = { teamAMod: upperMod, teamBMod: lowerMod };
      }
    }

    const playersA = getRosterPlayers(state, match.teamAId);
    const playersB = getRosterPlayers(state, match.teamBId);
    const result = simMatch(
      match.id, teamA, teamB, playersA, playersB,
      state.roleRatings, match.format, rng, state.activeMapPool, modifiers,
      effectiveCoachStat(teamA, state.coaches, 'tactics'),
      effectiveCoachStat(teamB, state.coaches, 'tactics'),
      state.agentMeta, state.agentMapMeta, true,
    );

    // Track agent picks for patch calculation
    for (const p of [...playersA, ...playersB]) {
      state.agentPickCounts[p.mainAgent] = (state.agentPickCounts[p.mainAgent] ?? 0) + 1;
    }

    match.result = result;
    state.dirtyMatches.add(match.id);

    if (match.feedsWinnerTo) {
      const next = bracket.matches.find(m => m.id === match.feedsWinnerTo);
      if (next) {
        if (!next.teamAId) next.teamAId = result.winner === 'A' ? match.teamAId! : match.teamBId!;
        else next.teamBId = result.winner === 'A' ? match.teamAId! : match.teamBId!;
      }
    }
    if (match.feedsLoserTo) {
      const next = bracket.matches.find(m => m.id === match.feedsLoserTo);
      if (next) {
        const loserId = result.winner === 'A' ? match.teamBId! : match.teamAId!;
        if (!next.teamAId) next.teamAId = loserId;
        else next.teamBId = loserId;
      }
    }

    if (match.round === 'GF') {
      bracket.champion = result.winner === 'A' ? match.teamAId! : match.teamBId!;
    }
  }

  state.playoffBracket = bracket;
  return state;
}

// ─── Roster auto-fill ────────────────────────────────────────────────────────

const ROLES: PlayerRole[] = ['duelist', 'initiator', 'controller', 'sentinel'];

function skillScore(p: Player): number {
  return p.trueAim * 0.55 + p.trueGameSense * 0.45;
}

export function autoFillRoster(state: GameState): GameState {
  const team = state.teams.get(state.playerTeamId);
  if (!team || team.rosterIds.length >= 5) return state;

  const homeNats = HOME_NATIONALITIES[team.region];
  const maxImports = IMPORT_LIMITS[team.region].maxImports;
  const starterSet = new Set(team.rosterIds);
  const newRoster = [...team.rosterIds];

  // Track current import count in the roster being built
  let importCount = newRoster
    .map(id => state.players.get(id))
    .filter((p): p is Player => !!p && !homeNats.includes(p.nationality))
    .length;

  const canAdd = (p: Player) => homeNats.includes(p.nationality) || importCount < maxImports;

  // Bench candidates not already starting, sorted best-first
  let benchPool = team.subIds
    .filter(id => !starterSet.has(id))
    .map(id => state.players.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => skillScore(b) - skillScore(a));

  // Free agent candidates sorted best-first
  let faPool = state.freeAgents
    .map(id => state.players.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => skillScore(b) - skillScore(a));

  const teamId = team.id;
  const promotedFromBench: string[] = [];
  const signedFromFA: string[] = [];

  function promote(p: Player, isBench: boolean) {
    if (newRoster.includes(p.id)) return;
    if (!homeNats.includes(p.nationality)) importCount++;
    newRoster.push(p.id);
    if (isBench) {
      benchPool = benchPool.filter(x => x.id !== p.id);
      promotedFromBench.push(p.id);
    } else {
      faPool = faPool.filter(x => x.id !== p.id);
      signedFromFA.push(p.id);
      const contractId = `auto_${p.id}_s${state.season}`;
      state.players.set(p.id, { ...p, teamId, contractId });
      state.dirtyPlayers.add(p.id);
      state.contracts.set(contractId, {
        id: contractId,
        playerId: p.id,
        teamId,
        salary: p.salary,
        length: 1,
        buyout: Math.round(p.salary * 2),
        startSeason: state.season,
        endSeason: Math.ceil(state.season / 3) * 3,
      });
      state.notifications.push({
        id: notifId(),
        type: 'development',
        title: 'Free Agent Signed',
        body: `${p.alias} signed to fill a vacant starting spot.`,
        week: state.week,
        read: false,
      });
    }
  }

  // Pass 1: fill each missing role (bench first, then FA), respecting import limit
  for (const role of ROLES) {
    if (newRoster.length >= 5) break;
    const currentRoles = new Set(newRoster.map(id => state.players.get(id)?.primaryRole));
    if (currentRoles.has(role)) continue;
    const fromBench = benchPool.find(p => p.primaryRole === role && canAdd(p));
    if (fromBench) { promote(fromBench, true); continue; }
    const fromFA = faPool.find(p => p.primaryRole === role && canAdd(p));
    if (fromFA) promote(fromFA, false);
  }

  // Pass 2: fill remaining slots by skill (bench preferred over FA), respecting import limit
  while (newRoster.length < 5) {
    const b = benchPool.find(p => canAdd(p));
    const f = faPool.find(p => canAdd(p));
    if (!b && !f) break;
    if (b && (!f || skillScore(b) >= skillScore(f))) promote(b, true);
    else if (f) promote(f, false);
    else break;
  }

  // Commit
  team.rosterIds = newRoster;
  const promotedSet = new Set(promotedFromBench);
  team.subIds = team.subIds.filter(id => !promotedSet.has(id));
  const signedSet = new Set(signedFromFA);
  state.freeAgents = state.freeAgents.filter(id => !signedSet.has(id));
  state.teams.set(team.id, team);

  return state;
}

// ─── AI Midseason Activity ────────────────────────────────────────────────────

function aiSignFreeAgent(state: GameState, team: Team, player: Player): void {
  const contractId = `ai_${player.id}_s${state.season}`;
  state.players.set(player.id, { ...player, teamId: team.id, contractId });
  state.dirtyPlayers.add(player.id);
  state.contracts.set(contractId, {
    id: contractId, playerId: player.id, teamId: team.id,
    salary: player.salary, length: 1,
    buyout: Math.round(player.salary * 2),
    startSeason: state.season,
    endSeason: Math.ceil(state.season / 3) * 3,
  });
  state.freeAgents = state.freeAgents.filter(id => id !== player.id);
  team.rosterIds = [...team.rosterIds, player.id];
}

function aiSignBenchPlayer(state: GameState, team: Team, player: Player): void {
  if (!player.teamId) return;
  const src = state.teams.get(player.teamId);
  if (src) {
    src.subIds = src.subIds.filter(id => id !== player.id);
    state.teams.set(src.id, src);
  }
  const contractId = `ai_${player.id}_s${state.season}`;
  state.players.set(player.id, { ...player, teamId: team.id, contractId });
  state.dirtyPlayers.add(player.id);
  state.contracts.set(contractId, {
    id: contractId, playerId: player.id, teamId: team.id,
    salary: player.salary, length: 1,
    buyout: Math.round(player.salary * 2),
    startSeason: state.season,
    endSeason: Math.ceil(state.season / 3) * 3,
  });
  team.rosterIds = [...team.rosterIds, player.id];
}

function aiHireCoach(state: GameState, team: Team, coach: Coach, role: 'head' | 'assistant'): void {
  const displaced = role === 'head' ? team.headCoachId : team.assistantCoachId;
  if (displaced) {
    const old = state.coaches.get(displaced);
    if (old) {
      state.coaches.set(displaced, { ...old, teamId: null });
      if (!state.freeAgentCoaches.includes(displaced))
        state.freeAgentCoaches = [...state.freeAgentCoaches, displaced];
    }
  }
  state.coaches.set(coach.id, { ...coach, teamId: team.id });
  state.freeAgentCoaches = state.freeAgentCoaches.filter(id => id !== coach.id);
  if (role === 'head') team.headCoachId = coach.id;
  else team.assistantCoachId = coach.id;
}

function aiMidseasonTick(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 3001 + state.week * 47);

  state.teams.forEach((team, teamId) => {
    if (teamId === state.playerTeamId) return;

    const homeNats  = HOME_NATIONALITIES[team.region];
    const maxImports = IMPORT_LIMITS[team.region].maxImports;
    const countImports = (ids: string[]) =>
      ids.map(id => state.players.get(id))
         .filter((p): p is Player => !!p && !homeNats.includes(p.nationality)).length;
    const canAdd = (p: Player, roster: string[]) =>
      homeNats.includes(p.nationality) || countImports(roster) < maxImports;

    // ── Roster (30% chance per team per week) ─────────────────────────────
    if (rng() < 0.30) {
      if (team.rosterIds.length < 5) {
        // Fill incomplete roster: own bench → FA
        const rosterRoles = new Set(team.rosterIds.map(id => state.players.get(id)?.primaryRole));
        const needed = ROLES.find(r => !rosterRoles.has(r));
        const match = (p: Player) => !needed || p.primaryRole === needed;

        const fromBench = team.subIds
          .map(id => state.players.get(id))
          .filter((p): p is Player => !!p && match(p) && canAdd(p, team.rosterIds))
          .sort((a, b) => skillScore(b) - skillScore(a))[0];

        if (fromBench) {
          team.rosterIds = [...team.rosterIds, fromBench.id];
          team.subIds = team.subIds.filter(id => id !== fromBench.id);
        } else {
          const fromFA = state.freeAgents
            .map(id => state.players.get(id))
            .filter((p): p is Player => !!p && match(p) && canAdd(p, team.rosterIds))
            .sort((a, b) => skillScore(b) - skillScore(a))[0];
          if (fromFA) aiSignFreeAgent(state, team, fromFA);
        }
        state.teams.set(teamId, team);
      } else {
        // Maybe upgrade weakest starter
        const starters = team.rosterIds.map(id => state.players.get(id)).filter((p): p is Player => !!p);
        const worst = starters.reduce((a, b) => skillScore(a) < skillScore(b) ? a : b);
        const worstSc = skillScore(worst);
        const rosterWithout = team.rosterIds.filter(id => id !== worst.id);

        // 1. Swap with own bench if significantly better
        const bestBench = team.subIds
          .map(id => state.players.get(id))
          .filter((p): p is Player => !!p && canAdd(p, rosterWithout))
          .sort((a, b) => skillScore(b) - skillScore(a))[0];

        if (bestBench && skillScore(bestBench) > worstSc + 10) {
          team.rosterIds = [...rosterWithout, bestBench.id];
          team.subIds = team.subIds.filter(id => id !== bestBench.id).concat(worst.id);
          state.teams.set(teamId, team);
        } else if (rng() < 0.40) {
          // 2. Sign FA upgrade (bench worst first)
          const faUpgrade = state.freeAgents
            .map(id => state.players.get(id))
            .filter((p): p is Player => !!p
              && p.primaryRole === worst.primaryRole
              && canAdd(p, rosterWithout)
              && skillScore(p) > worstSc + 12)
            .sort((a, b) => skillScore(b) - skillScore(a))[0];

          if (faUpgrade) {
            team.rosterIds = rosterWithout;
            if (!team.subIds.includes(worst.id)) team.subIds = [...team.subIds, worst.id];
            aiSignFreeAgent(state, team, faUpgrade);
            state.teams.set(teamId, team);
          } else {
            // 3. Poach bench player from another team
            const candidates: Player[] = [];
            state.teams.forEach((ot, oid) => {
              if (oid === teamId) return;
              ot.subIds.forEach(id => {
                const p = state.players.get(id);
                if (p && p.primaryRole === worst.primaryRole
                    && canAdd(p, rosterWithout) && skillScore(p) > worstSc + 15)
                  candidates.push(p);
              });
            });
            candidates.sort((a, b) => skillScore(b) - skillScore(a));
            const steal = candidates[0];
            if (steal) {
              team.rosterIds = rosterWithout;
              if (!team.subIds.includes(worst.id)) team.subIds = [...team.subIds, worst.id];
              aiSignBenchPlayer(state, team, steal);
              state.teams.set(teamId, team);
            }
          }
        }
      }
    }

    // ── Coaches (20% chance per team per week) ────────────────────────────
    if (rng() < 0.20 && state.freeAgentCoaches.length > 0) {
      const role: 'head' | 'assistant' | null =
        !team.headCoachId ? 'head' :
        (!team.assistantCoachId && rng() < 0.4) ? 'assistant' : null;
      if (role) {
        const best = state.freeAgentCoaches
          .map(id => state.coaches.get(id))
          .filter((c): c is Coach => !!c)
          .sort((a, b) => (b.tactics + b.scouting + b.moraleBoost) - (a.tactics + a.scouting + a.moraleBoost))[0];
        if (best) {
          aiHireCoach(state, team, best, role);
          state.teams.set(teamId, team);
        }
      }
    }
  });

  return state;
}

// ─── Transfer System ─────────────────────────────────────────────────────────

export function computeBuyout(
  player: Player,
  contract: Contract,
  team: Team,
  season: number,
): number {
  const yearsLeft = Math.max(1, contract.endSeason / 3 - Math.ceil(season / 3) + 1);
  // Skill multiplier 0.75–1.5 based on aim+gameSense
  const skillMod = 0.75 + (player.aim + player.gameSense) / 200 * 0.75;
  // Bench discount: benched players cost less to buy out
  const benchMod = team.subIds.includes(player.id) ? 0.6 : 1.0;
  return Math.round(contract.salary * yearsLeft * skillMod * benchMod / 10_000) * 10_000;
}

function evaluateOffer(
  offer: TransferOffer,
  player: Player,
  state: GameState,
  rng: () => number,
): { status: TransferStatus; counterSalary?: number } {
  // Buyout gate for contracted players
  if (player.teamId) {
    const sellingTeam = state.teams.get(player.teamId);
    const contract = player.contractId ? state.contracts.get(player.contractId) : undefined;
    if (sellingTeam && contract) {
      const required = computeBuyout(player, contract, sellingTeam, state.season);
      if (offer.fee < required) return { status: 'rejected' };
    }
  }

  // Salary score 0–70
  const ratio = offer.offeredSalary / Math.max(1, player.salary);
  const salaryScore =
    ratio >= 1.5 ? 70 :
    ratio >= 1.0 ? 35 + (ratio - 1.0) * 70 :
    ratio >= 0.7 ? Math.max(0, (ratio - 0.7) * 117) : 0;

  // Team quality delta −10 to +20 (is the buying team doing better than current team?)
  const buyingTeam = state.teams.get(offer.fromTeamId);
  const currentTeam = player.teamId ? state.teams.get(player.teamId) : null;
  const buyRate = buyingTeam ? buyingTeam.wins / Math.max(1, buyingTeam.wins + buyingTeam.losses) : 0.5;
  const curRate = currentTeam ? currentTeam.wins / Math.max(1, currentTeam.wins + currentTeam.losses) : 0.4;
  const teamScore = Math.max(-10, Math.min(20, (buyRate - curRate) * 40));

  // Morale: unhappy players are more willing to leave
  const moraleScore = (75 - player.morale) * 0.3;

  // Free agent / bench bonuses
  const freeAgentBonus = player.teamId === null ? 35 : 0;
  const benchBonus = currentTeam?.subIds.includes(player.id) ? 10 : 0;

  const prob = Math.max(5, Math.min(95, salaryScore + teamScore + moraleScore + freeAgentBonus + benchBonus));

  if (rng() * 100 < prob) return { status: 'accepted' };

  // Counter: in the "maybe" zone, suggest a salary that would tip them over
  if (ratio >= 0.8 && ratio < 1.3 && rng() * 100 < 35) {
    const counter = Math.round(Math.max(player.salary * 1.05, offer.offeredSalary * 1.2) / 5_000) * 5_000;
    return { status: 'countered', counterSalary: counter };
  }

  return { status: 'rejected' };
}

function executeTransfer(offer: TransferOffer, player: Player, state: GameState): void {
  const newTeamId = offer.fromTeamId;

  // Detach from old team or free agent list
  if (player.teamId) {
    const oldTeam = state.teams.get(player.teamId);
    if (oldTeam) {
      state.teams.set(oldTeam.id, {
        ...oldTeam,
        rosterIds: oldTeam.rosterIds.filter(id => id !== player.id),
        subIds: oldTeam.subIds.filter(id => id !== player.id),
      });
    }
  } else {
    state.freeAgents = state.freeAgents.filter(id => id !== player.id);
  }

  // New contract
  const contractId = `tf_${offer.id}`;
  state.contracts.set(contractId, {
    id: contractId,
    playerId: player.id,
    teamId: newTeamId,
    salary: offer.offeredSalary,
    length: offer.contractLength,
    buyout: Math.round(offer.offeredSalary * 2),
    startSeason: state.season,
    endSeason: (Math.ceil(state.season / 3) + offer.contractLength - 1) * 3,
  });

  // Add to new team's bench (fresh signings always start on bench)
  const newTeam = state.teams.get(newTeamId);
  if (newTeam) {
    state.teams.set(newTeamId, {
      ...newTeam,
      subIds: [...newTeam.subIds.filter(id => id !== player.id), player.id],
    });
  }

  state.players.set(player.id, { ...player, teamId: newTeamId, contractId, salary: offer.offeredSalary });
  state.dirtyPlayers.add(player.id);
}

function processTransferOffers(state: GameState): GameState {
  const pending = state.transferOffers.filter(o => o.status === 'pending');
  if (pending.length === 0) return state;

  const rng = createRng(state.seed + state.season * 100 + state.week + 50_000);

  for (const offer of pending) {
    const player = state.players.get(offer.playerId);
    if (!player) { offer.status = 'rejected'; continue; }

    const result = evaluateOffer(offer, player, state, rng);
    offer.status = result.status;
    if (result.counterSalary) offer.counterSalary = result.counterSalary;

    if (result.status === 'accepted') executeTransfer(offer, player, state);

    state.notifications.push({
      id: notifId(),
      type: 'transfer_offer',
      title: result.status === 'accepted' ? 'Transfer Accepted!' :
             result.status === 'countered' ? 'Counter Offer Received' : 'Transfer Rejected',
      body: result.status === 'accepted'
        ? `${player.alias} accepted your offer and has joined your squad.`
        : result.status === 'countered'
        ? `${player.alias} will consider an offer of $${result.counterSalary?.toLocaleString()}/yr.`
        : `${player.alias} declined your offer.`,
      week: state.week,
      read: false,
      data: { offerId: offer.id, playerId: player.id },
    });
  }

  return state;
}

export function releasePlayer(state: GameState, playerId: string): GameState {
  const player = state.players.get(playerId);
  if (!player || player.teamId !== state.playerTeamId) return state;

  const team = state.teams.get(state.playerTeamId);
  if (!team) return state;

  state.teams.set(team.id, {
    ...team,
    rosterIds: team.rosterIds.filter(id => id !== playerId),
    subIds: team.subIds.filter(id => id !== playerId),
  });

  state.players.set(playerId, { ...player, teamId: null, contractId: null });
  state.dirtyPlayers.add(playerId);

  if (!state.freeAgents.includes(playerId)) {
    state.freeAgents = [...state.freeAgents, playerId];
  }

  return { ...state };
}

// ─── Offseason contract renewal ───────────────────────────────────────────────

let _renewalSeq = 0;

// Week 1 of offseason: push Decisions for all expired player-team contracts.
function detectExpiringContracts(state: GameState): GameState {
  // Contracts only expire at end of calendar years (every 3rd split).
  if (state.season % 3 !== 0) return state;
  const team = state.teams.get(state.playerTeamId);
  if (!team) return state;

  [...team.rosterIds, ...team.subIds].forEach(playerId => {
    const player = state.players.get(playerId);
    if (!player?.contractId) return;
    const contract = state.contracts.get(player.contractId);
    if (!contract || contract.endSeason !== state.season) return;

    const decisionId = `renewal_${state.season}_${playerId}`;
    if (state.pendingDecisions.some(d => d.id === decisionId)) return;

    state.pendingDecisions.push({
      id: decisionId,
      type: 'contract_renewal',
      description: `Re-sign ${player.alias}?`,
      deadline: state.week + 2,
      data: {
        playerId,
        askingSalary: contract.salary,
        currentSalary: contract.salary,
        contractId: contract.id,
        offerPending: false,
      },
    });

    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Contract Expired',
      body: `${player.alias}'s contract has expired. Re-sign them from the Finances screen or they enter free agency in 2 weeks.`,
      week: state.week,
      read: false,
    });
  });

  return state;
}

// Week 2 of offseason: warn for each unresolved renewal with no offer in flight.
function warnUnresolvedRenewals(state: GameState): GameState {
  state.pendingDecisions.forEach(d => {
    if (d.type !== 'contract_renewal' || d.data.offerPending) return;
    const player = state.players.get(d.data.playerId as string);
    if (!player) return;
    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Final Week to Re-sign',
      body: `No offer made for ${player.alias}. They enter free agency next week if you don't act.`,
      week: state.week,
      read: false,
    });
  });
  return state;
}

// Week 3+ of offseason: unresolved renewals → player walks to free agency.
function resolveExpiredRenewals(state: GameState): GameState {
  const unresolved = state.pendingDecisions.filter(d => d.type === 'contract_renewal');
  unresolved.forEach(d => {
    const playerId = d.data.playerId as string;
    const player = state.players.get(playerId);
    if (!player) return;
    state = releasePlayer(state, playerId);
    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Entered Free Agency',
      body: `${player.alias} entered free agency after their contract expired without a renewal offer.`,
      week: state.week,
      read: false,
    });
  });
  state.pendingDecisions = state.pendingDecisions.filter(d => d.type !== 'contract_renewal');
  return state;
}

// Every offseason week: resolve any submitted renewal offers.
function processRenewalOffers(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 1000 + state.week * 100 + 77);
  const toRemove: string[] = [];
  const pending = state.pendingDecisions.filter(
    d => d.type === 'contract_renewal' && !!d.data.offerPending,
  );

  pending.forEach(d => {
    const playerId = d.data.playerId as string;
    const player = state.players.get(playerId);
    if (!player) { toRemove.push(d.id); return; }

    const offered = d.data.offeredSalary as number;
    const length  = d.data.offeredLength  as number;
    const asking  = d.data.askingSalary   as number;

    // ~80% accept at asking salary; morale ±10pp nudge
    const acceptChance = Math.max(0.05, Math.min(0.95,
      0.5 + (offered / asking - 0.9) * 2.5 + (player.morale - 75) / 500,
    ));

    if (rng() < acceptChance) {
      const contractId = `contract_${state.season}_${++_renewalSeq}_${playerId}`;
      state.contracts.set(contractId, {
        id: contractId,
        playerId,
        teamId: state.playerTeamId,
        salary: offered,
        length,
        buyout: Math.round(offered * length * 0.75),
        startSeason: state.season + 1,
        endSeason: (Math.ceil(state.season / 3) + length) * 3,
      });
      state.players.set(playerId, { ...player, contractId });
      state.dirtyPlayers.add(playerId);
      state.notifications.push({
        id: notifId(),
        type: 'contract_expiring',
        title: 'Contract Renewed',
        body: `${player.alias} signed a new ${length}-year deal at $${offered.toLocaleString()}/yr.`,
        week: state.week,
        read: false,
      });
      toRemove.push(d.id);
    } else {
      // Rejected — reset pending flag so player can re-offer before deadline
      state.pendingDecisions = state.pendingDecisions.map(pd =>
        pd.id === d.id ? { ...pd, data: { ...pd.data, offerPending: false } } : pd,
      );
      state.notifications.push({
        id: notifId(),
        type: 'contract_expiring',
        title: 'Renewal Rejected',
        body: `${player.alias} rejected your offer of $${offered.toLocaleString()}/yr.`,
        week: state.week,
        read: false,
      });
    }
  });

  state.pendingDecisions = state.pendingDecisions.filter(d => !toRemove.includes(d.id));
  return state;
}

// Called by Finances screen to submit a renewal offer for a player.
export function submitRenewalOffer(
  state: GameState,
  playerId: string,
  offeredSalary: number,
  offeredLength: number,
): GameState {
  const idx = state.pendingDecisions.findIndex(
    d => d.type === 'contract_renewal' && d.data.playerId === playerId,
  );
  if (idx === -1) return state;
  state.pendingDecisions = state.pendingDecisions.map((d, i) =>
    i === idx
      ? { ...d, data: { ...d.data, offeredSalary, offeredLength, offerPending: true } }
      : d,
  );
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────

let _offerSeq = 0;

export function makeTransferOffer(
  state: GameState,
  playerId: string,
  offeredSalary: number,
  contractLength: number,
  fee: number,
): GameState {
  const player = state.players.get(playerId);
  if (!player) return state;

  // Prevent duplicate pending offers
  const hasPending = state.transferOffers.some(
    o => o.playerId === playerId && o.fromTeamId === state.playerTeamId && o.status === 'pending',
  );
  if (hasPending) return state;

  const offer: TransferOffer = {
    id: `offer_${state.season}_${state.week}_${++_offerSeq}`,
    playerId,
    fromTeamId: state.playerTeamId,
    toTeamId: player.teamId ?? '',
    fee,
    offeredSalary,
    contractLength,
    status: 'pending',
    deadline: state.week,
  };

  return { ...state, transferOffers: [...state.transferOffers, offer] };
}

// ─── Main advanceWeek ─────────────────────────────────────────────────────────

export function advanceWeek(state: GameState): GameState {
  if (state.phase === 'new_game') {
    state.phase = 'preseason';
    return state;
  }

  state = processTransferOffers(state);

  if (state.phase === 'preseason') {
    state.week++;
    if (state.week > 2) {
      state.phase = 'regular_season';
      state.week = 1;
    }
    return weeklyPlayerTick(state);
  }

  if (state.phase === 'regular_season') {
    state = autoFillRoster(state);
    state = aiMidseasonTick(state);
    state = simWeekMatches(state);
    state = applyPracticeAllocation(state);
    state = weeklyPlayerTick(state);
    state = checkContractExpiry(state);
    state.week++;
    state = checkPhaseTransition(state);
    return state;
  }

  if (state.phase === 'playoffs') {
    state = autoFillRoster(state);
    state = simPlayoffStage(state);
    state = weeklyPlayerTick(state);
    state.week++;
    state = checkPhaseTransition(state);
    return state;
  }

  if (state.phase === 'inter_tournament') {
    const t = state.activeInternationalTournament;
    if (!t) {
      state.phase = 'offseason';
      state.week = 1;
      return state;
    }
    const maxRounds = t.name === 'Champions' ? CHAMPIONS_ROUNDS : MASTERS_ROUNDS;
    const simRound  = (r: number) => {
      const rng = createRng(state.seed + state.season * 1000 + r + 20000);
      if (t.name === 'Champions') simChampionsRound(t, state, rng, r);
      else simMastersRound(t, state, rng, r);
    };

    if (t.phase === 'complete') {
      // Player has seen results — now transition to offseason
      state = checkPhaseTransition(state);
    } else if (!isTeamAliveInTournament(t, state.playerTeamId)) {
      // Eliminated — auto-sim all remaining rounds then transition immediately
      for (let r = state.week; r <= maxRounds; r++) simRound(r);
      state = checkPhaseTransition(state);
    } else {
      // Player still competing — one round per advance
      simRound(state.week);
      state.week++;
      // If tournament just completed, stay to show results; transition on next advance
      if (state.activeInternationalTournament?.phase !== 'complete') state = checkPhaseTransition(state);
    }
    return state;
  }

  if (state.phase === 'offseason') {
    const isEndOfSeason = state.season % 3 === 0;
    if (isEndOfSeason) {
      if (state.week === 1) {
        state = detectExpiringContracts(state);
        state.notifications.push({
          id: notifId(),
          type: 'playoff',
          title: 'Transfer Window Open',
          body: 'Free agency is active — 4 weeks to sign players and make transfers.',
          week: state.week,
          read: false,
        });
      }
      if (state.week === 2) state = warnUnresolvedRenewals(state);
      if (state.week >= 3) state = resolveExpiredRenewals(state);
      state = processRenewalOffers(state);
    }
    state.week++;
    state = weeklyPlayerTick(state);
    state = checkPhaseTransition(state);
    return state;
  }

  return state;
}

// ─── New game bootstrap ───────────────────────────────────────────────────────

import { initLeague } from './leagueInit';

const ALL_REGIONS: RegionId[] = ['americas', 'emea', 'pacific', 'china'];
const REGION_SEED_OFFSETS: Record<RegionId, number> = {
  americas: 0,
  emea:     111111,
  pacific:  222222,
  china:    333333,
};

export function createNewGame(regionId: RegionId, teamIndex: number, seed: number): GameState {
  const players    = new Map<string, Player>();
  const teams      = new Map<string, Team>();
  const orgs       = new Map<string, Organization>();
  const leagues    = new Map<string, League>();
  const contracts  = new Map<string, Contract>();
  const matches    = new Map<string, ScheduledMatch>();
  const standings  = new Map<string, StandingsRow>();
  const roleRatings = new Map<string, PlayerRoleRatingRecord>();
  const coaches    = new Map<string, Coach>();
  const freeAgents: string[] = [];
  const freeAgentCoaches: string[] = [];

  let playerLeagueId = '';
  const otherLeagueIds: string[] = [];

  for (const region of ALL_REGIONS) {
    const regionSeed = seed + REGION_SEED_OFFSETS[region];
    const regionRng  = createRng(regionSeed);
    const init       = initLeague(region, regionSeed, regionRng);

    init.players.forEach(p => players.set(p.id, p));
    init.teams.forEach(t => teams.set(t.id, t));
    init.orgs.forEach(o => orgs.set(o.id, o));
    leagues.set(init.league.id, init.league);
    leagues.set(init.challengers.id, init.challengers);
    init.contracts.forEach((c, id) => contracts.set(id, c));
    init.matches.forEach(m => matches.set(m.id, m));
    init.standings.forEach(row => standings.set(`${row.leagueId}:${row.season}:${row.teamId}`, row));
    init.roleRatings.forEach(rr => roleRatings.set(rr.id, rr));
    init.coaches.forEach(c => coaches.set(c.id, c));
    init.players.filter(p => !p.teamId).forEach(p => freeAgents.push(p.id));
    init.coaches.filter(c => !c.teamId).forEach(c => freeAgentCoaches.push(c.id));

    if (region === regionId) {
      playerLeagueId = init.league.id;
    } else {
      otherLeagueIds.push(init.league.id);
    }
  }

  // Player picks a team from their region's partnership league
  const playerLeague = leagues.get(playerLeagueId)!;
  const playerTeamId = playerLeague.teamIds[teamIndex % 12];
  const activeMapPool = pickInitialMapPool(createRng(seed + 88888));
  const agentMeta = { ...AGENT_BASELINES };

  return {
    phase: 'preseason',
    season: 1,
    act: 1,
    week: 1,
    playerTeamId,
    leagueId: playerLeagueId,
    regionId,
    seed,
    players,
    teams,
    orgs,
    leagues,
    contracts,
    matches,
    standings,
    roleRatings,
    coaches,
    freeAgents,
    freeAgentCoaches,
    otherLeagueIds,
    otherPlayoffBrackets: new Map(),
    activeInternationalTournament: null,
    tournamentHistory: [],
    splitHistory: [],
    seasonHistory: [],
    activeMapPool,
    agentMeta,
    agentMapMeta: buildInitialAgentMapMeta(agentMeta, activeMapPool, createRng(seed + 99999)),
    agentPickCounts: {},
    pendingDecisions: [],
    notifications: [],
    transferOffers: [],
    playoffBracket: null,
    dirtyPlayers: new Set(),
    dirtyMatches: new Set(),
    dirtyCoaches: new Set(),
  };
}
