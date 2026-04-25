import type {
  Player, Team, Organization, League, Contract, StandingsRow,
  ScheduledMatch, PlayerRoleRatingRecord, RegionId, PlayerRole,
} from '../types';
import {
  LEAGUE_NAMES, LEAGUE_FORMATS, HOME_NATIONALITIES, IMPORT_LIMITS,
  MAP_POOL,
} from '../types';
import type { SeededRng } from './rng';
import { randInt, randFloat, randChoice, shuffle, clamp } from './rng';
import { generatePlayerPool } from './playerGen';

// ─── Org Names per region ────────────────────────────────────────────────────

const ORG_NAMES: Record<RegionId, Array<{ name: string; short: string }>> = {
  americas: [
    { name: 'Sentinels',          short: 'SEN' },
    { name: 'NRG Esports',        short: 'NRG' },
    { name: 'Cloud9',             short: 'C9'  },
    { name: 'Evil Geniuses',      short: 'EG'  },
    { name: 'LOUD',               short: 'LOU' },
    { name: 'MIBR',               short: 'MIB' },
    { name: 'KRÜ Esports',        short: 'KRÜ' },
    { name: 'Leviatán',           short: 'LEV' },
    { name: '100 Thieves',        short: '100T'},
    { name: 'G2 Esports',         short: 'G2'  },
    { name: 'Disguised',          short: 'DSG' },
    { name: 'Ghost Gaming',       short: 'GHO' },
  ],
  emea: [
    { name: 'Fnatic',             short: 'FNC' },
    { name: 'Team Liquid',        short: 'TL'  },
    { name: 'Natus Vincere',      short: 'NAVI'},
    { name: 'Team Vitality',      short: 'VIT' },
    { name: 'BBL Esports',        short: 'BBL' },
    { name: 'NAVI',               short: 'NAV' },
    { name: 'FUT Esports',        short: 'FUT' },
    { name: 'Karmine Corp',       short: 'KC'  },
    { name: 'Giants Gaming',      short: 'GIA' },
    { name: 'Oxygen Esports',     short: 'OXG' },
    { name: 'Guild Esports',      short: 'GUI' },
    { name: 'M8',                 short: 'M8'  },
  ],
  pacific: [
    { name: 'Paper Rex',          short: 'PRX' },
    { name: 'ZETA DIVISION',      short: 'ZET' },
    { name: 'DRX',                short: 'DRX' },
    { name: 'T1',                 short: 'T1'  },
    { name: 'Gen.G',              short: 'GEN' },
    { name: 'Rex Regum Qeon',     short: 'RRQ' },
    { name: 'BOOM Esports',       short: 'BOM' },
    { name: 'Global Esports',     short: 'GE'  },
    { name: 'Bleed Esports',      short: 'BLD' },
    { name: 'TALON Esports',      short: 'TAL' },
    { name: 'Nongshim RedForce',  short: 'NS'  },
    { name: 'Team Secret',        short: 'TS'  },
  ],
  china: [
    { name: 'EDward Gaming',      short: 'EDG' },
    { name: 'FPXFIRE',            short: 'FPX' },
    { name: 'Bilibili Gaming',    short: 'BLG' },
    { name: 'Wolves Esports',     short: 'WOL' },
    { name: 'Dragon Ranger',      short: 'DRG' },
    { name: 'All Gamers',         short: 'AG'  },
    { name: 'TYLOO',              short: 'TYL' },
    { name: 'Nova Esports',       short: 'NOV' },
    { name: 'TRACE Esports',      short: 'TRC' },
    { name: 'Weibo Gaming',       short: 'WBG' },
    { name: 'JDG Esports',        short: 'JDG' },
    { name: 'Rare Atom',          short: 'RA'  },
  ],
};

function generateOrg(
  id: string,
  name: string,
  shortName: string,
  region: RegionId,
  prestige: number,
  teamId: string,
  rng: SeededRng
): Organization {
  return {
    id,
    name,
    shortName,
    region,
    budget: Math.round(randFloat(rng, 2_000_000, 15_000_000) * (0.5 + prestige / 100)),
    prestige,
    fanBase: Math.round(prestige * 1000 + randFloat(rng, 0, 500_000)),
    founded: randInt(rng, 2015, 2021),
    sponsorIncome: Math.round(randFloat(rng, 100_000, 2_000_000) * (0.5 + prestige / 100)),
    prizeEarnings: 0,
    teamId,
    scoutQuality: clamp(Math.round(prestige * 0.7 + randFloat(rng, -10, 10)), 20, 95),
    coachIntelligence: clamp(Math.round(prestige * 0.6 + randFloat(rng, -10, 15)), 20, 95),
  };
}

function generateTeam(
  id: string,
  orgId: string,
  name: string,
  leagueId: string,
  region: RegionId,
  rng: SeededRng
): Team {
  const mapPool: Record<string, number> = {};
  MAP_POOL.forEach(m => { mapPool[m] = randInt(rng, 30, 90); });
  return {
    id,
    orgId,
    name,
    leagueId,
    region,
    rosterIds: [],
    subIds: [],
    coachId: null,
    mapPool,
    morale: 75,
    chemistry: 65,
    wins: 0,
    losses: 0,
    roundDiff: 0,
    mapDiff: 0,
    points: 0,
  };
}

function isHomePlayer(player: Player, region: RegionId): boolean {
  return HOME_NATIONALITIES[region].includes(player.nationality);
}

function assignRoster(
  team: Team,
  players: Player[],
  contracts: Map<string, Contract>,
  season: number,
  rng: SeededRng
): void {
  const { maxImports } = IMPORT_LIMITS[team.region];
  const needed: PlayerRole[] = ['duelist', 'initiator', 'controller', 'sentinel', 'duelist'];
  const roster: Player[] = [];
  let imports = 0;

  for (const role of needed) {
    const eligible = players.filter(p =>
      !p.teamId &&
      p.primaryRole === role &&
      (isHomePlayer(p, team.region) || imports < maxImports)
    ).sort((a, b) => {
      const scoreA = a.trueAim * 0.55 + a.trueGameSense * 0.45;
      const scoreB = b.trueAim * 0.55 + b.trueGameSense * 0.45;
      return (scoreB - scoreA) + (rng() - 0.5) * 10;
    });
    if (eligible.length === 0) {
      // Fallback: any free player
      const any = players.filter(p => !p.teamId);
      if (any.length > 0) {
        const p = any[0];
        roster.push(p);
        if (!isHomePlayer(p, team.region)) imports++;
      }
    } else {
      const p = eligible[0];
      if (!isHomePlayer(p, team.region)) imports++;
      roster.push(p);
    }
  }

  // Sub
  const subEligible = players.filter(p => !p.teamId).slice(0, 1);
  const subs = subEligible.slice(0, 1);

  [...roster, ...subs].forEach(p => {
    p.teamId = team.id;
    const contractId = `c${p.id}`;
    p.contractId = contractId;
    contracts.set(contractId, {
      id: contractId,
      playerId: p.id,
      teamId: team.id,
      salary: p.salary,
      length: randInt(rng, 1, 3),
      buyout: Math.round(p.salary * randFloat(rng, 1.5, 3.0)),
      startSeason: season,
      endSeason: season + randInt(rng, 0, 2),
    });
  });

  team.rosterIds = roster.map(p => p.id);
  team.subIds = subs.map(p => p.id);
}

// ─── Schedule Generation ──────────────────────────────────────────────────────

export function generateSchedule(
  league: League,
  season: number,
  rng: SeededRng
): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];
  const { groups, format } = league;
  if (!groups) return matches;

  const groups_ = [groups.groupA, groups.groupB];
  let matchIdCounter = 0;

  for (const group of groups_) {
    // Round-robin within group over 3 acts (8 weeks)
    const pairs: [string, string][] = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs.push([group[i], group[j]]);
      }
    }

    const shuffled = shuffle(rng, pairs);
    const totalWeeks = format.regularSeasonWeeks;
    shuffled.forEach((pair, idx) => {
      const week = (idx % totalWeeks) + 1;
      const act = week <= 3 ? 1 : week <= 6 ? 2 : 3;
      matches.push({
        id: `m${season}_${league.id}_${matchIdCounter++}`,
        leagueId: league.id,
        season,
        act,
        week,
        teamAId: pair[0],
        teamBId: pair[1],
        format: format.regularSeason,
        result: null,
        isPlayoff: false,
        playoffRound: null,
      });
    });
  }

  return matches;
}

// ─── Standings Init ───────────────────────────────────────────────────────────

export function initStandings(league: League, season: number): StandingsRow[] {
  return league.teamIds.map(teamId => ({
    teamId,
    leagueId: league.id,
    season,
    wins: 0,
    losses: 0,
    roundsWon: 0,
    roundsLost: 0,
    roundDiff: 0,
    mapDiff: 0,
    points: 0,
  }));
}

export function sortStandings(standings: StandingsRow[]): StandingsRow[] {
  return [...standings].sort((a, b) =>
    b.points - a.points || b.mapDiff - a.mapDiff || b.roundDiff - a.roundDiff
  );
}

export function updateStandingsAfterMatch(
  standings: Map<string, StandingsRow>,
  leagueId: string,
  season: number,
  match: ScheduledMatch
): void {
  if (!match.result) return;
  const { winner, winsA, winsB, mapResults } = match.result;

  const rowA = standings.get(`${leagueId}:${season}:${match.teamAId}`) ??
    { teamId: match.teamAId, leagueId, season, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, roundDiff: 0, mapDiff: 0, points: 0 };
  const rowB = standings.get(`${leagueId}:${season}:${match.teamBId}`) ??
    { teamId: match.teamBId, leagueId, season, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, roundDiff: 0, mapDiff: 0, points: 0 };

  let totalRoundsA = 0, totalRoundsB = 0;
  mapResults.forEach(m => { totalRoundsA += m.scoreA; totalRoundsB += m.scoreB; });

  if (winner === 'A') {
    rowA.wins++; rowB.losses++;
    rowA.points += winsB === 0 ? 3 : 3; // 3 for series win
    rowB.points += winsA > 0 ? 1 : 0;   // 1 for at least 1 map
  } else {
    rowB.wins++; rowA.losses++;
    rowB.points += winsA === 0 ? 3 : 3;
    rowA.points += winsB > 0 ? 1 : 0;
  }

  rowA.roundsWon += totalRoundsA; rowA.roundsLost += totalRoundsB;
  rowB.roundsWon += totalRoundsB; rowB.roundsLost += totalRoundsA;
  rowA.roundDiff = rowA.roundsWon - rowA.roundsLost;
  rowB.roundDiff = rowB.roundsWon - rowB.roundsLost;
  rowA.mapDiff += winsA - winsB;
  rowB.mapDiff += winsB - winsA;

  standings.set(`${leagueId}:${season}:${match.teamAId}`, rowA);
  standings.set(`${leagueId}:${season}:${match.teamBId}`, rowB);
}

// ─── Playoffs ─────────────────────────────────────────────────────────────────

import type { PlayoffBracket, PlayoffMatch } from '../types';
import { GRAND_FINAL_FATIGUE_BASE, FATIGUE_PER_EXTRA_MAP } from '../types';

export function buildPlayoffBracket(
  leagueId: string,
  season: number,
  seededTeams: string[]
): PlayoffBracket {
  // seededTeams[0] = s1, ..., seededTeams[5] = s6
  const [s1, s2, s3, s4, s5, s6] = seededTeams;

  const matches: PlayoffMatch[] = [
    // Upper Quarterfinals
    { id: `pUQF1_${leagueId}_${season}`, round: 'UQF1', teamAId: s3, teamBId: s6, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: `pUSF1_${leagueId}_${season}`, feedsLoserTo: `pLR1_${leagueId}_${season}` },
    { id: `pUQF2_${leagueId}_${season}`, round: 'UQF2', teamAId: s4, teamBId: s5, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: `pUSF2_${leagueId}_${season}`, feedsLoserTo: `pLR1_${leagueId}_${season}` },
    // Upper Semifinals
    { id: `pUSF1_${leagueId}_${season}`, round: 'USF1', teamAId: s1, teamBId: null, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: `pUF_${leagueId}_${season}`, feedsLoserTo: `pLSF_${leagueId}_${season}` },
    { id: `pUSF2_${leagueId}_${season}`, round: 'USF2', teamAId: s2, teamBId: null, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: `pUF_${leagueId}_${season}`, feedsLoserTo: `pLF_${leagueId}_${season}` },
    // Upper Final
    { id: `pUF_${leagueId}_${season}`, round: 'UF', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'upper', feedsWinnerTo: `pGF_${leagueId}_${season}`, feedsLoserTo: null },
    // Lower bracket
    { id: `pLR1_${leagueId}_${season}`, round: 'LR1', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower', feedsWinnerTo: `pLSF_${leagueId}_${season}`, feedsLoserTo: null },
    { id: `pLSF_${leagueId}_${season}`, round: 'LSF', teamAId: null, teamBId: null, format: 'bo3', result: null, bracket: 'lower', feedsWinnerTo: `pLF_${leagueId}_${season}`, feedsLoserTo: null },
    { id: `pLF_${leagueId}_${season}`, round: 'LF', teamAId: null, teamBId: null, format: 'bo5', result: null, bracket: 'lower', feedsWinnerTo: `pGF_${leagueId}_${season}`, feedsLoserTo: null },
    // Grand Final
    { id: `pGF_${leagueId}_${season}`, round: 'GF', teamAId: null, teamBId: null, format: 'bo5', result: null, bracket: 'grand_final', feedsWinnerTo: null, feedsLoserTo: null },
  ];

  return { matches, champion: null };
}

export function getGrandFinalFatigueMod(lowerFinal: PlayoffMatch): { upperMod: number; lowerMod: number } {
  const mapsPlayed = lowerFinal.result?.mapResults.length ?? 3;
  const extraMaps = Math.max(0, mapsPlayed - 3);
  const fatiguePenalty = GRAND_FINAL_FATIGUE_BASE + extraMaps * FATIGUE_PER_EXTRA_MAP;
  return { upperMod: 1.0, lowerMod: 1.0 - fatiguePenalty };
}

// ─── Full League Init ─────────────────────────────────────────────────────────

export interface LeagueInitResult {
  orgs: Organization[];
  teams: Team[];
  players: Player[];
  roleRatings: PlayerRoleRatingRecord[];
  contracts: Map<string, Contract>;
  league: League;
  challengers: League;
  standings: StandingsRow[];
  matches: ScheduledMatch[];
}

export function initLeague(regionId: RegionId, seed: number, rng: SeededRng): LeagueInitResult {
  const orgNames = ORG_NAMES[regionId];
  const partnershipFormat = LEAGUE_FORMATS.partnership;
  const challengersFormat = LEAGUE_FORMATS.challengers;

  const leagueId = `league_${regionId}_partner`;
  const challengersId = `league_${regionId}_challengers`;

  // Generate player pool: 90 contracted + 40 free agents = 130
  const allGenerated = generatePlayerPool(130, rng);
  const allPlayers = allGenerated.map(g => g.player);
  const allRoleRatings = allGenerated.flatMap(g => g.roleRatings);

  // Sort players by overall quality for draft
  allPlayers.sort((a, b) => {
    const qa = a.trueAim * 0.55 + a.trueGameSense * 0.45;
    const qb = b.trueAim * 0.55 + b.trueGameSense * 0.45;
    return qb - qa;
  });

  // Create orgs & teams for partnership league
  const orgs: Organization[] = [];
  const teams: Team[] = [];
  const contracts = new Map<string, Contract>();

  // Prestige distribution: top 3 get 80-95, middle 6 get 55-75, bottom 3 get 30-54
  const prestigeValues = shuffle(rng, [
    ...Array.from({ length: 3 }, (_, i) => 80 + i * 5),
    ...Array.from({ length: 6 }, (_, i) => 55 + i * 4),
    ...Array.from({ length: 3 }, (_, i) => 30 + i * 8),
  ]);

  const partnershipTeamIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const teamId = `t${regionId}_${i}`;
    const orgId = `o${regionId}_${i}`;
    const org = generateOrg(orgId, orgNames[i].name, orgNames[i].short, regionId, prestigeValues[i], teamId, rng);
    const team = generateTeam(teamId, orgId, orgNames[i].name, leagueId, regionId, rng);
    orgs.push(org);
    teams.push(team);
    partnershipTeamIds.push(teamId);
  }

  // Assign rosters: higher prestige picks first (with noise)
  const orderedByPrestige = [...orgs].sort((a, b) => b.prestige - a.prestige + (rng() - 0.5) * 20);
  for (const org of orderedByPrestige) {
    const team = teams.find(t => t.id === org.teamId)!;
    assignRoster(team, allPlayers, contracts, 1, rng);
  }

  // Challengers teams (8, simpler setup)
  const challengersTeamIds: string[] = [];
  const challengersOrgNames = [
    { name: `${LEAGUE_NAMES[regionId].challengers} A`, short: 'CHA' },
    { name: `${LEAGUE_NAMES[regionId].challengers} B`, short: 'CHB' },
    { name: `${LEAGUE_NAMES[regionId].challengers} C`, short: 'CHC' },
    { name: `${LEAGUE_NAMES[regionId].challengers} D`, short: 'CHD' },
    { name: `${LEAGUE_NAMES[regionId].challengers} E`, short: 'CHE' },
    { name: `${LEAGUE_NAMES[regionId].challengers} F`, short: 'CHF' },
    { name: `${LEAGUE_NAMES[regionId].challengers} G`, short: 'CHG' },
    { name: `${LEAGUE_NAMES[regionId].challengers} H`, short: 'CHH' },
  ];

  for (let i = 0; i < 8; i++) {
    const teamId = `tc${regionId}_${i}`;
    const orgId = `oc${regionId}_${i}`;
    const org = generateOrg(orgId, challengersOrgNames[i].name, challengersOrgNames[i].short, regionId, 25 + i * 3, teamId, rng);
    const team = generateTeam(teamId, orgId, challengersOrgNames[i].name, challengersId, regionId, rng);
    orgs.push(org);
    teams.push(team);
    challengersTeamIds.push(teamId);
    assignRoster(team, allPlayers, contracts, 1, rng);
  }

  // Build group seeding (snake draft)
  const groupA: string[] = [];
  const groupB: string[] = [];
  partnershipTeamIds.forEach((id, idx) => {
    if ([0, 3, 4, 7, 8, 11].includes(idx)) groupA.push(id);
    else groupB.push(id);
  });

  const league: League = {
    id: leagueId,
    name: LEAGUE_NAMES[regionId].partnership,
    region: regionId,
    tier: 'partnership',
    teamIds: partnershipTeamIds,
    groups: { groupA, groupB },
    currentSeason: 1,
    currentAct: 1,
    format: partnershipFormat,
    previousSeasonRankings: null,
  };

  const challengers: League = {
    id: challengersId,
    name: LEAGUE_NAMES[regionId].challengers,
    region: regionId,
    tier: 'challengers',
    teamIds: challengersTeamIds,
    groups: null,
    currentSeason: 1,
    currentAct: 1,
    format: challengersFormat,
    previousSeasonRankings: null,
  };

  const standings = [
    ...initStandings(league, 1),
    ...initStandings(challengers, 1),
  ];

  const matches = [
    ...generateSchedule(league, 1, rng),
    ...generateSchedule(challengers, 1, rng),
  ];

  return {
    orgs, teams,
    players: allPlayers,
    roleRatings: allRoleRatings,
    contracts,
    league,
    challengers,
    standings,
    matches,
  };
}
