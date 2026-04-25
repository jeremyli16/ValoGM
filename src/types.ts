// ─── Core Enums & Primitives ────────────────────────────────────────────────

export type PlayerRole = 'duelist' | 'initiator' | 'controller' | 'sentinel';
export type BuyType = 'fullBuy' | 'halfBuy' | 'forceBuy' | 'eco' | 'pistol';
export type RegionId = 'americas' | 'emea' | 'pacific' | 'china';
export type GamePhase = 'preseason' | 'regular_season' | 'playoffs' | 'offseason' | 'new_game';
export type PlayerArchetype = 'prodigy' | 'star' | 'veteran' | 'journeyman' | 'specialist';
export type LeagueTier = 'partnership' | 'challengers';
export type TransferStatus = 'pending' | 'accepted' | 'rejected' | 'countered';

// ─── Player ─────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  alias: string;
  nationality: string;
  region: RegionId;
  age: number;
  peakAge: number;
  primaryRole: PlayerRole;
  mainAgent: string;
  archetype: PlayerArchetype;

  trueAim: number;
  trueGameSense: number;
  potential: number;

  aim: number;
  gameSense: number;

  clutch: number;
  communication: number;
  adaptability: number;

  morale: number;
  salary: number;

  teamId: string | null;
  contractId: string | null;

  dirtyFlag?: boolean;
}

export interface PlayerRoleRatingRecord {
  id: string;
  playerId: string;
  role: PlayerRole;
  trueRating: number;
  scoutedRating: number | null;
  scoutConfidence: number;
  lastPlayedSeason: number | null;
}

// ─── Organization & Team ────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  shortName: string;
  region: RegionId;
  budget: number;
  prestige: number;
  fanBase: number;
  founded: number;
  sponsorIncome: number;
  prizeEarnings: number;
  teamId: string;
  scoutQuality: number;
  coachIntelligence: number;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  leagueId: string;
  region: RegionId;
  rosterIds: string[];
  subIds: string[];
  coachId: string | null;
  mapPool: Record<string, number>;
  morale: number;
  chemistry: number;
  wins: number;
  losses: number;
  roundDiff: number;
  mapDiff: number;
  points: number;
}

// ─── League ─────────────────────────────────────────────────────────────────

export interface LeagueFormat {
  teamsPerLeague: number;
  playoffTeams: number;
  playoffBye: number;
  regularSeasonWeeks: number;
  regularSeason: 'bo1' | 'bo3' | 'bo5';
}

export interface League {
  id: string;
  name: string;
  region: RegionId;
  tier: LeagueTier;
  teamIds: string[];
  groups: { groupA: string[]; groupB: string[] } | null;
  currentSeason: number;
  currentAct: number;
  format: LeagueFormat;
  previousSeasonRankings: Record<string, number> | null;
}

// ─── Contracts & Transfers ───────────────────────────────────────────────────

export interface Contract {
  id: string;
  playerId: string;
  teamId: string;
  salary: number;
  length: number;
  buyout: number;
  startSeason: number;
  endSeason: number;
}

export interface TransferOffer {
  id: string;
  playerId: string;
  fromTeamId: string;
  toTeamId: string;
  fee: number;
  offeredSalary: number;
  contractLength: number;
  status: TransferStatus;
  deadline: number;
}

// ─── Match & Scheduling ──────────────────────────────────────────────────────

export type MatchFormat = 'bo1' | 'bo3' | 'bo5';

export interface ScheduledMatch {
  id: string;
  leagueId: string;
  season: number;
  act: number;
  week: number;
  teamAId: string;
  teamBId: string;
  format: MatchFormat;
  result: MatchResult | null;
  isPlayoff: boolean;
  playoffRound: string | null;
}

export interface MapResult {
  mapName: string;
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B';
  roundResults: RoundResultSummary[];
}

export interface RoundResultSummary {
  roundNum: number;
  winner: 'attack' | 'defense';
  planted: boolean;
  buyTypeA: BuyType;
  buyTypeB: BuyType;
}

export interface MatchResult {
  winner: 'A' | 'B';
  winsA: number;
  winsB: number;
  mapResults: MapResult[];
  mvpId: string | null;
  playerStats: PlayerMatchStat[];
}

export interface PlayerMatchStat {
  playerId: string;
  matchId: string;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  rating: number;
}

// ─── Standings ───────────────────────────────────────────────────────────────

export interface StandingsRow {
  teamId: string;
  leagueId: string;
  season: number;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  roundDiff: number;
  mapDiff: number;
  points: number;
}

// ─── Playoffs ────────────────────────────────────────────────────────────────

export interface PlayoffMatch {
  id: string;
  round: string;
  teamAId: string | null;
  teamBId: string | null;
  format: MatchFormat;
  result: MatchResult | null;
  bracket: 'upper' | 'lower' | 'grand_final';
  feedsWinnerTo: string | null;
  feedsLoserTo: string | null;
}

export interface PlayoffBracket {
  matches: PlayoffMatch[];
  champion: string | null;
}

// ─── Notifications & Decisions ───────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'match_result' | 'contract_expiring' | 'transfer_offer' | 'scout_report' | 'playoff' | 'development';
  title: string;
  body: string;
  week: number;
  read: boolean;
  data?: Record<string, string | number | boolean>;
}

export interface Decision {
  id: string;
  type: 'contract_renewal' | 'transfer_response' | 'lineup_choice';
  description: string;
  deadline: number;
  data: Record<string, string | number | boolean>;
}

// ─── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  season: number;
  act: number;
  week: number;
  playerTeamId: string;
  leagueId: string;
  regionId: RegionId;
  seed: number;

  players: Map<string, Player>;
  teams: Map<string, Team>;
  orgs: Map<string, Organization>;
  leagues: Map<string, League>;
  contracts: Map<string, Contract>;
  matches: Map<string, ScheduledMatch>;
  standings: Map<string, StandingsRow>;
  roleRatings: Map<string, PlayerRoleRatingRecord>;

  freeAgents: string[];
  pendingDecisions: Decision[];
  notifications: Notification[];
  transferOffers: TransferOffer[];
  playoffBracket: PlayoffBracket | null;

  dirtyPlayers: Set<string>;
  dirtyMatches: Set<string>;
}

// ─── Economy Constants ────────────────────────────────────────────────────────

export const LOSS_BONUS: Record<number, number> = {
  0: 1900,
  1: 2400,
  2: 2900,
};
export const KILL_BONUS = 200;
export const SURVIVAL_BONUS = 1000;
export const WIN_INCOME = 3000;
export const SPIKE_PLANT_BONUS = 300;
export const CREDIT_CAP = 9000;
export const FULL_BUY_THRESHOLD = 3900;
export const HALF_BUY_THRESHOLD = 2400;

export function getLossBonus(lossStreak: number): number {
  return LOSS_BONUS[Math.min(lossStreak, 2)];
}

// ─── Match Sim Constants ──────────────────────────────────────────────────────

export const SIDE_MODS: Record<PlayerRole, { attack: number; defense: number }> = {
  duelist:    { attack: 1.12, defense: 0.92 },
  initiator:  { attack: 1.05, defense: 1.00 },
  controller: { attack: 0.95, defense: 1.10 },
  sentinel:   { attack: 0.88, defense: 1.18 },
};

export const EQUIP_MOD: Record<BuyType, number> = {
  fullBuy:  1.00,
  halfBuy:  0.78,
  forceBuy: 0.72,
  eco:      0.52,
  pistol:   0.65,
};

// ─── League Format Constants ──────────────────────────────────────────────────

export const LEAGUE_FORMATS: Record<LeagueTier, LeagueFormat> = {
  partnership: {
    teamsPerLeague: 12,
    playoffTeams: 6,
    playoffBye: 2,
    regularSeasonWeeks: 8,
    regularSeason: 'bo3',
  },
  challengers: {
    teamsPerLeague: 8,
    playoffTeams: 2,
    playoffBye: 0,
    regularSeasonWeeks: 6,
    regularSeason: 'bo3',
  },
};

export const LEAGUE_NAMES: Record<RegionId, { partnership: string; challengers: string }> = {
  americas: { partnership: 'VCT Americas',   challengers: 'VCT Challengers Americas' },
  emea:     { partnership: 'VCT EMEA',       challengers: 'VCT Challengers EMEA' },
  pacific:  { partnership: 'VCT Pacific',    challengers: 'VCT Challengers Pacific' },
  china:    { partnership: 'VCT CN',         challengers: 'VCT Challengers CN' },
};

export const HOME_NATIONALITIES: Record<RegionId, string[]> = {
  americas: ['USA', 'Canada', 'Brazil', 'Argentina', 'Chile', 'Mexico', 'Colombia'],
  emea:     ['UK', 'France', 'Germany', 'Sweden', 'Denmark', 'Finland', 'Norway',
             'Spain', 'Poland', 'Russia', 'Turkey', 'Ukraine', 'Portugal', 'Belgium'],
  pacific:  ['South Korea', 'Japan', 'Australia', 'Philippines', 'Thailand',
             'Indonesia', 'Singapore', 'New Zealand', 'Taiwan'],
  china:    ['China'],
};

export const IMPORT_LIMITS: Record<RegionId, { maxImports: number }> = {
  americas: { maxImports: 1 },
  emea:     { maxImports: 1 },
  pacific:  { maxImports: 1 },
  china:    { maxImports: 1 },
};

export const ROLE_AGENTS: Record<PlayerRole, string[]> = {
  duelist:    ['Jett', 'Reyna', 'Raze', 'Neon', 'Iso', 'Yoru'],
  initiator:  ['Sova', 'Fade', 'Breach', 'KAY/O', 'Gekko', 'Skye'],
  controller: ['Omen', 'Astra', 'Viper', 'Brimstone', 'Clove', 'Harbor'],
  sentinel:   ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse'],
};

export const MAP_POOL = [
  'Ascent', 'Bind', 'Haven', 'Split', 'Fracture',
  'Pearl', 'Lotus', 'Sunset', 'Abyss',
];

// ─── Player Generation Constants ──────────────────────────────────────────────

export const ARCHETYPE_WEIGHTS: Record<PlayerArchetype, number> = {
  prodigy:    0.15,
  star:       0.20,
  veteran:    0.15,
  journeyman: 0.35,
  specialist: 0.15,
};

export const AGE_RANGES: Record<PlayerArchetype, [number, number]> = {
  prodigy:    [17, 20],
  star:       [21, 25],
  veteran:    [26, 30],
  journeyman: [21, 28],
  specialist: [19, 28],
};

export const QUALITY_RANGES: Record<PlayerArchetype, { min: number; max: number }> = {
  prodigy:    { min: 45, max: 70 },
  star:       { min: 72, max: 92 },
  veteran:    { min: 60, max: 80 },
  journeyman: { min: 48, max: 68 },
  specialist: { min: 55, max: 78 },
};

export const SALARY_RANGES: Record<PlayerArchetype, [number, number]> = {
  prodigy:    [30_000,  80_000],
  star:       [150_000, 500_000],
  veteran:    [80_000,  200_000],
  journeyman: [40_000,  100_000],
  specialist: [60_000,  180_000],
};

export const OFF_ROLE_BASE: Record<PlayerArchetype, number> = {
  prodigy:    35,
  star:       45,
  veteran:    55,
  journeyman: 50,
  specialist: 20,
};

// ─── Morale Constants ─────────────────────────────────────────────────────────

export const MORALE_BASELINE = 75;
export const MORALE_DECAY_RATE = 0.05;
export const MORALE_WIN_DELTA = 8;
export const MORALE_LOSS_DELTA = -6;
export const PLAYER_WIN_DELTA = 5;
export const PLAYER_LOSS_DELTA = -4;

// ─── Player Development ───────────────────────────────────────────────────────

export const SEASONS_TO_DECAY = 3;
export const MAX_DECAY_PER_SEASON = 8;
export const MAX_GROWTH_PER_SEASON = 6;

// ─── Grand Final Fatigue ──────────────────────────────────────────────────────

export const GRAND_FINAL_FATIGUE_BASE = 0.04;
export const FATIGUE_PER_EXTRA_MAP = 0.015;
