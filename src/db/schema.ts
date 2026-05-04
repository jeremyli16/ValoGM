import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Player, PlayerRoleRatingRecord, Team, Organization, League,
  Contract, ScheduledMatch, StandingsRow, TransferOffer,
  Notification, PlayerMatchStat, GameState, Coach,
  SplitRecord, SeasonRecord, PlayoffBracket, InternationalTournament,
} from '../types';

export interface ValoGMSchema extends DBSchema {
  players: {
    key: string;
    value: Player;
    indexes: {
      'by-team': string;
      'by-nationality': string;
      'by-role': string;
    };
  };
  playerRoleRatings: {
    key: string;
    value: PlayerRoleRatingRecord;
    indexes: { 'by-player': string };
  };
  teams: {
    key: string;
    value: Team;
    indexes: { 'by-league': string; 'by-org': string };
  };
  orgs: {
    key: string;
    value: Organization;
    indexes: { 'by-region': string };
  };
  leagues: {
    key: string;
    value: League;
    indexes: { 'by-region': string };
  };
  matches: {
    key: string;
    value: ScheduledMatch;
    indexes: {
      'by-league-week': [string, number, number];
      'by-team': string;
      'by-season': number;
    };
  };
  contracts: {
    key: string;
    value: Contract;
    indexes: { 'by-player': string; 'by-team': string };
  };
  playerMatchStats: {
    key: string;
    value: PlayerMatchStat & { id: string; season: number };
    indexes: {
      'by-match': string;
      'by-player': string;
    };
  };
  standings: {
    key: string;
    value: StandingsRow;
    indexes: { 'by-league-season': [string, number] };
  };
  transferOffers: {
    key: string;
    value: TransferOffer;
    indexes: { 'by-player': string; 'by-to-team': string; 'by-from-team': string };
  };
  notifications: {
    key: string;
    value: Notification;
    indexes: { 'by-read': number };
  };
  coaches: {
    key: string;
    value: Coach;
    indexes: { 'by-team': string };
  };
  gameState: {
    key: string;
    value: SerializedGameState;
  };
}

export interface SerializedGameState {
  id: 'current';
  phase: GameState['phase'];
  season: number;
  act: number;
  week: number;
  playerTeamId: string;
  leagueId: string;
  regionId: GameState['regionId'];
  seed: number;
  freeAgents: string[];
  freeAgentCoaches: string[];
  otherLeagueIds?: string[];
  otherPlayoffBrackets?: Record<string, PlayoffBracket>;
  activeInternationalTournament?: InternationalTournament | null;
  tournamentHistory?: InternationalTournament[];
  splitHistory?: SplitRecord[];
  seasonHistory?: SeasonRecord[];
  activeMapPool?: string[];
  agentMeta?: Record<string, number>;
  agentMapMeta?: Record<string, Record<string, number>>;
  playoffBracket?: PlayoffBracket | null;
}

let _db: IDBPDatabase<ValoGMSchema> | null = null;

export async function getDb(): Promise<IDBPDatabase<ValoGMSchema>> {
  if (_db) return _db;
  _db = await openDB<ValoGMSchema>('valorant-gm', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // players
        const players = db.createObjectStore('players', { keyPath: 'id' });
        players.createIndex('by-team', 'teamId');
        players.createIndex('by-nationality', 'nationality');
        players.createIndex('by-role', 'primaryRole');

        // playerRoleRatings
        const prr = db.createObjectStore('playerRoleRatings', { keyPath: 'id' });
        prr.createIndex('by-player', 'playerId');

        // teams
        const teams = db.createObjectStore('teams', { keyPath: 'id' });
        teams.createIndex('by-league', 'leagueId');
        teams.createIndex('by-org', 'orgId');

        // orgs
        const orgs = db.createObjectStore('orgs', { keyPath: 'id' });
        orgs.createIndex('by-region', 'region');

        // leagues
        const leagues = db.createObjectStore('leagues', { keyPath: 'id' });
        leagues.createIndex('by-region', 'region');

        // matches
        const matches = db.createObjectStore('matches', { keyPath: 'id' });
        matches.createIndex('by-league-week', ['leagueId', 'act', 'week']);
        matches.createIndex('by-team', 'teamAId');
        matches.createIndex('by-season', 'season');

        // contracts
        const contracts = db.createObjectStore('contracts', { keyPath: 'id' });
        contracts.createIndex('by-player', 'playerId');
        contracts.createIndex('by-team', 'teamId');

        // playerMatchStats
        const pms = db.createObjectStore('playerMatchStats', { keyPath: 'id' });
        pms.createIndex('by-match', 'matchId');
        pms.createIndex('by-player', 'playerId');

        // standings
        const standings = db.createObjectStore('standings', { keyPath: 'id' });
        standings.createIndex('by-league-season', ['leagueId', 'season']);

        // transferOffers
        const to = db.createObjectStore('transferOffers', { keyPath: 'id' });
        to.createIndex('by-player', 'playerId');
        to.createIndex('by-to-team', 'toTeamId');
        to.createIndex('by-from-team', 'fromTeamId');

        // notifications
        const notifs = db.createObjectStore('notifications', { keyPath: 'id' });
        notifs.createIndex('by-read', 'read');

        // gameState
        db.createObjectStore('gameState', { keyPath: 'id' });
      }

      if (oldVersion < 2) {
        const coaches = db.createObjectStore('coaches', { keyPath: 'id' });
        coaches.createIndex('by-team', 'teamId');
      }
    },
  });
  return _db;
}
