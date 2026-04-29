import { useState, useEffect } from 'react';
import type { GameState, ScheduledMatch, Notification, StandingsRow } from '../../types';
import { BENCH_SALARY_FACTOR } from '../../types';
import { sortStandings } from '../../engine/leagueInit';
import { playerMatchStatsRepo } from '../../db/repos';

interface Props {
  state: GameState;
}

function getNextMatch(state: GameState): ScheduledMatch | null {
  let next: ScheduledMatch | null = null;
  state.matches.forEach(m => {
    if (m.teamAId !== state.playerTeamId && m.teamBId !== state.playerTeamId) return;
    if (m.result || m.isPlayoff) return;
    if (!next || m.week < next.week) next = m;
  });
  return next;
}

function getStandingsPosition(state: GameState): number {
  const rows: StandingsRow[] = [];
  state.standings.forEach(row => {
    if (row.leagueId === state.leagueId && row.season === state.season) rows.push(row);
  });
  const sorted = sortStandings(rows);
  const pos = sorted.findIndex(r => r.teamId === state.playerTeamId);
  return pos + 1;
}

function TeamMoraleBar({ morale }: { morale: number }) {
  const color = morale >= 70 ? 'var(--teal)' : morale >= 45 ? 'var(--amber)' : 'var(--red)';
  return (
    <div>
      <div className="flex justify-between text-xs" style={{ marginBottom: 3 }}>
        <span className="text-dim font-head uppercase">Team Morale</span>
        <span className="font-mono">{Math.round(morale)}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${morale}%`, background: color }} />
      </div>
    </div>
  );
}

function NotifItem({ notif }: { notif: Notification }) {
  const icon = notif.type === 'match_result'
    ? (notif.title.includes('Victory') ? '▲' : '▼')
    : notif.type === 'contract_expiring' ? '!'
    : notif.type === 'transfer_offer' ? '⇄'
    : '•';
  const color = notif.type === 'match_result'
    ? (notif.title.includes('Victory') ? 'var(--teal)' : 'var(--red)')
    : notif.type === 'transfer_offer'
    ? (notif.title.includes('Accepted') ? 'var(--teal)' : notif.title.includes('Counter') ? 'var(--amber)' : 'var(--text-secondary)')
    : 'var(--amber)';
  return (
    <div className="flex gap-2 items-center" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-dim)' }}>
      <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 16 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-head)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{notif.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{notif.body}</div>
      </div>
    </div>
  );
}

interface QuickStat { acs: number; rating: number }

export function Dashboard({ state }: Props) {
  const team = state.teams.get(state.playerTeamId);
  const org = team ? [...state.orgs.values()].find(o => o.teamId === state.playerTeamId) : null;
  const nextMatch = getNextMatch(state);
  const position = getStandingsPosition(state);
  const recentNotifs = state.notifications.slice(-8).reverse();

  const [quickStats, setQuickStats] = useState<Map<string, QuickStat>>(new Map());

  useEffect(() => {
    const playerIds = [...(team?.rosterIds ?? []), ...(team?.subIds ?? [])];
    if (playerIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      playerIds.map(id =>
        playerMatchStatsRepo.getByPlayerSeason(id, state.season).then(stats => {
          if (stats.length === 0) return [id, null] as const;
          const n = stats.length;
          return [id, {
            acs:    Math.round(stats.reduce((s, e) => s + (e.acs ?? 0), 0) / n),
            rating: Math.round(stats.reduce((s, e) => s + e.rating, 0) / n * 100) / 100,
          }] as const;
        })
      )
    ).then(entries => {
      if (cancelled) return;
      const map = new Map<string, QuickStat>();
      entries.forEach(([id, stat]) => { if (stat) map.set(id, stat); });
      setQuickStats(map);
    });
    return () => { cancelled = true; };
  }, [state.playerTeamId, state.season, state.week]);

  const standingsRow = state.standings.get(`${state.leagueId}:${state.season}:${state.playerTeamId}`);

  const rosterPlayers = (team?.rosterIds ?? []).map(id => state.players.get(id)).filter(Boolean);
  const benchPlayers = (team?.subIds ?? []).map(id => state.players.get(id)).filter(Boolean);
  const payroll =
    rosterPlayers.reduce((s, p) => s + (p?.salary ?? 0), 0) +
    benchPlayers.reduce((s, p) => s + (p?.salary ?? 0) * BENCH_SALARY_FACTOR, 0);

  return (
    <div className="flex-col" style={{ height: '100%', padding: 16, gap: 16, overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* Standing card */}
        <div className="card p-3">
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Standing</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-red" style={{ fontSize: 32 }}>#{position}</span>
            <div>
              <div className="font-head" style={{ fontSize: 13 }}>{standingsRow?.wins ?? 0}W — {standingsRow?.losses ?? 0}L</div>
              <div className="text-dim text-xs">{standingsRow?.points ?? 0} pts</div>
            </div>
          </div>
        </div>

        {/* Budget card */}
        <div className="card p-3">
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Budget</div>
          <div className="font-mono" style={{ fontSize: 20, color: 'var(--teal)' }}>
            ${(org?.budget ?? 0).toLocaleString()}
          </div>
          <div className="text-dim text-xs">
            Payroll: ${Math.round(payroll).toLocaleString()}
            {benchPlayers.length > 0 && <span style={{ opacity: 0.6 }}> (bench ×0.5)</span>}
          </div>
        </div>

        {/* Next match card */}
        <div className="card p-3">
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Next Match</div>
          {nextMatch ? (
            <div>
              <div className="font-head" style={{ fontSize: 13 }}>
                vs {state.teams.get(nextMatch.teamAId === state.playerTeamId ? nextMatch.teamBId : nextMatch.teamAId)?.name ?? '?'}
              </div>
              <div className="text-dim text-xs">Week {nextMatch.week} · {nextMatch.format.toUpperCase()}</div>
            </div>
          ) : (
            <div className="text-dim text-xs">No upcoming match</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Roster preview */}
        <div className="card p-3 flex-col gap-2">
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 4 }}>Active Roster</div>
          <TeamMoraleBar morale={team?.morale ?? 75} />
          {rosterPlayers.map(p => {
            if (!p) return null;
            const qs = quickStats.get(p.id);
            return (
              <div key={p.id} className="flex justify-between items-center" style={{ padding: '4px 0', borderBottom: '1px solid var(--border-dim)' }}>
                <div className="flex gap-2 items-center">
                  <span className={`role-badge ${p.primaryRole}`}>{p.primaryRole.slice(0, 3).toUpperCase()}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.alias}</span>
                </div>
                {qs ? (
                  <div className="flex gap-2 items-center">
                    <span className="font-mono text-xs text-dim">ACS {qs.acs}</span>
                    <span className="font-mono text-xs" style={{
                      color: qs.rating >= 1.2 ? 'var(--teal)' : qs.rating < 0.8 ? 'var(--red)' : 'var(--text-secondary)',
                    }}>{qs.rating.toFixed(2)}</span>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-dim">{p.nationality}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Notifications */}
        <div className="card p-3 flex-col">
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Inbox</div>
          <div className="scroll-area" style={{ flex: 1 }}>
            {recentNotifs.length === 0 ? (
              <div className="text-dim text-xs">No notifications</div>
            ) : (
              recentNotifs.map(n => <NotifItem key={n.id} notif={n} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
