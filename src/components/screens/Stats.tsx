import { useState, useEffect } from 'react';
import type { GameState, PlayerRole, PlayerMatchStat } from '../../types';
import { playerMatchStatsRepo } from '../../db/repos';

interface Props { state: GameState; }

interface PlayerSeasonStats {
  playerId: string;
  alias: string;
  teamId: string;
  teamName: string;
  role: PlayerRole;
  games: number;
  // Totals (for per-round derivation)
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalRounds: number;
  // Per-match averages
  rating: number;
  acs: number;
  adr: number;
  // Per-round
  kpr: number;
  dpr: number;
  apr: number;
  // K/D
  kd: number;
}

type SortKey = 'rating' | 'acs' | 'adr' | 'kd' | 'kpr' | 'dpr' | 'apr' | 'kills' | 'deaths' | 'assists' | 'games';

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
  { key: 'games',   label: 'Maps',    desc: 'Maps played' },
];

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

export function Stats({ state }: Props) {
  const [rows, setRows] = useState<PlayerSeasonStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [sortAsc, setSortAsc] = useState(false);
  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState<'all' | 'mine'>('all');

  // Collect all team IDs in the current league
  const league = state.leagues.get(state.leagueId);
  const leagueTeamIds = new Set(league?.teamIds ?? []);

  useEffect(() => {
    setLoading(true);
    playerMatchStatsRepo.getAllBySeason(state.season).then(allStats => {
      // Group by playerId
      const byPlayer = new Map<string, (PlayerMatchStat & { id: string; season: number })[]>();
      for (const s of allStats) {
        const arr = byPlayer.get(s.playerId) ?? [];
        arr.push(s);
        byPlayer.set(s.playerId, arr);
      }

      const out: PlayerSeasonStats[] = [];
      byPlayer.forEach((stats, playerId) => {
        const player = state.players.get(playerId);
        if (!player) return;
        // Only show players from this league's teams
        const team = player.teamId ? state.teams.get(player.teamId) : null;
        if (!team || !leagueTeamIds.has(team.id)) return;

        const n = stats.length;
        const totalKills   = stats.reduce((s, e) => s + e.kills,   0);
        const totalDeaths  = stats.reduce((s, e) => s + e.deaths,  0);
        const totalAssists = stats.reduce((s, e) => s + e.assists, 0);
        const totalRounds  = stats.reduce((s, e) => s + (e.rounds ?? 0), 0);

        const rating = stats.reduce((s, e) => s + e.rating, 0) / n;
        const acs    = stats.reduce((s, e) => s + (e.acs ?? 0), 0) / n;
        const adr    = stats.reduce((s, e) => s + e.adr, 0) / n;

        const kpr = totalRounds > 0 ? totalKills   / totalRounds : 0;
        const dpr = totalRounds > 0 ? totalDeaths  / totalRounds : 0;
        const apr = totalRounds > 0 ? totalAssists / totalRounds : 0;
        const kd  = totalDeaths > 0 ? totalKills   / totalDeaths : totalKills;

        out.push({
          playerId,
          alias:     player.alias,
          teamId:    team.id,
          teamName:  team.name,
          role:      player.primaryRole,
          games:     n,
          totalKills,
          totalDeaths,
          totalAssists,
          totalRounds,
          rating: Math.round(rating * 100) / 100,
          acs:    Math.round(acs),
          adr:    Math.round(adr),
          kpr:    Math.round(kpr * 100) / 100,
          dpr:    Math.round(dpr * 100) / 100,
          apr:    Math.round(apr * 100) / 100,
          kd:     Math.round(kd  * 100) / 100,
        });
      });

      setRows(out);
      setLoading(false);
    });
  }, [state.season, state.week]);

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
      case 'games':   return row.games;
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  let visible = rows
    .filter(r => roleFilter === 'all' || r.role === roleFilter)
    .filter(r => teamFilter === 'all' || r.teamId === state.playerTeamId);

  visible = [...visible].sort((a, b) => {
    const diff = getValue(a, sortKey) - getValue(b, sortKey);
    return sortAsc ? diff : -diff;
  });

  const ROLES: (PlayerRole | 'all')[] = ['all', 'duelist', 'initiator', 'controller', 'sentinel'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div className="font-head text-red" style={{ fontSize: 16, letterSpacing: '0.08em' }}>
          STATS — SEASON {state.season}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Role filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {ROLES.map(r => (
              <button
                key={r}
                className={`btn${roleFilter === r ? ' btn-teal' : ''}`}
                style={{ fontSize: 11, padding: '2px 10px', textTransform: 'uppercase' }}
                onClick={() => setRoleFilter(r)}
              >
                {r === 'all' ? 'All' : r.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>

          {/* Team filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn${teamFilter === 'all' ? ' btn-teal' : ''}`}
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => setTeamFilter('all')}
            >League</button>
            <button
              className={`btn${teamFilter === 'mine' ? ' btn-teal' : ''}`}
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => setTeamFilter('mine')}
            >My Team</button>
          </div>

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            {visible.length} players
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: 12 }}>
            Loading stats...
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 24, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: 12 }}>
            No stats yet — play some matches first.
          </div>
        ) : (
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 28, paddingLeft: 12 }}>#</th>
                <th>Player</th>
                <th>Team</th>
                <th style={{ width: 36 }}>Role</th>
                {COL_LABELS.map(col => (
                  <th
                    key={col.key}
                    title={col.desc}
                    style={{
                      cursor: 'pointer',
                      textAlign: 'right',
                      color: sortKey === col.key ? 'var(--text-primary)' : undefined,
                      paddingRight: 10,
                      userSelect: 'none',
                    }}
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
                    <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, paddingLeft: 12 }}>
                      {i + 1}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{row.alias}</span>
                    </td>
                    <td style={{ color: isMyTeam ? 'var(--teal)' : 'var(--text-secondary)', fontSize: 12 }}>
                      {row.teamName}
                    </td>
                    <td>
                      <span className={`role-badge ${row.role}`} style={{ fontSize: 10 }}>
                        {row.role.slice(0, 3).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: ratingColor(row.rating) }}>
                      {fmt(row.rating, 2)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {row.acs}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmt(row.kd, 2)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {fmt(row.kpr, 2)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {fmt(row.dpr, 2)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {fmt(row.apr, 2)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {row.adr}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {row.totalKills}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {row.totalDeaths}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {row.totalAssists}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                      {row.games}
                    </td>
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
