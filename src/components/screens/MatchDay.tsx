import { useState } from 'react';
import type { GameState, ScheduledMatch, MatchResult, MapResult, RoundResultSummary } from '../../types';

interface Props { state: GameState; }

function ScoreDisplay({ resultA, resultB, mapName }: { resultA: number; resultB: number; mapName: string }) {
  const aWon = resultA > resultB;
  return (
    <div className="card p-3 flex-col items-center gap-1" style={{ textAlign: 'center' }}>
      <div className="text-dim text-xs font-head uppercase">{mapName}</div>
      <div className="flex gap-3 items-center">
        <span className="font-mono" style={{ fontSize: 24, color: aWon ? 'var(--teal)' : 'var(--red)' }}>{resultA}</span>
        <span className="text-dim">—</span>
        <span className="font-mono" style={{ fontSize: 24, color: !aWon ? 'var(--teal)' : 'var(--red)' }}>{resultB}</span>
      </div>
    </div>
  );
}

function RoundTimeline({ rounds, playerIsA }: { rounds: RoundResultSummary[]; playerIsA: boolean }) {
  return (
    <div className="flex flex-wrap gap-1" style={{ padding: '8px 0' }}>
      {rounds.map(r => {
        const playerWon = playerIsA
          ? (r.winner === 'attack' ? true : false)  // simplified
          : (r.winner === 'defense' ? true : false);
        const planted = r.planted;
        return (
          <div
            key={r.roundNum}
            title={`Round ${r.roundNum} — ${r.winner} wins${planted ? ' (planted)' : ''}`}
            style={{
              width: 14, height: 14,
              background: playerWon ? 'var(--teal)' : 'var(--red)',
              opacity: planted ? 1 : 0.7,
              borderRadius: 2,
              cursor: 'default',
            }}
          />
        );
      })}
    </div>
  );
}

function PlayerStatRow({ stat, alias }: { stat: { playerId: string; kills: number; deaths: number; assists: number; adr: number; rating: number }; alias: string }) {
  const kd = stat.deaths === 0 ? stat.kills : (stat.kills / stat.deaths).toFixed(2);
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{alias}</td>
      <td className="font-mono">{stat.kills}</td>
      <td className="font-mono">{stat.deaths}</td>
      <td className="font-mono">{stat.assists}</td>
      <td className="font-mono">{kd}</td>
      <td className="font-mono">{stat.adr}</td>
      <td className="font-mono" style={{ color: stat.rating >= 1.2 ? 'var(--teal)' : stat.rating < 0.8 ? 'var(--red)' : 'var(--text-primary)' }}>
        {stat.rating.toFixed(2)}
      </td>
    </tr>
  );
}

function MatchDetail({ match, state }: { match: ScheduledMatch; state: GameState }) {
  const result = match.result!;
  const teamA = state.teams.get(match.teamAId);
  const teamB = state.teams.get(match.teamBId);
  const isA = match.teamAId === state.playerTeamId;
  const playerWon = result.winner === (isA ? 'A' : 'B');

  const mvp = result.mvpId ? state.players.get(result.mvpId) : null;

  return (
    <div className="flex-col gap-3">
      {/* Series score */}
      <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
        <span className="font-head" style={{ fontSize: 15 }}>{teamA?.name}</span>
        <div className="flex gap-2 items-center">
          <span className="font-mono" style={{ fontSize: 22, color: result.winner === 'A' ? 'var(--teal)' : 'var(--red)' }}>
            {result.winsA}
          </span>
          <span className="text-dim">—</span>
          <span className="font-mono" style={{ fontSize: 22, color: result.winner === 'B' ? 'var(--teal)' : 'var(--red)' }}>
            {result.winsB}
          </span>
        </div>
        <span className="font-head" style={{ fontSize: 15 }}>{teamB?.name}</span>
      </div>

      {/* Result banner */}
      <div className="card p-2" style={{ textAlign: 'center', background: playerWon ? 'var(--teal-dim)' : 'var(--red-dim)', borderColor: playerWon ? 'var(--teal)' : 'var(--red)' }}>
        <span className="font-head bold" style={{ fontSize: 16, color: playerWon ? 'var(--teal)' : 'var(--red)' }}>
          {playerWon ? '▲ VICTORY' : '▼ DEFEAT'}
        </span>
        {mvp && <span className="text-dim text-xs" style={{ marginLeft: 12 }}>MVP: {mvp.alias}</span>}
      </div>

      {/* Map scores */}
      <div className="flex gap-2">
        {result.mapResults.map((m, i) => (
          <ScoreDisplay key={i} resultA={m.scoreA} resultB={m.scoreB} mapName={m.mapName} />
        ))}
      </div>

      {/* Round timeline for each map */}
      {result.mapResults.map((m, i) => (
        <div key={i}>
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 4 }}>{m.mapName} Round Timeline</div>
          <RoundTimeline rounds={m.roundResults} playerIsA={isA} />
        </div>
      ))}

      {/* Player stats — split by team */}
      {[
        { teamId: match.teamAId, label: teamA?.name ?? 'Team A' },
        { teamId: match.teamBId, label: teamB?.name ?? 'Team B' },
      ]
        .sort((a) => (a.teamId === state.playerTeamId ? -1 : 1))
        .map(({ teamId, label }) => {
          const rosterIds = new Set(state.teams.get(teamId)?.rosterIds ?? []);
          const teamStats = result.playerStats.filter(s => rosterIds.has(s.playerId));
          if (teamStats.length === 0) return null;
          const isPlayerTeam = teamId === state.playerTeamId;
          return (
            <div key={teamId}>
              <div className="text-dim text-xs font-head uppercase" style={{
                marginBottom: 6,
                color: isPlayerTeam ? 'var(--text-secondary)' : 'var(--text-dim)',
              }}>
                {label}
              </div>
              <table className="data-table" style={{ marginBottom: 12 }}>
                <thead>
                  <tr><th>Player</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>ADR</th><th>Rating</th></tr>
                </thead>
                <tbody>
                  {teamStats
                    .sort((a, b) => b.rating - a.rating)
                    .map(stat => {
                      const p = state.players.get(stat.playerId);
                      return <PlayerStatRow key={stat.playerId} stat={stat} alias={p?.alias ?? stat.playerId} />;
                    })}
                </tbody>
              </table>
            </div>
          );
        })}

    </div>
  );
}

export function MatchDay({ state }: Props) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const teamMatches: ScheduledMatch[] = [];
  state.matches.forEach(m => {
    if (m.result && (m.teamAId === state.playerTeamId || m.teamBId === state.playerTeamId)) {
      teamMatches.push(m);
    }
  });
  teamMatches.sort((a, b) => b.week - a.week);

  const selected = selectedMatchId ? state.matches.get(selectedMatchId) : teamMatches[0] ?? null;

  return (
    <div className="flex" style={{ height: '100%' }}>
      {/* Match list */}
      <div className="flex-col" style={{ width: 240, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
        <div className="text-dim text-xs font-head uppercase" style={{ padding: '12px 16px 8px' }}>Match History</div>
        <div className="scroll-area flex-col" style={{ flex: 1 }}>
          {teamMatches.length === 0 && (
            <div className="text-dim text-xs" style={{ padding: '0 16px' }}>No matches played yet.</div>
          )}
          {teamMatches.map(m => {
            const opp = state.teams.get(m.teamAId === state.playerTeamId ? m.teamBId : m.teamAId);
            const res = m.result!;
            const isA = m.teamAId === state.playerTeamId;
            const won = res.winner === (isA ? 'A' : 'B');
            const isSelected = (selectedMatchId ?? teamMatches[0]?.id) === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setSelectedMatchId(m.id)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-3)' : 'transparent',
                  borderLeft: isSelected ? `3px solid ${won ? 'var(--teal)' : 'var(--red)'}` : '3px solid transparent',
                  borderBottom: '1px solid var(--border-dim)',
                }}
              >
                <div className="font-head text-xs uppercase" style={{ color: won ? 'var(--teal)' : 'var(--red)' }}>
                  {won ? 'W' : 'L'} {res.winsA}-{res.winsB}
                </div>
                <div style={{ fontSize: 12 }}>vs {opp?.name ?? '?'}</div>
                <div className="text-dim" style={{ fontSize: 11 }}>Wk {m.week} · {m.format.toUpperCase()}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Match detail */}
      <div className="scroll-area flex-col" style={{ flex: 1, padding: 16 }}>
        {selected?.result ? (
          <MatchDetail match={selected} state={state} />
        ) : (
          <div className="text-dim text-sm">Select a match to view details.</div>
        )}
      </div>
    </div>
  );
}
