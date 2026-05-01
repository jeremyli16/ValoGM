import type {
  GameState, Player, Team, PlayoffBracket,
  RegionId, TournamentSeed, InternationalTournament,
} from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getTeamAvgRating(state: GameState, teamId: string): number {
  const team = state.teams.get(teamId);
  if (!team || team.rosterIds.length === 0) return 0;
  const players = team.rosterIds.map(id => state.players.get(id)).filter(Boolean) as Player[];
  if (players.length === 0) return 0;
  return players.reduce((sum, p) => sum + (p.aim + p.gameSense) / 2, 0) / players.length;
}

function assignGlobalSeeds(
  seeds: TournamentSeed[],
  state: GameState,
  type: 'masters' | 'champions',
): TournamentSeed[] {
  const scored = seeds.map(s => ({
    seed: s,
    score: type === 'masters'
      ? (4 - s.regionalSeed) * 3 + getTeamAvgRating(state, s.teamId)
      : (5 - s.regionalSeed) * 4 + getTeamAvgRating(state, s.teamId),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item, i) => ({ ...item.seed, globalSeed: i + 1 }));
}

// ─── Masters Qualification ────────────────────────────────────────────────────

function getMastersQualifiers(bracket: PlayoffBracket, region: RegionId): TournamentSeed[] {
  const gf = bracket.matches.find(m => m.round === 'GF');
  const lf = bracket.matches.find(m => m.round === 'LF');
  if (!gf?.result || !lf?.result || !bracket.champion) return [];

  const seed1 = bracket.champion;
  const seed2 = gf.result.winner === 'A' ? gf.teamBId! : gf.teamAId!;
  const seed3 = lf.result.winner === 'A' ? lf.teamBId! : lf.teamAId!;

  return [
    { teamId: seed1, region, regionalSeed: 1, globalSeed: 0 },
    { teamId: seed2, region, regionalSeed: 2, globalSeed: 0 },
    { teamId: seed3, region, regionalSeed: 3, globalSeed: 0 },
  ];
}

export function buildMastersQualifiedTeams(state: GameState): TournamentSeed[] {
  const all: TournamentSeed[] = [];

  if (state.playoffBracket) {
    all.push(...getMastersQualifiers(state.playoffBracket, state.regionId));
  }
  for (const leagueId of state.otherLeagueIds) {
    const bracket = state.otherPlayoffBrackets.get(leagueId);
    const league  = state.leagues.get(leagueId);
    if (bracket && league) all.push(...getMastersQualifiers(bracket, league.region));
  }

  return assignGlobalSeeds(all, state, 'masters');
}

// ─── Champions Qualification ──────────────────────────────────────────────────

function getChampionsQualifiers(
  state: GameState,
  leagueId: string,
  bracket: PlayoffBracket,
  region: RegionId,
): TournamentSeed[] {
  const gf = bracket.matches.find(m => m.round === 'GF');
  if (!gf?.result || !bracket.champion) return [];

  const seed1   = bracket.champion;
  const seed2   = gf.result.winner === 'A' ? gf.teamBId! : gf.teamAId!;
  const gfTeams = new Set([seed1, seed2]);

  const league     = state.leagues.get(leagueId);
  const candidates = (league?.teamIds ?? [])
    .filter(id => !gfTeams.has(id))
    .map(id => state.teams.get(id))
    .filter(Boolean) as Team[];

  const teamWins    = new Map<string, number>();
  const teamMapDiff = new Map<string, number>();
  state.standings.forEach(row => {
    if (row.leagueId !== leagueId) return;
    teamWins.set(row.teamId,    (teamWins.get(row.teamId)    ?? 0) + row.wins);
    teamMapDiff.set(row.teamId, (teamMapDiff.get(row.teamId) ?? 0) + row.mapDiff);
  });

  candidates.sort((a, b) => {
    const pd = (b.championsPoints ?? 0) - (a.championsPoints ?? 0);
    if (pd !== 0) return pd;
    const wd = (teamWins.get(b.id) ?? 0) - (teamWins.get(a.id) ?? 0);
    if (wd !== 0) return wd;
    return (teamMapDiff.get(b.id) ?? 0) - (teamMapDiff.get(a.id) ?? 0);
  });

  const result: TournamentSeed[] = [
    { teamId: seed1, region, regionalSeed: 1, globalSeed: 0 },
    { teamId: seed2, region, regionalSeed: 2, globalSeed: 0 },
  ];
  if (candidates[0]) result.push({ teamId: candidates[0].id, region, regionalSeed: 3, globalSeed: 0 });
  if (candidates[1]) result.push({ teamId: candidates[1].id, region, regionalSeed: 4, globalSeed: 0 });
  return result;
}

export function buildChampionsQualifiedTeams(state: GameState): TournamentSeed[] {
  const all: TournamentSeed[] = [];

  if (state.playoffBracket) {
    all.push(...getChampionsQualifiers(state, state.leagueId, state.playoffBracket, state.regionId));
  }
  for (const leagueId of state.otherLeagueIds) {
    const bracket = state.otherPlayoffBrackets.get(leagueId);
    const league  = state.leagues.get(leagueId);
    if (bracket && league) {
      all.push(...getChampionsQualifiers(state, leagueId, bracket, league.region));
    }
  }

  return assignGlobalSeeds(all, state, 'champions');
}

// ─── Champions Points ─────────────────────────────────────────────────────────

function extractPlacements(bracket: PlayoffBracket): {
  place1: string | null;
  place2: string | null;
  place3: string | null;
  place4: string | null;
  place56: string[];
} {
  const gf   = bracket.matches.find(m => m.round === 'GF');
  const lf   = bracket.matches.find(m => m.round === 'LF');
  const lr3  = bracket.matches.find(m => m.round === 'LR3');
  const lr2a = bracket.matches.find(m => m.round === 'LR2A');
  const lr2b = bracket.matches.find(m => m.round === 'LR2B');

  const loser = (m: typeof gf) =>
    m?.result ? (m.result.winner === 'A' ? m.teamBId ?? null : m.teamAId ?? null) : null;

  return {
    place1:  bracket.champion ?? null,
    place2:  loser(gf),
    place3:  loser(lf),
    place4:  loser(lr3),
    place56: [loser(lr2a), loser(lr2b)].filter(Boolean) as string[],
  };
}

function makeAward(state: GameState) {
  return (teamId: string | null | undefined, pts: number) => {
    if (!teamId) return;
    const t = state.teams.get(teamId);
    if (t) t.championsPoints = (t.championsPoints ?? 0) + pts;
  };
}

export function awardPlayoffChampionsPoints(
  state: GameState,
  bracket: PlayoffBracket,
  isSplit3: boolean,
): void {
  const { place1, place2, place3, place4 } = extractPlacements(bracket);
  const award = makeAward(state);

  if (isSplit3) {
    award(place3, 4);
    award(place4, 3);
  } else {
    award(place1, 5);
    award(place2, 3);
    award(place3, 2);
    award(place4, 1);
  }
}

export function awardTournamentChampionsPoints(
  state: GameState,
  tournament: InternationalTournament,
): void {
  if (!tournament.mainBracket) return;
  const { place1, place2, place3, place4, place56 } = extractPlacements(tournament.mainBracket);
  const award = makeAward(state);

  if (tournament.name === 'Masters 1') {
    award(place1, 6); award(place2, 4); award(place3, 3);
    award(place4, 2); place56.forEach(id => award(id, 1));
  } else {
    // Masters 2
    award(place1, 8); award(place2, 6); award(place3, 5);
    award(place4, 4); place56.forEach(id => award(id, 3));
  }
}

// ─── Tournament Builder ───────────────────────────────────────────────────────

export function buildTournament(
  name: InternationalTournament['name'],
  calendarSeason: number,
  splitNum: 1 | 2 | 3,
  qualifiedTeams: TournamentSeed[],
): InternationalTournament {
  const slug = name.toLowerCase().replace(/ /g, '_');
  return {
    id: `tournament_${slug}_cs${calendarSeason}`,
    name,
    calendarSeason,
    splitNum,
    phase: 'play_in',
    playInBracket: null,
    mainBracket:   null,
    qualifiedTeams,
    seedOneChoice: null,
    champion:      null,
    runnerUp:      null,
    mvpPlayerId:   null,
  };
}
