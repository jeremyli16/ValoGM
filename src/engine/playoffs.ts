import type { GameState, StandingsRow } from '../types';
import type { Rng } from './rng';
import { simMatch } from './matchSim';
import { buildPlayoffBracket, sortStandings, getGrandFinalFatigueMod } from './leagueInit';
import { effectiveCoachStat } from './coachGen';

const ALL_PLAYOFF_ROUNDS = ['UR1A', 'UR1B', 'LR1A', 'LR1B', 'USF1', 'USF2', 'LR2A', 'LR2B', 'UF', 'LR3', 'LF', 'GF'];

function getRosterPlayers(state: GameState, teamId: string) {
  const team = state.teams.get(teamId);
  if (!team) return [];
  return team.rosterIds.map(id => state.players.get(id)!).filter(Boolean);
}

export function simFullPlayoffBracket(
  bracket: import('../types').PlayoffBracket,
  state: GameState,
  rng: Rng,
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

export function simOtherLeaguesPlayoffs(state: GameState): GameState {
  const rng = Math.random;

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

const PLAYOFF_WEEK_ROUNDS: Record<number, string[]> = {
  1: ['UR1A', 'UR1B'],
  2: ['LR1A', 'LR1B'],
  3: ['USF1', 'USF2'],
  4: ['LR2A', 'LR2B'],
  5: ['UF', 'LR3'],
  6: ['LF'],
  7: ['GF'],
};

export function simPlayoffStage(state: GameState): GameState {
  if (!state.playoffBracket) return state;
  const rng = Math.random;

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
