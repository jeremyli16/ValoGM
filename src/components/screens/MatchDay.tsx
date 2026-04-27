import { useState } from 'react';
import type { GameState, RoundResultSummary, MatchResult, MatchFormat } from '../../types';

// ─── Normalized match (covers regular season + playoff) ───────────────────────

interface NormMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  result: MatchResult;
  gameSeason: number;
  sortKey: number;   // higher = more recent; playoffs get 100+roundOrder
  label: string;     // "Wk 3" | "Playoffs · Grand Final"
  format: MatchFormat;
}

interface SplitGroup {
  gameSeason: number;
  calSeason: number;
  splitNum: number;
  matches: NormMatch[];  // sorted newest-first
}

// ─── Playoff round metadata ───────────────────────────────────────────────────

const ROUND_ORDER: Record<string, number> = {
  UR1A: 1, UR1B: 2, LR1A: 3, LR1B: 4,
  USF1: 5, USF2: 6, LR2A: 7, LR2B: 8,
  UF: 9, LR3: 10, LF: 11, GF: 12,
};

const ROUND_LABELS: Record<string, string> = {
  UR1A: 'Upper R1', UR1B: 'Upper R1',
  LR1A: 'Lower R1', LR1B: 'Lower R1',
  USF1: 'Upper SF', USF2: 'Upper SF',
  LR2A: 'Lower R2', LR2B: 'Lower R2',
  UF: 'Upper Final', LR3: 'Lower R3',
  LF: 'Lower Final', GF: 'Grand Final',
};

// ─── Data builders ────────────────────────────────────────────────────────────

function buildNormMatches(state: GameState): NormMatch[] {
  const out: NormMatch[] = [];

  // Regular season matches
  state.matches.forEach(m => {
    if (!m.result) return;
    if (m.teamAId !== state.playerTeamId && m.teamBId !== state.playerTeamId) return;
    out.push({
      id: m.id,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      result: m.result,
      gameSeason: m.season,
      sortKey: m.week,
      label: `Wk ${m.week}`,
      format: m.format,
    });
  });

  // Current-season playoff matches (bracket cleared at season end)
  if (state.playoffBracket) {
    state.playoffBracket.matches.forEach(m => {
      if (!m.result || !m.teamAId || !m.teamBId) return;
      if (m.teamAId !== state.playerTeamId && m.teamBId !== state.playerTeamId) return;
      out.push({
        id: m.id,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        result: m.result,
        gameSeason: state.season,
        sortKey: 100 + (ROUND_ORDER[m.round] ?? 0),
        label: `Playoffs · ${ROUND_LABELS[m.round] ?? m.round}`,
        format: m.format,
      });
    });
  }

  return out;
}

function buildSplitGroups(matches: NormMatch[]): SplitGroup[] {
  const bySeason = new Map<number, NormMatch[]>();
  for (const m of matches) {
    if (!bySeason.has(m.gameSeason)) bySeason.set(m.gameSeason, []);
    bySeason.get(m.gameSeason)!.push(m);
  }

  const groups: SplitGroup[] = [];
  bySeason.forEach((ms, gameSeason) => {
    groups.push({
      gameSeason,
      calSeason: Math.ceil(gameSeason / 3),
      splitNum: ((gameSeason - 1) % 3) + 1,
      matches: [...ms].sort((a, b) => b.sortKey - a.sortKey),
    });
  });

  return groups.sort((a, b) => b.gameSeason - a.gameSeason);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
        const playerWon = playerIsA ? r.winner === 'attack' : r.winner === 'defense';
        return (
          <div
            key={r.roundNum}
            title={`Round ${r.roundNum} — ${r.winner} wins${r.planted ? ' (planted)' : ''}`}
            style={{
              width: 14, height: 14,
              background: playerWon ? 'var(--teal)' : 'var(--red)',
              opacity: r.planted ? 1 : 0.7,
              borderRadius: 2,
              cursor: 'default',
            }}
          />
        );
      })}
    </div>
  );
}

function PlayerStatRow({ stat, alias }: {
  stat: { playerId: string; kills: number; deaths: number; assists: number; adr: number; rating: number };
  alias: string;
}) {
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

function MatchDetail({ match, state }: { match: NormMatch; state: GameState }) {
  const result = match.result;
  const teamA = state.teams.get(match.teamAId);
  const teamB = state.teams.get(match.teamBId);
  const isA = match.teamAId === state.playerTeamId;
  const playerWon = result.winner === (isA ? 'A' : 'B');
  const mvp = result.mvpId ? state.players.get(result.mvpId) : null;

  return (
    <div className="flex-col gap-3">
      {/* Match label */}
      <div style={{ fontSize: 11, fontFamily: 'var(--font-head)', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
        {match.label.toUpperCase()}
      </div>

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

      {/* Round timelines */}
      {result.mapResults.map((m, i) => (
        <div key={i}>
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 4 }}>{m.mapName} Round Timeline</div>
          <RoundTimeline rounds={m.roundResults} playerIsA={isA} />
        </div>
      ))}

      {/* Player stats — player's team first */}
      {[
        { teamId: match.teamAId, label: teamA?.name ?? 'Team A' },
        { teamId: match.teamBId, label: teamB?.name ?? 'Team B' },
      ]
        .sort(a => (a.teamId === state.playerTeamId ? -1 : 1))
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

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props { state: GameState; }

export function MatchDay({ state }: Props) {
  const allMatches = buildNormMatches(state);
  const splitGroups = buildSplitGroups(allMatches);
  const mostRecentGameSeason = splitGroups[0]?.gameSeason ?? -1;

  // Map from gameSeason → explicit open/close choice; default: most recent open, others closed
  const [userChoices, setUserChoices] = useState<Map<number, boolean>>(new Map());
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  function isOpen(gameSeason: number): boolean {
    if (userChoices.has(gameSeason)) return userChoices.get(gameSeason)!;
    return gameSeason === mostRecentGameSeason;
  }

  function toggleSplit(gameSeason: number) {
    setUserChoices(prev => new Map([...prev, [gameSeason, !isOpen(gameSeason)]]));
  }

  const firstMatch = splitGroups[0]?.matches[0] ?? null;
  const allFlat = splitGroups.flatMap(g => g.matches);
  const selected = selectedMatchId ? allFlat.find(m => m.id === selectedMatchId) : firstMatch;

  return (
    <div className="flex" style={{ height: '100%' }}>
      {/* Match list */}
      <div className="flex-col" style={{ width: 240, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
        <div className="text-dim text-xs font-head uppercase" style={{ padding: '12px 16px 8px' }}>Match History</div>
        <div className="scroll-area flex-col" style={{ flex: 1 }}>
          {splitGroups.length === 0 && (
            <div className="text-dim text-xs" style={{ padding: '0 16px' }}>No matches played yet.</div>
          )}
          {splitGroups.map(group => {
            const expanded = isOpen(group.gameSeason);
            const isCurrent = group.gameSeason === state.season;
            return (
              <div key={group.gameSeason}>
                {/* Split header */}
                <div
                  onClick={() => toggleSplit(group.gameSeason)}
                  style={{
                    padding: '7px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-2)',
                    borderBottom: '1px solid var(--border-dim)',
                    borderTop: '1px solid var(--border-dim)',
                    userSelect: 'none',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-head)',
                    fontSize: 11,
                    letterSpacing: '0.06em',
                    color: isCurrent ? 'var(--text-primary)' : 'var(--text-dim)',
                  }}>
                    S{group.calSeason} · SPLIT {group.splitNum}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    {group.matches.length}{expanded ? ' ▲' : ' ▼'}
                  </span>
                </div>

                {/* Match rows */}
                {expanded && group.matches.map(m => {
                  const oppId = m.teamAId === state.playerTeamId ? m.teamBId : m.teamAId;
                  const opp = state.teams.get(oppId);
                  const isA = m.teamAId === state.playerTeamId;
                  const won = m.result.winner === (isA ? 'A' : 'B');
                  const isSelected = (selectedMatchId ?? firstMatch?.id) === m.id;
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
                      <div style={{ fontFamily: 'var(--font-head)', fontSize: 11, color: won ? 'var(--teal)' : 'var(--red)' }}>
                        {won ? 'W' : 'L'} {m.result.winsA}–{m.result.winsB}
                      </div>
                      <div style={{ fontSize: 12 }}>vs {opp?.name ?? '?'}</div>
                      <div className="text-dim" style={{ fontSize: 11 }}>{m.label} · {m.format.toUpperCase()}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Match detail */}
      <div className="scroll-area flex-col" style={{ flex: 1, padding: 16 }}>
        {selected ? (
          <MatchDetail match={selected} state={state} />
        ) : (
          <div className="text-dim text-sm">Select a match to view details.</div>
        )}
      </div>
    </div>
  );
}
