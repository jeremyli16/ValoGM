import type {
  GameState, ScheduledMatch, Player, Team, Notification,
  StandingsRow, PlayoffBracket, PlayoffMatch,
} from '../types';
import {
  MORALE_BASELINE, MORALE_DECAY_RATE, MORALE_WIN_DELTA, MORALE_LOSS_DELTA,
  PLAYER_WIN_DELTA, PLAYER_LOSS_DELTA,
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

function applyMatchMorale(team: Team, players: Map<string, Player>, won: boolean): void {
  const delta = won ? MORALE_WIN_DELTA : MORALE_LOSS_DELTA;
  team.morale = Math.max(0, Math.min(100, team.morale + delta));

  const playerDelta = won ? PLAYER_WIN_DELTA : PLAYER_LOSS_DELTA;
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

    const result = simMatch(
      match.id, teamA, teamB, playersA, playersB,
      state.roleRatings, match.format, rng
    );

    const updated = { ...match, result };
    state.matches.set(match.id, updated);
    state.dirtyMatches.add(match.id);

    // Update standings
    updateStandingsAfterMatch(state.standings, match.leagueId, state.season, updated);

    // Morale
    const aWon = result.winner === 'A';
    applyMatchMorale(teamA, state.players, aWon);
    applyMatchMorale(teamB, state.players, !aWon);

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

function weeklyPlayerTick(state: GameState): GameState {
  state.players.forEach((player, id) => {
    const developed = developPlayer(player);
    const moraleUpdated = updateMorale(developed);
    state.players.set(id, moraleUpdated);
    state.dirtyPlayers.add(id);
  });
  return state;
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

    // Top 3 from each group
    const seeds = [
      groupA[0]?.teamId, groupB[0]?.teamId,
      groupA[1]?.teamId, groupB[1]?.teamId,
      groupA[2]?.teamId, groupB[2]?.teamId,
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
  const ORDER = ['UQF1', 'UQF2', 'LR1', 'USF1', 'USF2', 'LSF', 'LF', 'UF', 'GF'];

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
      state.roleRatings, match.format, rng, modifiers
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
    state = simWeekMatches(state);
    state = weeklyPlayerTick(state);
    state = checkContractExpiry(state);
    state.week++;
    state = checkPhaseTransition(state);
    return state;
  }

  if (state.phase === 'playoffs') {
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
    freeAgents: init.players.filter(p => !p.teamId).map(p => p.id),
    pendingDecisions: [],
    notifications: [],
    transferOffers: [],
    playoffBracket: null,
    dirtyPlayers: new Set(),
    dirtyMatches: new Set(),
  };
}
