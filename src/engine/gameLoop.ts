import type {
  GameState, ScheduledMatch, Player, Team, Notification,
  StandingsRow, PlayoffBracket, PlayoffMatch, PlayerRole, Coach,
} from '../types';
import {
  MORALE_BASELINE, MORALE_DECAY_RATE, MORALE_WIN_DELTA, MORALE_LOSS_DELTA,
  PLAYER_WIN_DELTA, PLAYER_LOSS_DELTA,
  HOME_NATIONALITIES, IMPORT_LIMITS,
} from '../types';
import { createRng } from './rng';
import { developPlayer, applyAgingEffects, updateRoleRatings } from './playerGen';
import { simMatch } from './matchSim';
import {
  updateStandingsAfterMatch, sortStandings, buildPlayoffBracket,
  getGrandFinalFatigueMod, generateSchedule, initStandings,
} from './leagueInit';

let _nextNotifId = 1;
function notifId() { return `notif_${_nextNotifId++}`; }

// ─── Morale ───────────────────────────────────────────────────────────────────

function updateMorale(player: Player): Player {
  const next = player.morale + (MORALE_BASELINE - player.morale) * MORALE_DECAY_RATE;
  return { ...player, morale: Math.round(next) };
}

// Returns the combined effective value of a coach stat (head full, assistant half)
function effectiveCoachStat(
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

function getMatchesForWeek(state: GameState): ScheduledMatch[] {
  const out: ScheduledMatch[] = [];
  state.matches.forEach(m => {
    if (m.leagueId === state.leagueId && m.season === state.season &&
        m.week === state.week && !m.isPlayoff) {
      out.push(m);
    }
  });
  return out;
}

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

function simWeekMatches(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 1000 + state.week);
  const weekMatches = getAllMatchesForWeek(state);

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
      state.roleRatings, match.format, rng,
      { teamAMod: 1.0, teamBMod: 1.0 }, tacticsA, tacticsB
    );

    const updated = { ...match, result };
    state.matches.set(match.id, updated);
    state.dirtyMatches.add(match.id);

    // Update standings
    updateStandingsAfterMatch(state.standings, match.leagueId, state.season, updated);

    // Morale
    const aWon = result.winner === 'A';
    applyMatchMorale(teamA, state.players, aWon, effectiveCoachStat(teamA, state.coaches, 'moraleBoost'));
    applyMatchMorale(teamB, state.players, !aWon, effectiveCoachStat(teamB, state.coaches, 'moraleBoost'));

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

function weeklyCoachScoutingTick(state: GameState): GameState {
  const team = state.teams.get(state.playerTeamId);
  if (!team) return state;

  const effectiveScouting = effectiveCoachStat(team, state.coaches, 'scouting');
  if (effectiveScouting <= 0) return state;

  // Confidence gain per week: up to ~1.5 points/week at max combined scouting
  const confidenceGain = effectiveScouting / 66;

  const allPlayerIds = new Set([...team.rosterIds, ...team.subIds]);
  state.roleRatings.forEach((rr, key) => {
    if (!allPlayerIds.has(rr.playerId)) return;
    if (rr.scoutedRating === null) return;
    const newConf = Math.min(100, rr.scoutConfidence + confidenceGain);
    state.roleRatings.set(key, { ...rr, scoutConfidence: Math.round(newConf) });
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
  const playerTeam = state.teams.get(state.playerTeamId);
  if (!playerTeam) return state;

  playerTeam.rosterIds.concat(playerTeam.subIds).forEach(playerId => {
    const player = state.players.get(playerId);
    if (!player?.contractId) return;
    const contract = state.contracts.get(player.contractId);
    if (!contract) return;

    const weeksLeft = (contract.endSeason - state.season) * 24 + (24 - state.week);
    if (weeksLeft === 4) {
      state.notifications.push({
        id: notifId(),
        type: 'contract_expiring',
        title: 'Contract Expiring Soon',
        body: `${player.alias}'s contract expires in 4 weeks.`,
        week: state.week,
        read: false,
        data: { playerId },
      });
    }
  });
  return state;
}

// ─── Phase transitions ────────────────────────────────────────────────────────

function checkPhaseTransition(state: GameState): GameState {
  const league = state.leagues.get(state.leagueId);
  if (!league) return state;

  const maxRegularWeek = league.format.regularSeasonWeeks;

  if (state.phase === 'regular_season' && state.week > maxRegularWeek) {
    // Transition to playoffs
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
    state.phase = 'offseason';
    state.week = 1;
    state.notifications.push({
      id: notifId(),
      type: 'playoff',
      title: 'Season Over',
      body: `Season ${state.season} is complete. Entering offseason.`,
      week: state.week,
      read: false,
    });
  } else if (state.phase === 'offseason' && state.week > 4) {
    // New season
    state.season++;
    state.act = 1;
    state.week = 1;
    state.phase = 'regular_season';
    state.playoffBracket = null;

    // Age & develop players
    state.players.forEach((player, id) => {
      const aged = applyAgingEffects(player);
      state.players.set(id, aged);
      state.dirtyPlayers.add(id);

      // Update role ratings
      state.roleRatings.forEach((rr, rrId) => {
        if (rr.playerId === id) {
          const updated = updateRoleRatings(aged, rr, state.season);
          state.roleRatings.set(rrId, updated);
        }
      });
    });

    // Reset team records
    state.teams.forEach(team => {
      state.teams.set(team.id, { ...team, wins: 0, losses: 0, roundDiff: 0, mapDiff: 0, points: 0 });
    });

    // Generate new schedule
    const league = state.leagues.get(state.leagueId);
    if (league) {
      const rng = createRng(state.seed + state.season * 10000);
      const newLeague = { ...league, currentSeason: state.season, currentAct: 1 };
      state.leagues.set(state.leagueId, newLeague);

      const newMatches = generateSchedule(newLeague, state.season, rng);
      newMatches.forEach(m => state.matches.set(m.id, m));

      const newStandings = initStandings(newLeague, state.season);
      newStandings.forEach(row => {
        state.standings.set(`${row.leagueId}:${row.season}:${row.teamId}`, row);
      });
    }
  }

  // Update act
  if (state.phase === 'regular_season') {
    state.act = state.week <= 3 ? 1 : state.week <= 6 ? 2 : 3;
  }

  return state;
}

// ─── Playoff simulation ───────────────────────────────────────────────────────

function simPlayoffStage(state: GameState): GameState {
  if (!state.playoffBracket) return state;
  const rng = createRng(state.seed + state.season * 1000 + state.week + 10000);

  const bracket = state.playoffBracket;
  const ORDER = ['UR1A', 'UR1B', 'LR1A', 'LR1B', 'USF1', 'USF2', 'LR2A', 'LR2B', 'UF', 'LR3', 'LF', 'GF'];

  for (const round of ORDER) {
    const match = bracket.matches.find(m => m.round === round && !m.result);
    if (!match || !match.teamAId || !match.teamBId) continue;

    const teamA = state.teams.get(match.teamAId);
    const teamB = state.teams.get(match.teamBId);
    if (!teamA || !teamB) continue;

    let modifiers = { teamAMod: 1.0, teamBMod: 1.0 };

    // Grand final fatigue
    if (match.round === 'GF') {
      const lf = bracket.matches.find(m => m.round === 'LF');
      if (lf?.result) {
        const { upperMod, lowerMod } = getGrandFinalFatigueMod(lf);
        // LF winner is teamBId of GF (lower bracket finalist)
        modifiers = { teamAMod: upperMod, teamBMod: lowerMod };
      }
    }

    const playersA = getRosterPlayers(state, match.teamAId);
    const playersB = getRosterPlayers(state, match.teamBId);
    const result = simMatch(
      match.id, teamA, teamB, playersA, playersB,
      state.roleRatings, match.format, rng, modifiers,
      effectiveCoachStat(teamA, state.coaches, 'tactics'),
      effectiveCoachStat(teamB, state.coaches, 'tactics')
    );

    match.result = result;

    // Feed results forward
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

    // Check champion
    if (match.round === 'GF') {
      bracket.champion = result.winner === 'A' ? match.teamAId! : match.teamBId!;
    }

    // Only sim one stage per week advance
    break;
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
        endSeason: state.season,
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

// ─── Main advanceWeek ─────────────────────────────────────────────────────────

export function advanceWeek(state: GameState): GameState {
  if (state.phase === 'new_game') {
    state.phase = 'preseason';
    return state;
  }

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
    state = simWeekMatches(state);
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

  if (state.phase === 'offseason') {
    state.week++;
    state = weeklyPlayerTick(state);
    state = checkPhaseTransition(state);
    return state;
  }

  return state;
}

// ─── New game bootstrap ───────────────────────────────────────────────────────

import type { RegionId } from '../types';
import { initLeague } from './leagueInit';

export function createNewGame(regionId: RegionId, teamIndex: number, seed: number): GameState {
  const rng = createRng(seed);
  const init = initLeague(regionId, seed, rng);

  const players = new Map<string, Player>();
  init.players.forEach(p => players.set(p.id, p));

  const teams = new Map<string, Team>();
  init.teams.forEach(t => teams.set(t.id, t));

  const orgs = new Map(init.orgs.map(o => [o.id, o]));
  const leagues = new Map<string, typeof init.league>([
    [init.league.id, init.league],
    [init.challengers.id, init.challengers],
  ]);

  const contracts = init.contracts;

  const matches = new Map<string, ScheduledMatch>();
  init.matches.forEach(m => matches.set(m.id, m));

  const standings = new Map<string, StandingsRow>();
  init.standings.forEach(row => {
    standings.set(`${row.leagueId}:${row.season}:${row.teamId}`, row);
  });

  const roleRatings = new Map<string, typeof init.roleRatings[0]>();
  init.roleRatings.forEach(rr => roleRatings.set(rr.id, rr));

  const coaches = new Map<string, Coach>();
  init.coaches.forEach(c => coaches.set(c.id, c));

  // Player picks a team from the partnership league
  const playerTeam = teams.get(init.league.teamIds[teamIndex % 12]);
  const playerTeamId = playerTeam?.id ?? init.league.teamIds[0];

  return {
    phase: 'preseason',
    season: 1,
    act: 1,
    week: 1,
    playerTeamId,
    leagueId: init.league.id,
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
    freeAgents: init.players.filter(p => !p.teamId).map(p => p.id),
    freeAgentCoaches: init.coaches.filter(c => !c.teamId).map(c => c.id),
    pendingDecisions: [],
    notifications: [],
    transferOffers: [],
    playoffBracket: null,
    dirtyPlayers: new Set(),
    dirtyMatches: new Set(),
    dirtyCoaches: new Set(),
  };
}
