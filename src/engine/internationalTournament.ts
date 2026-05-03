import type {
  GameState, Player, Team, PlayoffBracket, PlayoffMatch,
  RegionId, TournamentSeed, InternationalTournament, TournamentPlayerStat,
} from '../types';
import { type SeededRng, shuffle } from './rng';
import { simMatch } from './matchSim';

// ─── Stage weights for MVP calculation ───────────────────────────────────────

const PLAY_IN_WEIGHT    = 0.6;
const MAIN_EVENT_WEIGHT = 1.0;

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
    playerStats:   {},
  };
}

// ─── Tournament stat helpers ──────────────────────────────────────────────────

function accumulateMatchStats(
  tournament: InternationalTournament,
  match: PlayoffMatch,
  weight: number,
): void {
  if (!match.result) return;
  for (const s of match.result.playerStats) {
    const existing: TournamentPlayerStat | undefined = tournament.playerStats[s.playerId];
    if (existing) {
      existing.kills         += s.kills;
      existing.deaths        += s.deaths;
      existing.assists       += s.assists;
      existing.totalAdr      += s.adr * s.maps;
      existing.totalAcs      += s.acs * s.maps;
      existing.rounds        += s.rounds;
      existing.maps          += s.maps;
      existing.totalRating    += s.rating * s.maps;
      existing.weightedRating += s.rating * weight * s.maps;
      existing.weightedMaps   += weight * s.maps;
    } else {
      tournament.playerStats[s.playerId] = {
        playerId: s.playerId,
        kills:          s.kills,
        deaths:         s.deaths,
        assists:        s.assists,
        totalAdr:       s.adr * s.maps,
        totalAcs:       s.acs * s.maps,
        rounds:         s.rounds,
        maps:           s.maps,
        totalRating:    s.rating * s.maps,
        weightedRating: s.rating * weight * s.maps,
        weightedMaps:   weight * s.maps,
      };
    }
  }
}

function pickTournamentMvp(tournament: InternationalTournament, state: GameState): string | null {
  if (!tournament.champion) return null;
  const champTeam = state.teams.get(tournament.champion);
  if (!champTeam) return null;
  const champRoster = new Set([...champTeam.rosterIds, ...champTeam.subIds]);

  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const [playerId, stat] of Object.entries(tournament.playerStats)) {
    if (!champRoster.has(playerId) || stat.weightedMaps === 0) continue;
    const avg = stat.weightedRating / stat.weightedMaps;
    if (avg > bestScore) { bestScore = avg; bestId = playerId; }
  }
  return bestId;
}

// ─── Private Match Helpers ────────────────────────────────────────────────────

function coachTactics(team: Team, coaches: GameState['coaches']): number {
  const head = team.headCoachId ? coaches.get(team.headCoachId) : null;
  const asst = team.assistantCoachId ? coaches.get(team.assistantCoachId) : null;
  return (head?.tactics ?? 0) + (asst?.tactics ?? 0) * 0.5;
}

function rosterPlayers(state: GameState, teamId: string): Player[] {
  const team = state.teams.get(teamId);
  if (!team) return [];
  return team.rosterIds.map(id => state.players.get(id)!).filter(Boolean);
}

function simTournamentMatch(
  match: PlayoffMatch,
  bracket: PlayoffBracket,
  state: GameState,
  rng: SeededRng,
  tournament?: InternationalTournament,
  weight?: number,
): void {
  if (match.result || !match.teamAId || !match.teamBId) return;
  const teamA = state.teams.get(match.teamAId);
  const teamB = state.teams.get(match.teamBId);
  if (!teamA || !teamB) return;

  const result = simMatch(
    match.id, teamA, teamB,
    rosterPlayers(state, match.teamAId),
    rosterPlayers(state, match.teamBId),
    state.roleRatings, match.format, rng,
    state.activeMapPool, { teamAMod: 1.0, teamBMod: 1.0 },
    coachTactics(teamA, state.coaches),
    coachTactics(teamB, state.coaches),
    state.agentMeta, state.agentMapMeta, true,
  );
  match.result = result;
  if (tournament && weight !== undefined) accumulateMatchStats(tournament, match, weight);

  const winnerId = result.winner === 'A' ? match.teamAId : match.teamBId;
  const loserId  = result.winner === 'A' ? match.teamBId : match.teamAId;

  if (match.feedsWinnerTo) {
    const next = bracket.matches.find(m => m.id === match.feedsWinnerTo);
    if (next) {
      if (!next.teamAId) next.teamAId = winnerId;
      else               next.teamBId = winnerId;
    }
  }
  if (match.feedsLoserTo) {
    const next = bracket.matches.find(m => m.id === match.feedsLoserTo);
    if (next) {
      if (!next.teamAId) next.teamAId = loserId;
      else               next.teamBId = loserId;
    }
  }
}

// ─── Tournament Placement Extraction (for international brackets) ─────────────

function extractTournamentPlacements(bracket: PlayoffBracket, prefix: string): {
  place1: string | null;
  place2: string | null;
  place3: string | null;
  place4: string | null;
  place56: string[];
} {
  const m = (id: string) => bracket.matches.find(x => x.id === `${prefix}${id}`);
  const loser = (match: PlayoffMatch | undefined) =>
    match?.result ? (match.result.winner === 'A' ? match.teamBId ?? null : match.teamAId ?? null) : null;

  return {
    place1:  bracket.champion,
    place2:  loser(m('GF')),
    place3:  loser(m('LBF')),
    place4:  loser(m('LBSF')),
    place56: [loser(m('LBQF_A')), loser(m('LBQF_B'))].filter(Boolean) as string[],
  };
}

export function awardMastersTournamentPoints(
  state: GameState,
  tournament: InternationalTournament,
): void {
  if (!tournament.mainBracket) return;
  const { place1, place2, place3, place4, place56 } =
    extractTournamentPlacements(tournament.mainBracket, 'MN_');
  const award = makeAward(state);

  if (tournament.name === 'Masters 1') {
    award(place1, 6); award(place2, 4); award(place3, 3);
    award(place4, 2); place56.forEach(id => award(id, 1));
  } else if (tournament.name === 'Masters 2') {
    award(place1, 8); award(place2, 6); award(place3, 5);
    award(place4, 4); place56.forEach(id => award(id, 3));
  }
}

// ─── Swiss Stage ──────────────────────────────────────────────────────────────

function swissRecord(teamId: string, matches: PlayoffMatch[]): { wins: number; losses: number } {
  let wins = 0, losses = 0;
  for (const m of matches) {
    if (!m.result) continue;
    const isA = m.teamAId === teamId;
    const isB = m.teamBId === teamId;
    if (!isA && !isB) continue;
    const won = (isA && m.result.winner === 'A') || (isB && m.result.winner === 'B');
    if (won) wins++; else losses++;
  }
  return { wins, losses };
}

function tryPairR1(
  seeds2: TournamentSeed[],
  seeds3: TournamentSeed[],
  idx: number,
  used: boolean[],
  result: number[],
): boolean {
  if (idx === seeds2.length) return true;
  for (let j = 0; j < seeds3.length; j++) {
    if (used[j] || seeds2[idx].region === seeds3[j].region) continue;
    used[j] = true;
    result[idx] = j;
    if (tryPairR1(seeds2, seeds3, idx + 1, used, result)) return true;
    used[j] = false;
  }
  return false;
}

export function initSwissStage(tournament: InternationalTournament, rng: SeededRng): void {
  const seeds2 = tournament.qualifiedTeams.filter(t => t.regionalSeed === 2);
  const seeds3 = shuffle(rng, tournament.qualifiedTeams.filter(t => t.regionalSeed === 3));

  const used = new Array(4).fill(false);
  const pairResult = new Array(4).fill(0);
  tryPairR1(seeds2, seeds3, 0, used, pairResult);

  const makeMatch = (id: string, a: string | null, b: string | null): PlayoffMatch => ({
    id,
    round: id,
    teamAId: a,
    teamBId: b,
    format: 'bo3',
    result: null,
    bracket: 'upper',
    feedsWinnerTo: null,
    feedsLoserTo:  null,
  });

  const r1 = pairResult.map((j, i) =>
    makeMatch(`SW_R1_${i}`, seeds2[i].teamId, seeds3[j].teamId)
  );
  const r2 = Array.from({ length: 4 }, (_, i) => makeMatch(`SW_R2_${i}`, null, null));
  const r3 = Array.from({ length: 2 }, (_, i) => makeMatch(`SW_R3_${i}`, null, null));

  tournament.playInBracket = { matches: [...r1, ...r2, ...r3], champion: null };
}

function pairByStrength(teamIds: string[], state: GameState): [string, string][] {
  const sorted = [...teamIds].sort(
    (a, b) => getTeamAvgRating(state, b) - getTeamAvgRating(state, a)
  );
  const pairs: [string, string][] = [];
  for (let i = 0; i < sorted.length / 2; i++)
    pairs.push([sorted[i], sorted[sorted.length - 1 - i]]);
  return pairs;
}

function fillSwissSlots(bracket: PlayoffBracket, ids: string[], pairs: [string, string][]): void {
  pairs.forEach(([a, b], i) => {
    const m = bracket.matches.find(x => x.id === ids[i]);
    if (m) { m.teamAId = a; m.teamBId = b; }
  });
}

export function simSwissRound(
  tournament: InternationalTournament,
  state: GameState,
  rng: SeededRng,
  roundNum: 1 | 2 | 3,
): void {
  const bracket = tournament.playInBracket;
  if (!bracket) return;

  const prefix = `SW_R${roundNum}_`;
  for (const m of bracket.matches.filter(x => x.id.startsWith(prefix)))
    simTournamentMatch(m, bracket, state, rng, tournament, PLAY_IN_WEIGHT);

  if (roundNum === 3) return;

  const swissTeams = tournament.qualifiedTeams
    .filter(t => t.regionalSeed >= 2)
    .map(t => t.teamId);

  if (roundNum === 1) {
    const pool10 = swissTeams.filter(id => {
      const r = swissRecord(id, bracket.matches);
      return r.wins === 1 && r.losses === 0;
    });
    const pool01 = swissTeams.filter(id => {
      const r = swissRecord(id, bracket.matches);
      return r.wins === 0 && r.losses === 1;
    });
    fillSwissSlots(bracket, ['SW_R2_0', 'SW_R2_1'], pairByStrength(pool10, state));
    fillSwissSlots(bracket, ['SW_R2_2', 'SW_R2_3'], pairByStrength(pool01, state));
  } else {
    const pool11 = swissTeams.filter(id => {
      const r = swissRecord(id, bracket.matches);
      return r.wins === 1 && r.losses === 1;
    });
    fillSwissSlots(bracket, ['SW_R3_0', 'SW_R3_1'], pairByStrength(pool11, state));
  }
}

export function getSwissQualifiers(
  tournament: InternationalTournament,
  state: GameState,
): TournamentSeed[] {
  const bracket = tournament.playInBracket;
  if (!bracket) return [];

  const swissTeams = tournament.qualifiedTeams.filter(t => t.regionalSeed >= 2);
  const qualified = swissTeams
    .map(t => ({ ...t, ...swissRecord(t.teamId, bracket.matches) }))
    .filter(t => t.wins === 2)
    .sort((a, b) => {
      if (a.losses !== b.losses) return a.losses - b.losses; // 2-0 before 2-1
      return getTeamAvgRating(state, b.teamId) - getTeamAvgRating(state, a.teamId);
    });

  return qualified.map((q, i) => ({ ...q, globalSeed: i + 1 }));
}

export function mastersNeedsS1Choice(tournament: InternationalTournament): boolean {
  const bracket = tournament.playInBracket;
  if (!bracket) return false;
  const r3Done = bracket.matches
    .filter(m => m.id.startsWith('SW_R3_'))
    .every(m => m.result !== null);
  return r3Done && tournament.seedOneChoice === null;
}

export function pickAIS1Choice(tournament: InternationalTournament, state: GameState): void {
  const qualifiers = getSwissQualifiers(tournament, state);
  if (qualifiers.length === 0) return;
  const sorted = [...qualifiers].sort(
    (a, b) => getTeamAvgRating(state, a.teamId) - getTeamAvgRating(state, b.teamId)
  );
  tournament.seedOneChoice = sorted[0].teamId;
}

// ─── Masters Main Bracket ─────────────────────────────────────────────────────

export function buildMastersMainBracket(
  tournament: InternationalTournament,
  state: GameState,
): void {
  const chosenSQ = tournament.seedOneChoice;
  if (!chosenSQ) return;

  const seed1s = tournament.qualifiedTeams
    .filter(t => t.regionalSeed === 1)
    .sort((a, b) => a.globalSeed - b.globalSeed);

  const qualifiers = getSwissQualifiers(tournament, state);
  const remaining  = qualifiers.filter(q => q.teamId !== chosenSQ);

  const [S1, S2, S3, S4] = seed1s.map(t => t.teamId);
  const p = (r: string) => `MN_${r}`;

  tournament.mainBracket = {
    champion: null,
    matches: [
      { id: p('UBR1_A'), round: 'MN_UBR1_A', teamAId: S1,                        teamBId: chosenSQ,              format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBSF1'),  feedsLoserTo: p('LBR1_A') },
      { id: p('UBR1_B'), round: 'MN_UBR1_B', teamAId: S2,                        teamBId: remaining[0]?.teamId ?? null, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: p('UBSF1'),  feedsLoserTo: p('LBR1_B') },
      { id: p('UBR1_C'), round: 'MN_UBR1_C', teamAId: S3,                        teamBId: remaining[1]?.teamId ?? null, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: p('UBSF2'),  feedsLoserTo: p('LBR1_A') },
      { id: p('UBR1_D'), round: 'MN_UBR1_D', teamAId: S4,                        teamBId: remaining[2]?.teamId ?? null, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: p('UBSF2'),  feedsLoserTo: p('LBR1_B') },
      { id: p('UBSF1'),  round: 'MN_UBSF1',  teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBF'),    feedsLoserTo: p('LBQF_B') },
      { id: p('UBSF2'),  round: 'MN_UBSF2',  teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBF'),    feedsLoserTo: p('LBQF_A') },
      { id: p('UBF'),    round: 'MN_UBF',    teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('GF'),     feedsLoserTo: p('LBF')    },
      { id: p('LBR1_A'), round: 'MN_LBR1_A', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBQF_A'), feedsLoserTo: null        },
      { id: p('LBR1_B'), round: 'MN_LBR1_B', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBQF_B'), feedsLoserTo: null        },
      { id: p('LBQF_A'), round: 'MN_LBQF_A', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBSF'),   feedsLoserTo: null        },
      { id: p('LBQF_B'), round: 'MN_LBQF_B', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBSF'),   feedsLoserTo: null        },
      { id: p('LBSF'),   round: 'MN_LBSF',   teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBF'),    feedsLoserTo: null        },
      { id: p('LBF'),    round: 'MN_LBF',    teamAId: null, teamBId: null, format: 'bo5', result: null, bracket: 'lower',       feedsWinnerTo: p('GF'),     feedsLoserTo: null        },
      { id: p('GF'),     round: 'MN_GF',     teamAId: null, teamBId: null, format: 'bo5', result: null, bracket: 'grand_final', feedsWinnerTo: null,        feedsLoserTo: null        },
    ],
  };
}

// ─── Champions Group Stage ────────────────────────────────────────────────────

export function initChampionsGroups(tournament: InternationalTournament, rng: SeededRng): void {
  const regions = shuffle(rng, ['americas', 'emea', 'pacific', 'china'] as RegionId[]);
  // Latin square: group g gets region r's team with regional seed (g+r)%4+1
  const groups: string[][] = [[], [], [], []];
  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 4; g++) {
      const seed  = (g + r) % 4 + 1;
      const entry = tournament.qualifiedTeams.find(
        t => t.region === regions[r] && t.regionalSeed === seed
      );
      if (entry) groups[g].push(entry.teamId);
    }
  }

  const matches: PlayoffMatch[] = [];
  for (let g = 0; g < 4; g++) {
    // Sort group by regional seed so positions map to seed rank
    groups[g].sort((a, b) => {
      const sa = tournament.qualifiedTeams.find(t => t.teamId === a)?.regionalSeed ?? 0;
      const sb = tournament.qualifiedTeams.find(t => t.teamId === b)?.regionalSeed ?? 0;
      return sa - sb;
    });
    const [s1, s2, s3, s4] = groups[g];
    const p = (r: string) => `CG_${g}_${r}`;
    matches.push(
      { id: p('UBR1_A'), round: p('UBR1_A'), teamAId: s1,   teamBId: s4,   format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBF'), feedsLoserTo: p('LBR1') },
      { id: p('UBR1_B'), round: p('UBR1_B'), teamAId: s2,   teamBId: s3,   format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBF'), feedsLoserTo: p('LBR1') },
      { id: p('UBF'),    round: p('UBF'),    teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('GF'),  feedsLoserTo: p('LBF')  },
      { id: p('LBR1'),   round: p('LBR1'),   teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBF'), feedsLoserTo: null       },
      { id: p('LBF'),    round: p('LBF'),    teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('GF'),  feedsLoserTo: null       },
      { id: p('GF'),     round: p('GF'),     teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'grand_final', feedsWinnerTo: null,     feedsLoserTo: null       },
    );
  }

  tournament.playInBracket = { matches, champion: null };
}

export function simChampionsGroups(
  tournament: InternationalTournament,
  state: GameState,
  rng: SeededRng,
): void {
  const bracket = tournament.playInBracket;
  if (!bracket) return;
  for (let g = 0; g < 4; g++) {
    const p = (r: string) => `CG_${g}_${r}`;
    for (const roundSuffix of ['UBR1_A', 'UBR1_B', 'UBF', 'LBR1', 'LBF', 'GF']) {
      const m = bracket.matches.find(x => x.id === p(roundSuffix));
      if (m) simTournamentMatch(m, bracket, state, rng, tournament, PLAY_IN_WEIGHT);
    }
  }
}

export function getGroupAdvancers(tournament: InternationalTournament): [string, string][] {
  const bracket = tournament.playInBracket;
  if (!bracket) return [];
  const advancers: [string, string][] = [];
  for (let g = 0; g < 4; g++) {
    const gf = bracket.matches.find(m => m.id === `CG_${g}_GF`);
    if (!gf?.result || !gf.teamAId || !gf.teamBId) continue;
    const winner   = gf.result.winner === 'A' ? gf.teamAId : gf.teamBId;
    const runnerUp = gf.result.winner === 'A' ? gf.teamBId : gf.teamAId;
    advancers.push([winner, runnerUp]);
  }
  return advancers;
}

// ─── Champions Playoff Bracket ────────────────────────────────────────────────

export function buildChampionsPlayoffBracket(
  tournament: InternationalTournament,
  rng: SeededRng,
): void {
  const advancers = getGroupAdvancers(tournament);
  if (advancers.length !== 4) return;

  // Each group pair: one member to top half (slots 1-4), one to bottom half (5-8)
  const topHalf: string[] = [];
  const botHalf: string[] = [];
  for (const [winner, runnerUp] of advancers) {
    if (rng() < 0.5) { topHalf.push(winner); botHalf.push(runnerUp); }
    else              { topHalf.push(runnerUp); botHalf.push(winner); }
  }
  const shuffledTop = shuffle(rng, topHalf);
  const shuffledBot = shuffle(rng, botHalf);

  const [s1, s2, s3, s4] = shuffledTop;
  const [s5, s6, s7, s8] = shuffledBot;
  const p = (r: string) => `CP_${r}`;

  tournament.mainBracket = {
    champion: null,
    matches: [
      { id: p('UBQF_A'), round: 'CP_UBQF_A', teamAId: s1,   teamBId: s8,   format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBSF1'),  feedsLoserTo: p('LBR1_A') },
      { id: p('UBQF_B'), round: 'CP_UBQF_B', teamAId: s2,   teamBId: s7,   format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBSF1'),  feedsLoserTo: p('LBR1_B') },
      { id: p('UBQF_C'), round: 'CP_UBQF_C', teamAId: s3,   teamBId: s6,   format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBSF2'),  feedsLoserTo: p('LBR1_A') },
      { id: p('UBQF_D'), round: 'CP_UBQF_D', teamAId: s4,   teamBId: s5,   format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBSF2'),  feedsLoserTo: p('LBR1_B') },
      { id: p('UBSF1'),  round: 'CP_UBSF1',  teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBF'),    feedsLoserTo: p('LBQF_B') },
      { id: p('UBSF2'),  round: 'CP_UBSF2',  teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('UBF'),    feedsLoserTo: p('LBQF_A') },
      { id: p('UBF'),    round: 'CP_UBF',    teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper',       feedsWinnerTo: p('GF'),     feedsLoserTo: p('LBF')    },
      { id: p('LBR1_A'), round: 'CP_LBR1_A', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBQF_A'), feedsLoserTo: null        },
      { id: p('LBR1_B'), round: 'CP_LBR1_B', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBQF_B'), feedsLoserTo: null        },
      { id: p('LBQF_A'), round: 'CP_LBQF_A', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBSF'),   feedsLoserTo: null        },
      { id: p('LBQF_B'), round: 'CP_LBQF_B', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBSF'),   feedsLoserTo: null        },
      { id: p('LBSF'),   round: 'CP_LBSF',   teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower',       feedsWinnerTo: p('LBF'),    feedsLoserTo: null        },
      { id: p('LBF'),    round: 'CP_LBF',    teamAId: null, teamBId: null, format: 'bo5', result: null, bracket: 'lower',       feedsWinnerTo: p('GF'),     feedsLoserTo: null        },
      { id: p('GF'),     round: 'CP_GF',     teamAId: null, teamBId: null, format: 'bo5', result: null, bracket: 'grand_final', feedsWinnerTo: null,        feedsLoserTo: null        },
    ],
  };
}

// ─── Week Simulators ──────────────────────────────────────────────────────────

function finalizeTournament(
  tournament: InternationalTournament,
  bracket: PlayoffBracket,
  gfId: string,
  state: GameState,
): void {
  const gf = bracket.matches.find(m => m.id === gfId);
  if (!gf?.result) return;
  bracket.champion       = gf.result.winner === 'A' ? gf.teamAId : gf.teamBId;
  tournament.champion    = bracket.champion;
  tournament.runnerUp    = gf.result.winner === 'A' ? gf.teamBId : gf.teamAId;
  tournament.phase       = 'complete';
  tournament.mvpPlayerId = pickTournamentMvp(tournament, state);
}

function simMatchIds(ids: string[], bracket: PlayoffBracket, state: GameState, rng: SeededRng, tournament?: InternationalTournament, weight?: number): void {
  for (const id of ids) {
    const m = bracket.matches.find(x => x.id === id);
    if (m) simTournamentMatch(m, bracket, state, rng, tournament, weight);
  }
}

// Masters: 10 rounds
// 1: Swiss R1 (4)  2: Swiss R2 (4)  3: Swiss R3 + UBR1_A/B → main_event
// 4: UBR1_C/D  5: LBR1  6: UBSF  7: LBQF  8: UBF+LBSF  9: LBF  10: GF
export function simMastersRound(
  tournament: InternationalTournament,
  state: GameState,
  rng: SeededRng,
  round: number,
): void {
  if (round === 1) {
    initSwissStage(tournament, rng);
    simSwissRound(tournament, state, rng, 1);   // sims R1, fills R2 slots
    tournament.phase = 'play_in';
  } else if (round === 2) {
    simSwissRound(tournament, state, rng, 2);   // sims R2, fills R3 slots
  } else if (round === 3) {
    simSwissRound(tournament, state, rng, 3);   // sims R3
    if (!tournament.seedOneChoice) pickAIS1Choice(tournament, state);
    buildMastersMainBracket(tournament, state);
    const bracket = tournament.mainBracket!;
    simMatchIds(['MN_UBR1_A','MN_UBR1_B'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
    tournament.phase = 'main_event';
  } else if (round === 4) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_UBR1_C','MN_UBR1_D'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 5) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_LBR1_A','MN_LBR1_B'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 6) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_UBSF1','MN_UBSF2'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 7) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_LBQF_A','MN_LBQF_B'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 8) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_UBF','MN_LBSF'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 9) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_LBF'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 10) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['MN_GF'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
    finalizeTournament(tournament, bracket, 'MN_GF', state);
  }
}

export const MASTERS_ROUNDS = 10;

// Champions: 9 rounds
// 1: Groups → play_in  2: UBQF_A/B → main_event  3: UBQF_C/D  4: LBR1
// 5: UBSF  6: LBQF  7: UBF+LBSF  8: LBF  9: GF
export function simChampionsRound(
  tournament: InternationalTournament,
  state: GameState,
  rng: SeededRng,
  round: number,
): void {
  if (round === 1) {
    initChampionsGroups(tournament, rng);
    simChampionsGroups(tournament, state, rng);
    tournament.phase = 'play_in';
  } else if (round === 2) {
    buildChampionsPlayoffBracket(tournament, rng);
    const bracket = tournament.mainBracket!;
    simMatchIds(['CP_UBQF_A','CP_UBQF_B'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
    tournament.phase = 'main_event';
  } else if (round === 3) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_UBQF_C','CP_UBQF_D'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 4) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_LBR1_A','CP_LBR1_B'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 5) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_UBSF1','CP_UBSF2'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 6) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_LBQF_A','CP_LBQF_B'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 7) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_UBF','CP_LBSF'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 8) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_LBF'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
  } else if (round === 9) {
    const bracket = tournament.mainBracket; if (!bracket) return;
    simMatchIds(['CP_GF'], bracket, state, rng, tournament, MAIN_EVENT_WEIGHT);
    finalizeTournament(tournament, bracket, 'CP_GF', state);
  }
}

export const CHAMPIONS_ROUNDS = 9;
