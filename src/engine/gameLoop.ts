import type {
  GameState, ScheduledMatch, Player, Team, Organization, League,
  StandingsRow, PlayerRole, Coach,
  Contract, PlayerRoleRatingRecord, RegionId, InternationalTournament,
} from '../types';
import {
  MORALE_WIN_DELTA, MORALE_LOSS_DELTA, PLAYER_WIN_DELTA, PLAYER_LOSS_DELTA,
  MAP_POOL, AGENT_BASELINES, PRACTICE_BUDGET, AGENT_ROLE, AGENT_MAP_AFFINITY,
} from '../types';
import { randFloat, clamp } from './rng';
import { developPlayer, applyAgingEffects, updateRoleRatings, updateMorale } from './playerGen';
import { simMatch } from './matchSim';
import {
  updateStandingsAfterMatch, sortStandings, buildPlayoffBracket,
  generateSchedule, initStandings, pickInitialMapPool,
  buildInitialAgentMapMeta, buildSplitRecord, buildSeasonRecord,
} from './leagueInit';
import {
  buildMastersQualifiedTeams, buildChampionsQualifiedTeams,
  buildTournament, awardPlayoffChampionsPoints, awardMastersTournamentPoints,
  simMastersRound, simChampionsRound, MASTERS_ROUNDS, CHAMPIONS_ROUNDS,
} from './internationalTournament';
import { notifId } from './notifId';
import { effectiveCoachStat } from './coachGen';
import { processTransferOffers, releasePlayer, makeTransferOffer, computeBuyout } from './transfers';
import { detectExpiringContracts, warnUnresolvedRenewals, resolveExpiredRenewals, processRenewalOffers, submitRenewalOffer } from './contracts';
import { autoFillRoster, aiMidseasonTick } from './rosterManager';
import { simOtherLeaguesPlayoffs, simPlayoffStage } from './playoffs';

// Re-export public API so UI imports don't break
export { effectiveCoachStat } from './coachGen';
export { computeBuyout, releasePlayer, makeTransferOffer } from './transfers';
export { submitRenewalOffer } from './contracts';
export { autoFillRoster } from './rosterManager';

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
  const rng = Math.random;
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
  const rng = Math.random;

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

// ─── Agent Patch ──────────────────────────────────────────────────────────────

function applyAgentPatch(state: GameState): GameState {
  const rng = Math.random;
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
  const rng = Math.random;
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

function growPairChemistry(team: Team): Team {
  const all = [...team.rosterIds, ...team.subIds];
  const updated = { ...team.pairChemistry };
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const key = [all[i], all[j]].sort().join(':');
      updated[key] = Math.min(100, (updated[key] ?? 0) + 0.5);
    }
  }
  return { ...team, pairChemistry: updated };
}

function weeklyPlayerTick(state: GameState): GameState {
  state.players.forEach((player, id) => {
    const developed = developPlayer(player);
    const moraleUpdated = updateMorale(developed);
    state.players.set(id, moraleUpdated);
    state.dirtyPlayers.add(id);
  });
  state.teams.forEach((team, id) => {
    state.teams.set(id, growPairChemistry(team));
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
      const rng = Math.random;
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
      const rng = Math.random;
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


export function createNewGame(regionId: RegionId, teamIndex: number): GameState {
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
    const init = initLeague(region, Math.random);

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
  const activeMapPool = pickInitialMapPool(Math.random);
  const agentMeta = { ...AGENT_BASELINES };

  return {
    phase: 'preseason',
    season: 1,
    act: 1,
    week: 1,
    playerTeamId,
    leagueId: playerLeagueId,
    regionId,
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
    agentMapMeta: buildInitialAgentMapMeta(agentMeta, activeMapPool, Math.random),
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
