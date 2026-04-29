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
  agentPool?: string[];
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

// ─── Coach ──────────────────────────────────────────────────────────────────

export type CoachRole = 'head' | 'assistant';

export interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  age: number;
  salary: number;
  tactics: number;      // 0-99: boosts effective gameSense and clutch in matches
  scouting: number;     // 0-99: improves role rating confidence on own team's players
  moraleBoost: number;  // 0-99: increases win morale gain, reduces loss morale loss
  teamId: string | null;
  role: CoachRole | null;
  contractEndSeason: number | null;
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
  headCoachId: string | null;
  assistantCoachId: string | null;
  mapPool: Record<string, number>;
  mapComps?: Record<string, string[]>;
  practiceAllocation?: Record<string, number>;
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
  fromTeamId: string;  // buying team (state.playerTeamId)
  toTeamId: string;    // player's current team, or '' for free agents
  fee: number;
  offeredSalary: number;
  contractLength: number;
  status: TransferStatus;
  deadline: number;
  counterSalary?: number;
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
  acs: number;
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

// ─── League History ───────────────────────────────────────────────────────────

// calendarSeason groups every 3 game-seasons (1 = game-seasons 1-3, 2 = 4-6, …)
// splitNum is 1, 2, or 3 within that calendar season
export interface SplitRecord {
  calendarSeason: number;
  splitNum: number;
  winnerTeamId: string;
  runnerUpTeamId: string;
  mvpPlayerId: string;
}

// Captured at the end of every 3rd game-season (splitNum === 3)
export interface SeasonRecord {
  season: number;          // calendar season number (1, 2, 3 …)
  championTeamId: string;  // winner of the final (3rd) split
  mvpPlayerId: string;
  bestDuelistId: string;
  bestInitiatorId: string;
  bestControllerId: string;
  bestSentinelId: string;
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

  coaches: Map<string, Coach>;
  freeAgents: string[];
  freeAgentCoaches: string[];
  pendingDecisions: Decision[];
  notifications: Notification[];
  transferOffers: TransferOffer[];
  playoffBracket: PlayoffBracket | null;

  splitHistory: SplitRecord[];
  seasonHistory: SeasonRecord[];
  activeMapPool: string[];

  agentMeta: Record<string, number>;
  agentMapMeta: Record<string, Record<string, number>>;
  agentPickCounts: Record<string, number>;

  dirtyPlayers: Set<string>;
  dirtyMatches: Set<string>;
  dirtyCoaches: Set<string>;
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
    playoffTeams: 8,
    playoffBye: 2,
    regularSeasonWeeks: 5,
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

// Full map universe — 12 maps. Only 7 are active at a time (see GameState.activeMapPool).
export const MAP_POOL = [
  'Ascent', 'Bind', 'Haven', 'Split', 'Fracture',
  'Pearl', 'Lotus', 'Sunset', 'Abyss',
  'Icebox', 'Breeze', 'Corrode',
];

// Attack-side win-rate bias per map (0 = perfectly balanced).
// Based on VLR.gg pro play data across 2023–2025 international events.
export const MAP_ATTACK_BIAS: Record<string, number> = {
  Ascent:   +0.03,
  Bind:     +0.01,
  Haven:    +0.02,
  Split:    -0.03,
  Fracture: +0.02,
  Pearl:    -0.02,
  Lotus:    +0.00,
  Sunset:   +0.01,
  Abyss:    +0.02,
  Icebox:   -0.03,
  Breeze:   -0.02,
  Corrode:  -0.03,
};

// ─── Agent Meta Constants ─────────────────────────────────────────────────────

export const AGENT_BASELINES: Record<string, number> = {
  Jett: 70, Reyna: 60, Raze: 68, Neon: 55, Iso: 52, Yoru: 48,
  Sova: 72, Fade: 65, Breach: 62, 'KAY/O': 58, Gekko: 60, Skye: 63,
  Omen: 68, Astra: 66, Viper: 70, Brimstone: 58, Clove: 62, Harbor: 42,
  Killjoy: 72, Cypher: 68, Sage: 60, Chamber: 58, Deadlock: 50, Vyse: 48,
};

export const PRACTICE_BUDGET = 5;

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

// ─── Transfer Constants ───────────────────────────────────────────────────────

export const BENCH_SALARY_FACTOR = 0.5;

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
