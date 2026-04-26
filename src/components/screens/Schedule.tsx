import { useState } from 'react';
import type { GameState, ScheduledMatch, MapResult } from '../../types';

interface Props { state: GameState; }

export function Schedule({ state }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const teamMatches: ScheduledMatch[] = [];
  state.matches.forEach(m => {
    if (
      m.leagueId === state.leagueId &&
      m.season === state.season &&
      (m.teamAId === state.playerTeamId || m.teamBId === state.playerTeamId)
    ) {
      teamMatches.push(m);
    }
  });
  teamMatches.sort((a, b) => a.week - b.week);

  const played = teamMatches.filter(m => m.result);
  const wins = played.filter(m => {
    const isA = m.teamAId === state.playerTeamId;
    return m.result!.winner === (isA ? 'A' : 'B');
  }).length;

  return (
    <div style={{ height: '100%', padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="font-head" style={{ fontSize: 18 }}>Schedule — Season {state.season}</h2>
        {played.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--teal)' }}>{wins}W</span>
            {' — '}
            <span style={{ color: 'var(--red)' }}>{played.length - wins}L</span>
            <span style={{ color: 'var(--text-dim)' }}> ({played.length}/{teamMatches.length})</span>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {teamMatches.map(m => {
          const isA = m.teamAId === state.playerTeamId;
          const opp = state.teams.get(isA ? m.teamBId : m.teamAId);
          const result = m.result;
          const won = result ? result.winner === (isA ? 'A' : 'B') : null;
          const isCurrent = !result && m.week === state.week;

          const isExpanded = expandedId === m.id;
          const playerRosterIds = new Set(state.teams.get(state.playerTeamId)?.rosterIds ?? []);
          const myStats = result
            ? result.playerStats
                .filter(s => playerRosterIds.has(s.playerId))
                .sort((a, b) => b.rating - a.rating)
            : [];

          return (
            <div
              key={m.id}
              className="card"
              style={{
                padding: '10px 14px',
                borderColor: isCurrent ? 'var(--red-dim)' : undefined,
                cursor: result ? 'pointer' : 'default',
              }}
              onClick={() => result && setExpandedId(isExpanded ? null : m.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: isCurrent ? 'var(--red)' : 'var(--text-dim)',
                    minWidth: 32,
                  }}>
                    Wk {m.week}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    vs {opp?.name ?? '?'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--text-dim)',
                  }}>
                    {m.format.toUpperCase()}
                  </span>
                  {isCurrent && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      background: 'var(--red-dim)', color: 'var(--red)',
                      padding: '1px 6px', borderRadius: 2,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      This week
                    </span>
                  )}
                </div>

                {result ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 13,
                      color: won ? 'var(--teal)' : 'var(--red)',
                    }}>
                      {won ? 'W' : 'L'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {result.winsA}–{result.winsB}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {result.mapResults.map((mr: MapResult, i: number) => (
                        <span key={i} style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}>
                          {mr.mapName.slice(0, 3).toUpperCase()} {mr.scoreA}–{mr.scoreB}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                    Upcoming
                  </span>
                )}
              </div>

              {isExpanded && myStats.length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border-dim)', paddingTop: 10 }}>
                  <table className="data-table">
                    <thead>
                      <tr><th>Player</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>ADR</th><th>Rating</th></tr>
                    </thead>
                    <tbody>
                      {myStats.map(stat => {
                        const p = state.players.get(stat.playerId);
                        const kd = stat.deaths === 0 ? stat.kills : (stat.kills / stat.deaths).toFixed(2);
                        return (
                          <tr key={stat.playerId}>
                            <td style={{ fontWeight: 600 }}>{p?.alias ?? stat.playerId}</td>
                            <td className="font-mono">{stat.kills}</td>
                            <td className="font-mono">{stat.deaths}</td>
                            <td className="font-mono">{stat.assists}</td>
                            <td className="font-mono">{kd}</td>
                            <td className="font-mono">{stat.adr}</td>
                            <td className="font-mono" style={{
                              color: stat.rating >= 1.2 ? 'var(--teal)' : stat.rating < 0.8 ? 'var(--red)' : 'var(--text-primary)',
                            }}>
                              {stat.rating.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {teamMatches.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No matches scheduled.</div>
        )}
      </div>
    </div>
  );
}
