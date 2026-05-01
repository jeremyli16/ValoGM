import { getDb, type SerializedGameState, type ValoGMSchema } from './schema';
import type {
  Player, PlayerRoleRatingRecord, Team, Organization, League,
  Contract, ScheduledMatch, StandingsRow, TransferOffer,
  Notification, PlayerMatchStat, GameState, Coach,
} from '../types';
import { MAP_POOL, AGENT_BASELINES } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function bulkPut<T>(storeName: string, items: T[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(storeName as any, 'readwrite');
  await Promise.all(items.map((item: any) => tx.store.put(item)));
  await tx.done;
}

// ─── PlayerRepository ─────────────────────────────────────────────────────────

export const playerRepo = {
  async get(id: string): Promise<Player | undefined> {
    return (await getDb()).get('players', id);
  },
  async getMany(ids: string[]): Promise<Player[]> {
    const db = await getDb();
    const results = await Promise.all(ids.map(id => db.get('players', id)));
    return results.filter(Boolean) as Player[];
  },
  async getByTeam(teamId: string): Promise<Player[]> {
    return (await getDb()).getAllFromIndex('players', 'by-team', teamId);
  },
  async getFreeAgents(): Promise<Player[]> {
    const all = await (await getDb()).getAll('players');
    return all.filter(p => !p.teamId);
  },
  async getByRole(role: string): Promise<Player[]> {
    return (await getDb()).getAllFromIndex('players', 'by-role', role);
  },
  async put(player: Player): Promise<void> {
    await (await getDb()).put('players', player);
  },
  async putMany(players: Player[]): Promise<void> {
    await bulkPut('players', players);
  },
};

// ─── PlayerRoleRatingRepository ───────────────────────────────────────────────

export const roleRatingRepo = {
  async getByPlayer(playerId: string): Promise<PlayerRoleRatingRecord[]> {
    return (await getDb()).getAllFromIndex('playerRoleRatings', 'by-player', playerId);
  },
  async putMany(records: PlayerRoleRatingRecord[]): Promise<void> {
    await bulkPut('playerRoleRatings', records);
  },
};

// ─── TeamRepository ───────────────────────────────────────────────────────────

export const teamRepo = {
  async get(id: string): Promise<Team | undefined> {
    return (await getDb()).get('teams', id);
  },
  async getByLeague(leagueId: string): Promise<Team[]> {
    return (await getDb()).getAllFromIndex('teams', 'by-league', leagueId);
  },
  async putMany(teams: Team[]): Promise<void> {
    await bulkPut('teams', teams);
  },
  async put(team: Team): Promise<void> {
    await (await getDb()).put('teams', team);
  },
};

// ─── OrgRepository ────────────────────────────────────────────────────────────

export const orgRepo = {
  async getAll(): Promise<Organization[]> {
    return (await getDb()).getAll('orgs');
  },
  async putMany(orgs: Organization[]): Promise<void> {
    await bulkPut('orgs', orgs);
  },
};

// ─── LeagueRepository ─────────────────────────────────────────────────────────

export const leagueRepo = {
  async getAll(): Promise<League[]> {
    return (await getDb()).getAll('leagues');
  },
  async put(league: League): Promise<void> {
    await (await getDb()).put('leagues', league);
  },
  async putMany(leagues: League[]): Promise<void> {
    await bulkPut('leagues', leagues);
  },
};

// ─── MatchRepository ──────────────────────────────────────────────────────────

export const matchRepo = {
  async getForWeek(leagueId: string, act: number, week: number): Promise<ScheduledMatch[]> {
    return (await getDb()).getAllFromIndex('matches', 'by-league-week', [leagueId, act, week]);
  },
  async getForSeason(season: number): Promise<ScheduledMatch[]> {
    return (await getDb()).getAllFromIndex('matches', 'by-season', season);
  },
  async put(match: ScheduledMatch): Promise<void> {
    await (await getDb()).put('matches', match);
  },
  async putMany(matches: ScheduledMatch[]): Promise<void> {
    await bulkPut('matches', matches);
  },
};

// ─── ContractRepository ───────────────────────────────────────────────────────

export const contractRepo = {
  async getByPlayer(playerId: string): Promise<Contract | undefined> {
    const results = await (await getDb()).getAllFromIndex('contracts', 'by-player', playerId);
    return results[0];
  },
  async put(contract: Contract): Promise<void> {
    await (await getDb()).put('contracts', contract);
  },
  async putMany(contracts: Contract[]): Promise<void> {
    await bulkPut('contracts', contracts);
  },
};

// ─── PlayerMatchStatsRepository ───────────────────────────────────────────────

export const playerMatchStatsRepo = {
  async putMany(stats: (PlayerMatchStat & { id: string; season: number })[]): Promise<void> {
    await bulkPut('playerMatchStats', stats);
  },
  async getByPlayer(playerId: string): Promise<(PlayerMatchStat & { id: string; season: number })[]> {
    return (await getDb()).getAllFromIndex('playerMatchStats', 'by-player', playerId);
  },
  async getByPlayerSeason(playerId: string, season: number): Promise<(PlayerMatchStat & { id: string; season: number })[]> {
    const all = await (await getDb()).getAllFromIndex('playerMatchStats', 'by-player', playerId);
    return all.filter(s => s.season === season);
  },
  async getAllBySeason(season: number): Promise<(PlayerMatchStat & { id: string; season: number })[]> {
    const all = await (await getDb()).getAll('playerMatchStats');
    return all.filter(s => s.season === season);
  },
  async getAll(): Promise<(PlayerMatchStat & { id: string; season: number })[]> {
    return (await getDb()).getAll('playerMatchStats');
  },
};

// ─── StandingsRepository ──────────────────────────────────────────────────────

export const standingsRepo = {
  async getForLeagueSeason(leagueId: string, season: number): Promise<(StandingsRow & { id: string })[]> {
    return (await getDb()).getAllFromIndex('standings', 'by-league-season', [leagueId, season]) as any;
  },
  async getAll(): Promise<(StandingsRow & { id: string })[]> {
    return (await getDb()).getAll('standings') as any;
  },
  async put(row: StandingsRow & { id: string }): Promise<void> {
    await (await getDb()).put('standings', row);
  },
  async putMany(rows: (StandingsRow & { id: string })[]): Promise<void> {
    await bulkPut('standings', rows);
  },
};

// ─── NotificationRepository ───────────────────────────────────────────────────

export const notifRepo = {
  async getUnread(): Promise<Notification[]> {
    return (await getDb()).getAllFromIndex('notifications', 'by-read', 0);
  },
  async markRead(id: string): Promise<void> {
    const db = await getDb();
    const notif = await db.get('notifications', id);
    if (notif) await db.put('notifications', { ...notif, read: true });
  },
  async put(notif: Notification): Promise<void> {
    await (await getDb()).put('notifications', notif as any);
  },
  async putMany(notifs: Notification[]): Promise<void> {
    await bulkPut('notifications', notifs);
  },
};

// ─── TransferOfferRepository ──────────────────────────────────────────────────

export const transferOfferRepo = {
  async getAll(): Promise<TransferOffer[]> {
    return (await getDb()).getAll('transferOffers');
  },
  async putMany(offers: TransferOffer[]): Promise<void> {
    await bulkPut('transferOffers', offers);
  },
};

// ─── CoachRepository ──────────────────────────────────────────────────────────

export const coachRepo = {
  async getAll(): Promise<Coach[]> {
    return (await getDb()).getAll('coaches');
  },
  async get(id: string): Promise<Coach | undefined> {
    return (await getDb()).get('coaches', id);
  },
  async getByTeam(teamId: string): Promise<Coach[]> {
    return (await getDb()).getAllFromIndex('coaches', 'by-team', teamId);
  },
  async put(coach: Coach): Promise<void> {
    await (await getDb()).put('coaches', coach);
  },
  async putMany(coaches: Coach[]): Promise<void> {
    await bulkPut('coaches', coaches);
  },
};

// ─── GameState Repository ─────────────────────────────────────────────────────

export const gameStateRepo = {
  async load(): Promise<SerializedGameState | undefined> {
    return (await getDb()).get('gameState', 'current');
  },
  async save(state: SerializedGameState): Promise<void> {
    await (await getDb()).put('gameState', state);
  },
};

// ─── Save & Load ──────────────────────────────────────────────────────────────

export async function persistGameState(state: GameState): Promise<void> {
  // 1. Lightweight game state record
  await gameStateRepo.save({
    id: 'current',
    phase: state.phase,
    season: state.season,
    act: state.act,
    week: state.week,
    playerTeamId: state.playerTeamId,
    leagueId: state.leagueId,
    regionId: state.regionId,
    seed: state.seed,
    freeAgents: state.freeAgents,
    freeAgentCoaches: state.freeAgentCoaches,
    otherLeagueIds: state.otherLeagueIds,
    otherPlayoffBrackets: state.otherPlayoffBrackets.size > 0
      ? Object.fromEntries(state.otherPlayoffBrackets)
      : undefined,
    splitHistory: state.splitHistory,
    seasonHistory: state.seasonHistory,
    activeMapPool: state.activeMapPool,
    agentMeta: state.agentMeta,
    agentMapMeta: state.agentMapMeta,
  });

  // 2. Dirty players
  if (state.dirtyPlayers.size > 0) {
    const dirty: Player[] = [];
    state.dirtyPlayers.forEach(id => {
      const p = state.players.get(id);
      if (p) dirty.push(p);
    });
    await playerRepo.putMany(dirty);
    state.dirtyPlayers.clear();
  }

  // 3. Dirty matches + their player stats (regular season + playoff bracket)
  if (state.dirtyMatches.size > 0) {
    const dirty: ScheduledMatch[] = [];
    const statsToWrite: (PlayerMatchStat & { id: string; season: number })[] = [];
    state.dirtyMatches.forEach(id => {
      const m = state.matches.get(id);
      if (m) {
        dirty.push(m);
        if (m.result?.playerStats) {
          m.result.playerStats.forEach(s => {
            statsToWrite.push({ ...s, id: `${m.id}_${s.playerId}`, season: m.season, isPlayoff: m.isPlayoff });
          });
        }
      } else {
        // Playoff bracket matches are not in state.matches — look up from bracket
        const pm = state.playoffBracket?.matches.find(bm => bm.id === id);
        if (pm?.result?.playerStats) {
          pm.result.playerStats.forEach(s => {
            statsToWrite.push({ ...s, id: `${pm.id}_${s.playerId}`, season: state.season, isPlayoff: true });
          });
        }
      }
    });
    await matchRepo.putMany(dirty);
    if (statsToWrite.length > 0) await playerMatchStatsRepo.putMany(statsToWrite);
    state.dirtyMatches.clear();
  }

  // 4. Dirty coaches
  if (state.dirtyCoaches.size > 0) {
    const dirty: Coach[] = [];
    state.dirtyCoaches.forEach(id => {
      const c = state.coaches.get(id);
      if (c) dirty.push(c);
    });
    await coachRepo.putMany(dirty);
    state.dirtyCoaches.clear();
  }

  // 5. All teams (roster/morale/record changes are frequent and cheap to overwrite)
  const allTeams: Team[] = [];
  state.teams.forEach(t => allTeams.push(t));
  await teamRepo.putMany(allTeams);

  // 6. All transfer offers (upsert keeps history, replaces status changes)
  if (state.transferOffers.length > 0) {
    await transferOfferRepo.putMany(state.transferOffers);
  }
}

export async function initNewGameDb(state: GameState): Promise<void> {
  // Clear all stores so no data from previous games bleeds into the new one.
  const db = await getDb();
  const storeNames: (keyof ValoGMSchema)[] = [
    'players', 'playerRoleRatings', 'teams', 'orgs', 'leagues',
    'contracts', 'matches', 'standings', 'transferOffers',
    'notifications', 'playerMatchStats', 'coaches', 'gameState',
  ];
  await Promise.all(storeNames.map(name => db.clear(name as any)));

  const players: Player[] = [];
  const roleRatings: PlayerRoleRatingRecord[] = [];
  const teams: Team[] = [];
  const orgs: Organization[] = [];
  const leagues: League[] = [];
  const contracts: Contract[] = [];
  const matches: ScheduledMatch[] = [];
  const standings: (StandingsRow & { id: string })[] = [];
  const coaches: Coach[] = [];

  state.players.forEach(p => players.push(p));
  state.roleRatings.forEach(rr => roleRatings.push(rr));
  state.teams.forEach(t => teams.push(t));
  state.orgs.forEach(o => orgs.push(o));
  state.leagues.forEach(l => leagues.push(l));
  state.contracts.forEach(c => contracts.push(c));
  state.matches.forEach(m => matches.push(m));
  state.standings.forEach((row, key) => standings.push({ ...row, id: key }));
  state.coaches.forEach(c => coaches.push(c));

  await Promise.all([
    playerRepo.putMany(players),
    roleRatingRepo.putMany(roleRatings),
    teamRepo.putMany(teams),
    orgRepo.putMany(orgs),
    leagueRepo.putMany(leagues),
    contractRepo.putMany(contracts),
    matchRepo.putMany(matches),
    standingsRepo.putMany(standings),
    coachRepo.putMany(coaches),
  ]);

  await persistGameState(state);
}

export async function loadGameState(): Promise<Partial<GameState> | null> {
  const saved = await gameStateRepo.load();
  if (!saved) return null;

  const [players, roleRatingsArr, teams, orgs, leagues, matches, coachesArr, offersArr] = await Promise.all([
    (await getDb()).getAll('players'),
    (await getDb()).getAll('playerRoleRatings'),
    (await getDb()).getAll('teams'),
    (await getDb()).getAll('orgs'),
    (await getDb()).getAll('leagues'),
    matchRepo.getForSeason(saved.season),
    coachRepo.getAll(),
    transferOfferRepo.getAll(),
  ]);

  const playerMap = new Map(players.map(p => [p.id, p]));
  const roleRatingsMap = new Map(roleRatingsArr.map(rr => [rr.id, rr]));
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const orgMap = new Map(orgs.map(o => [o.id, o]));
  const leagueMap = new Map(leagues.map(l => [l.id, l]));
  const matchMap = new Map(matches.map(m => [m.id, m]));
  const coachMap = new Map(coachesArr.map(c => [c.id, c]));

  const standingsArr = await standingsRepo.getAll();
  const standingsMap = new Map(standingsArr.map(r => [r.id, r]));

  const contractsArr = await (await getDb()).getAll('contracts');
  const contractMap = new Map(contractsArr.map(c => [c.id, c]));

  return {
    ...saved,
    players: playerMap,
    roleRatings: roleRatingsMap,
    teams: teamMap,
    orgs: orgMap,
    leagues: leagueMap,
    contracts: contractMap,
    matches: matchMap,
    standings: standingsMap,
    coaches: coachMap,
    freeAgentCoaches: saved.freeAgentCoaches ?? [],
    otherLeagueIds: saved.otherLeagueIds ?? [],
    otherPlayoffBrackets: new Map(Object.entries(saved.otherPlayoffBrackets ?? {})),
    splitHistory: saved.splitHistory ?? [],
    seasonHistory: saved.seasonHistory ?? [],
    activeMapPool: saved.activeMapPool ?? MAP_POOL.slice(0, 7),
    agentMeta: saved.agentMeta ?? { ...AGENT_BASELINES },
    agentMapMeta: saved.agentMapMeta ?? {},
    agentPickCounts: {},
    transferOffers: offersArr,
    pendingDecisions: [],
    notifications: [],
    playoffBracket: null,
    dirtyPlayers: new Set(),
    dirtyMatches: new Set(),
    dirtyCoaches: new Set(),
  };
}
