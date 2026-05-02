import { useState, useEffect, useMemo } from 'react';
import type { GameState, PlayerRole, PlayerMatchStat, RegionId } from '../../types';
import { playerMatchStatsRepo } from '../../db/repos';

interface Props { state: GameState; }

interface PlayerSeasonStats {
  playerId: string;
  alias: string;
  teamId: string;
  teamName: string;
  region: RegionId;
  role: PlayerRole;
  maps: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalRounds: number;
  rating: number;
  acs: number;
  adr: number;
  kpr: number;
  dpr: number;
  apr: number;
  kd: number;
}

type SortKey = 'rating' | 'acs' | 'adr' | 'kd' | 'kpr' | 'dpr' | 'apr' | 'kills' | 'deaths' | 'assists' | 'maps' | 'rounds';
type PhaseFilter = 'all' | 'regular' | 'playoffs' | 'international';
type TeamScope = 'all' | 'league' | 'mine';

const COL_LABELS: { key: SortKey; label: string; desc?: string }[] = [
  { key: 'rating',  label: 'Rating',  desc: 'VLR Rating 2.0' },
  { key: 'acs',     label: 'ACS',     desc: 'Avg Combat Score / round' },
  { key: 'kd',      label: 'K/D',     desc: 'Kill/Death ratio' },
  { key: 'kpr',     label: 'KPR',     desc: 'Kills per round' },
  { key: 'dpr',     label: 'DPR',     desc: 'Deaths per round' },
  { key: 'apr',     label: 'APR',     desc: 'Assists per round' },
  { key: 'adr',     label: 'ADR',     desc: 'Avg Damage per round' },
  { key: 'kills',   label: 'K',       desc: 'Total kills' },
  { key: 'deaths',  label: 'D',       desc: 'Total deaths' },
  { key: 'assists', label: 'A',       desc: 'Total assists' },
  { key: 'maps',    label: 'Maps',    desc: 'Maps played' },
  { key: 'rounds',  label: 'Rnd',     desc: 'Total rounds played' },
];

const REGION_ABBR: Record<RegionId, string> = {
  americas: 'AMR', emea: 'EMEA', pacific: 'PAC', china: 'CHN',
};
const REGION_COLOR: Record<RegionId, string> = {
  americas: 'var(--red)', emea: 'var(--blue)', pacific: 'var(--teal)', china: 'var(--amber)',
};
const ALL_REGIONS: RegionId[] = ['americas', 'emea', 'pacific', 'china'];

function ratingColor(r: number): string {
  if (r >= 1.3) return 'var(--teal)';
  if (r >= 1.1) return '#8ef0d8';
  if (r < 0.8)  return 'var(--red)';
  if (r < 0.9)  return '#ff8899';
  return 'var(--text-primary)';
}

function fmt(v: number, decimals: number): string {
  return v.toFixed(decimals);
}

const SELECT_STYLE: React.CSSProperties = {
  background: '#17171d',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '2px 6px',
  colorScheme: 'dark',
  borderRadius: 2,
  cursor: 'pointer',
};

export function Stats({ state }: Props) {
  const currentCalSeason = Math.ceil(state.season / 3);

  const [rawStats, setRawStats] = useState<(PlayerMatchStat & { id: string; season: number })[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sortKey, setSortKey]   = useState<SortKey>('rating');
  const [sortAsc, setSortAsc]   = useState(false);

  // Filters
  const [seasonFilter, setSeasonFilter] = useState<number | 'all'>(currentCalSeason);
  const [splitFilter,  setSplitFilter]  = useState<1 | 2 | 3 | 'all'>('all');
  const [phaseFilter,  setPhaseFilter]  = useState<PhaseFilter>('all');
  const [roleFilter,   setRoleFilter]   = useState<PlayerRole | 'all'>('all');
  const [teamScope,    setTeamScope]    = useState<TeamScope>('all');
  const [regionFilter, setRegionFilter] = useState<RegionId | 'all'>('all');

  const leagueTeamIds = useMemo(() => {
    const league = state.leagues.get(state.leagueId);
    return new Set(league?.teamIds ?? []);
  }, [state.leagueId, state.leagues]);

  const allTournaments = useMemo(() => [
    ...state.tournamentHistory,
    ...(state.activeInternationalTournament ? [state.activeInternationalTournament] : []),
  ], [state.tournamentHistory, state.activeInternationalTournament]);

  useEffect(() => {
    setLoading(true);
    playerMatchStatsRepo.getAll().then(all => {
      setRawStats(all);
      setLoading(false);
    });
  }, [state.season, state.week]);

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    rawStats.forEach(s => seasons.add(Math.ceil(s.season / 3)));
    allTournaments.forEach(t => seasons.add(t.calendarSeason));
    return [...seasons].sort((a, b) => a - b);
  }, [rawStats, allTournaments]);

  function playerTeamRegion(playerId: string): RegionId | null {
    const p = state.players.get(playerId);
    if (!p?.teamId) return null;
    return state.teams.get(p.teamId)?.region ?? null;
  }

  function passesScope(teamId: string, region: RegionId): boolean {
    if (regionFilter !== 'all' && region !== regionFilter) return false;
    if (teamScope === 'league' && !leagueTeamIds.has(teamId)) return false;
    if (teamScope === 'mine'   && teamId !== state.playerTeamId) return false;
    return true;
  }

  // ── Regular / playoff rows ─────────────────────────────────────────────────
  const leagueRows = useMemo(() => {
    if (phaseFilter === 'international') return [];

    const filtered = rawStats.filter(s => {
      const calSeason = Math.ceil(s.season / 3);
      const splitNum  = ((s.season - 1) % 3) + 1;
      if (seasonFilter !== 'all' && calSeason !== seasonFilter) return false;
      if (splitFilter  !== 'all' && splitNum  !== splitFilter)  return false;
      if (phaseFilter === 'regular'  &&  s.isPlayoff) return false;
      if (phaseFilter === 'playoffs' && !s.isPlayoff) return false;
      return true;
    });

    const byPlayer = new Map<string, (PlayerMatchStat & { id: string; season: number })[]>();
    for (const s of filtered) {
      const arr = byPlayer.get(s.playerId) ?? [];
      arr.push(s);
      byPlayer.set(s.playerId, arr);
    }

    const out: PlayerSeasonStats[] = [];
    byPlayer.forEach((stats, playerId) => {
      const player = state.players.get(playerId);
      if (!player) return;
      const team = player.teamId ? state.teams.get(player.teamId) : null;
      if (!team) return;
      if (!passesScope(team.id, team.region)) return;

      const n            = stats.length;
      const totalMaps    = stats.reduce((acc, e) => acc + (e.maps   ?? 1), 0);
      const totalKills   = stats.reduce((acc, e) => acc + e.kills,          0);
      const totalDeaths  = stats.reduce((acc, e) => acc + e.deaths,         0);
      const totalAssists = stats.reduce((acc, e) => acc + e.assists,        0);
      const totalRounds  = stats.reduce((acc, e) => acc + (e.rounds ?? 0),  0);
      const rating = stats.reduce((acc, e) => acc + e.rating,     0) / n;
      const acs    = stats.reduce((acc, e) => acc + (e.acs ?? 0), 0) / n;
      const adr    = stats.reduce((acc, e) => acc + e.adr,        0) / n;
      const kpr = totalRounds > 0 ? totalKills   / totalRounds : 0;
      const dpr = totalRounds > 0 ? totalDeaths  / totalRounds : 0;
      const apr = totalRounds > 0 ? totalAssists / totalRounds : 0;
      const kd  = totalDeaths > 0 ? totalKills   / totalDeaths : totalKills;

      out.push({
        playerId, alias: player.alias, teamId: team.id, teamName: team.name, region: team.region,
        role: player.primaryRole, maps: totalMaps,
        totalKills, totalDeaths, totalAssists, totalRounds,
        rating: Math.round(rating * 100) / 100,
        acs: Math.round(acs), adr: Math.round(adr),
        kpr: Math.round(kpr * 100) / 100, dpr: Math.round(dpr * 100) / 100,
        apr: Math.round(apr * 100) / 100, kd: Math.round(kd * 100) / 100,
      });
    });
    return out;
  }, [rawStats, seasonFilter, splitFilter, phaseFilter, regionFilter, teamScope, state.players, state.teams, leagueTeamIds, state.playerTeamId]);

  // ── International rows ─────────────────────────────────────────────────────
  const intlRows = useMemo(() => {
    if (phaseFilter !== 'international') return [];

    const relevant = allTournaments.filter(t => {
      if (seasonFilter !== 'all' && t.calendarSeason !== seasonFilter) return false;
      if (splitFilter  !== 'all' && t.splitNum       !== splitFilter)  return false;
      return true;
    });

    const agg = new Map<string, {
      kills: number; deaths: number; assists: number;
      totalAdr: number; totalAcs: number; rounds: number; maps: number;
      totalRating: number; weightedRating: number; weightedMaps: number;
    }>();

    for (const t of relevant) {
      for (const [pid, s] of Object.entries(t.playerStats)) {
        const e = agg.get(pid);
        if (e) {
          e.kills += s.kills; e.deaths += s.deaths; e.assists += s.assists;
          e.totalAdr += s.totalAdr; e.totalAcs += s.totalAcs;
          e.rounds += s.rounds; e.maps += s.maps;
          e.totalRating += s.totalRating;
          e.weightedRating += s.weightedRating; e.weightedMaps += s.weightedMaps;
        } else {
          agg.set(pid, { ...s });
        }
      }
    }

    const out: PlayerSeasonStats[] = [];
    agg.forEach((s, playerId) => {
      if (s.maps === 0 || s.weightedMaps === 0) return;
      const player = state.players.get(playerId);
      if (!player) return;
      const team = player.teamId ? state.teams.get(player.teamId) : null;
      if (!team) return;
      if (!passesScope(team.id, team.region)) return;

      const rating = s.totalRating / s.maps;
      const acs    = s.totalAcs / s.maps;
      const adr    = s.totalAdr / s.maps;
      const kpr    = s.rounds > 0 ? s.kills   / s.rounds : 0;
      const dpr    = s.rounds > 0 ? s.deaths  / s.rounds : 0;
      const apr    = s.rounds > 0 ? s.assists / s.rounds : 0;
      const kd     = s.deaths > 0 ? s.kills   / s.deaths : s.kills;

      out.push({
        playerId, alias: player.alias, teamId: team.id, teamName: team.name, region: team.region,
        role: player.primaryRole, maps: s.maps,
        totalKills: s.kills, totalDeaths: s.deaths, totalAssists: s.assists, totalRounds: s.rounds,
        rating: Math.round(rating * 100) / 100,
        acs: Math.round(acs), adr: Math.round(adr),
        kpr: Math.round(kpr * 100) / 100, dpr: Math.round(dpr * 100) / 100,
        apr: Math.round(apr * 100) / 100, kd: Math.round(kd * 100) / 100,
      });
    });
    return out;
  }, [allTournaments, seasonFilter, splitFilter, phaseFilter, regionFilter, teamScope, state.players, state.teams, leagueTeamIds, state.playerTeamId]);

  function getValue(row: PlayerSeasonStats, key: SortKey): number {
    switch (key) {
      case 'rating':  return row.rating;
      case 'acs':     return row.acs;
      case 'adr':     return row.adr;
      case 'kd':      return row.kd;
      case 'kpr':     return row.kpr;
      case 'dpr':     return row.dpr;
      case 'apr':     return row.apr;
      case 'kills':   return row.totalKills;
      case 'deaths':  return row.totalDeaths;
      case 'assists': return row.totalAssists;
      case 'maps':    return row.maps;
      case 'rounds':  return row.totalRounds;
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  const activeRows = phaseFilter === 'international' ? intlRows : leagueRows;

  let visible = activeRows
    .filter(r => roleFilter === 'all' || r.role === roleFilter)
    .sort((a, b) => {
      const diff = getValue(a, sortKey) - getValue(b, sortKey);
      return sortAsc ? diff : -diff;
    });

  const ROLES: (PlayerRole | 'all')[] = ['all', 'duelist', 'initiator', 'controller', 'sentinel'];

  const seasonLabel = seasonFilter === 'all' ? 'All Seasons' : `Season ${seasonFilter}`;
  const splitLabel  = splitFilter  === 'all' ? 'All Splits'  : `Split ${splitFilter}`;
  const phaseLabel  = phaseFilter === 'all' ? '' : phaseFilter === 'regular' ? ' · Reg' : phaseFilter === 'playoffs' ? ' · PO' : ' · Intl';

  const isIntl = phaseFilter === 'international';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="font-head text-red" style={{ fontSize: 15, letterSpacing: '0.08em' }}>
            STATS — {seasonLabel} · {splitLabel}{phaseLabel}
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            {visible.length} players
          </span>
        </div>

        {/* Filter row 1: season / split / phase / region */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Season */}
          <select style={SELECT_STYLE} value={seasonFilter}
            onChange={e => setSeasonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Seasons</option>
            {availableSeasons.map(s => <option key={s} value={s}>Season {s}</option>)}
          </select>

          {/* Split */}
          <select style={SELECT_STYLE} value={splitFilter}
            onChange={e => setSplitFilter(e.target.value === 'all' ? 'all' : Number(e.target.value) as 1|2|3)}>
            <option value="all">All Splits</option>
            <option value={1}>Split 1</option>
            <option value={2}>Split 2</option>
            <option value={3}>Split 3</option>
          </select>

          {/* Phase */}
          <div style={{ display: 'flex', gap: 3 }}>
            {(['all', 'regular', 'playoffs', 'international'] as PhaseFilter[]).map(p => (
              <button key={p}
                className={`btn${phaseFilter === p ? ' btn-teal' : ''}`}
                style={{ fontSize: 11, padding: '2px 9px' }}
                onClick={() => setPhaseFilter(p)}
              >
                {p === 'all' ? 'All' : p === 'regular' ? 'Regular' : p === 'playoffs' ? 'Playoffs' : 'Intl'}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

          {/* Region filter */}
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              className={`btn${regionFilter === 'all' ? ' btn-teal' : ''}`}
              style={{ fontSize: 11, padding: '2px 9px' }}
              onClick={() => setRegionFilter('all')}
            >All</button>
            {ALL_REGIONS.map(r => (
              <button key={r}
                className={`btn${regionFilter === r ? ' btn-teal' : ''}`}
                style={{ fontSize: 11, padding: '2px 9px', color: regionFilter === r ? undefined : REGION_COLOR[r] }}
                onClick={() => setRegionFilter(r)}
              >
                {REGION_ABBR[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Filter row 2: role / team scope */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Role */}
          <div style={{ display: 'flex', gap: 3 }}>
            {ROLES.map(r => (
              <button key={r}
                className={`btn${roleFilter === r ? ' btn-teal' : ''}`}
                style={{ fontSize: 11, padding: '2px 9px', textTransform: 'uppercase' }}
                onClick={() => setRoleFilter(r)}
              >
                {r === 'all' ? 'All' : r.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

          {/* Team scope */}
          <div style={{ display: 'flex', gap: 3 }}>
            <button className={`btn${teamScope === 'all'    ? ' btn-teal' : ''}`} style={{ fontSize: 11, padding: '2px 9px' }} onClick={() => setTeamScope('all')}>All</button>
            {!isIntl && (
              <button className={`btn${teamScope === 'league' ? ' btn-teal' : ''}`} style={{ fontSize: 11, padding: '2px 9px' }} onClick={() => setTeamScope('league')}>My League</button>
            )}
            <button className={`btn${teamScope === 'mine'   ? ' btn-teal' : ''}`} style={{ fontSize: 11, padding: '2px 9px' }} onClick={() => setTeamScope('mine')}>My Team</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && !isIntl ? (
          <div style={{ padding: 24, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: 12 }}>
            Loading stats...
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 24, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: 12 }}>
            No stats for this selection.
          </div>
        ) : (
          <table className="data-table" style={{ minWidth: 1020 }}>
            <thead>
              <tr>
                <th style={{ width: 28, paddingLeft: 12 }}>#</th>
                <th>Player</th>
                <th>Team</th>
                <th style={{ width: 44 }}>Region</th>
                <th style={{ width: 36 }}>Role</th>
                {COL_LABELS.map(col => (
                  <th key={col.key} title={col.desc}
                    style={{ cursor: 'pointer', textAlign: 'right', color: sortKey === col.key ? 'var(--text-primary)' : undefined, paddingRight: 10, userSelect: 'none' }}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}{sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const isMyTeam = row.teamId === state.playerTeamId;
                return (
                  <tr key={row.playerId} className={isMyTeam ? 'highlight' : ''}>
                    <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, paddingLeft: 12 }}>{i + 1}</td>
                    <td><span style={{ fontWeight: 600, fontSize: 13 }}>{row.alias}</span></td>
                    <td style={{ color: isMyTeam ? 'var(--teal)' : 'var(--text-secondary)', fontSize: 12 }}>{row.teamName}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: REGION_COLOR[row.region] }}>{REGION_ABBR[row.region]}</td>
                    <td>
                      <span className={`role-badge ${row.role}`} style={{ fontSize: 10 }}>
                        {row.role.slice(0, 3).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: ratingColor(row.rating) }}>{fmt(row.rating, 2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{row.acs}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(row.kd, 2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(row.kpr, 2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(row.dpr, 2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(row.apr, 2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{row.adr}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{row.totalKills}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{row.totalDeaths}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{row.totalAssists}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{row.maps}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{row.totalRounds}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
