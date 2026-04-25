import { useState } from 'react';
import type { GameState, StandingsRow, ScheduledMatch, MapResult } from '../../types';
import { sortStandings } from '../../engine/leagueInit';

interface Props { state: GameState; }

type StandingsTab = 'groupA' | 'groupB' | 'schedule' | 'playoffs';

function StandingsTable({ rows, state, playerTeamId }: { rows: StandingsRow[]; state: GameState; playerTeamId: string }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>W</th>
          <th>L</th>
          <th>PTS</th>
          <th>Map Diff</th>
          <th>Rnd Diff</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const team = state.teams.get(row.teamId);
          const isPlayer = row.teamId === playerTeamId;
          return (
            <tr key={row.teamId} className={isPlayer ? 'highlight' : ''}>
              <td className="font-mono text-dim">{i + 1}</td>
              <td>
                <span style={{ fontWeight: isPlayer ? 700 : 400, color: isPlayer ? 'var(--red)' : 'inherit' }}>
                  {team?.name ?? row.teamId}
                </span>
              </td>
              <td className="font-mono" style={{ color: 'var(--teal)' }}>{row.wins}</td>
              <td className="font-mono" style={{ color: 'var(--red)' }}>{row.losses}</td>
              <td className="font-mono bold">{row.points}</td>
              <td className="font-mono" style={{ color: row.mapDiff >= 0 ? 'var(--teal)' : 'var(--red)' }}>
                {row.mapDiff >= 0 ? '+' : ''}{row.mapDiff}
              </td>
              <td className="font-mono" style={{ color: row.roundDiff >= 0 ? 'var(--teal)' : 'var(--red)' }}>
                {row.roundDiff >= 0 ? '+' : ''}{row.roundDiff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScheduleView({ state }: { state: GameState }) {
  const teamMatches: ScheduledMatch[] = [];
  state.matches.forEach(m => {
    if (m.leagueId === state.leagueId && m.season === state.season &&
        (m.teamAId === state.playerTeamId || m.teamBId === state.playerTeamId)) {
      teamMatches.push(m);
    }
  });
  teamMatches.sort((a, b) => a.week - b.week);

  return (
    <div className="flex-col gap-2">
      {teamMatches.map(m => {
        const isA = m.teamAId === state.playerTeamId;
        const opp = state.teams.get(isA ? m.teamBId : m.teamAId);
        const result = m.result;
        const won = result ? result.winner === (isA ? 'A' : 'B') : null;
        return (
          <div key={m.id} className="card" style={{ padding: '10px 12px' }}>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-dim text-xs font-head uppercase" style={{ marginRight: 8 }}>Wk {m.week}</span>
                <span style={{ fontWeight: 600 }}>vs {opp?.name ?? '?'}</span>
                <span className="text-dim text-xs" style={{ marginLeft: 8 }}>{m.format.toUpperCase()}</span>
              </div>
              {result ? (
                <div className="flex items-center gap-2">
                  <span
                    className="font-head bold text-sm"
                    style={{ color: won ? 'var(--teal)' : 'var(--red)' }}
                  >
                    {won ? 'W' : 'L'}
                  </span>
                  <span className="font-mono text-sm">{result.winsA}-{result.winsB}</span>
                  {result.mapResults.map((mr: MapResult, i: number) => (
                    <span key={i} className="font-mono text-xs text-dim">
                      {mr.mapName.slice(0, 3).toUpperCase()} {mr.scoreA}-{mr.scoreB}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-dim text-xs">Upcoming</span>
              )}
            </div>
          </div>
        );
      })}
      {teamMatches.length === 0 && <div className="text-dim text-sm">No schedule data.</div>}
    </div>
  );
}

function PlayoffView({ state }: { state: GameState }) {
  const bracket = state.playoffBracket;
  if (!bracket) {
    return <div className="text-dim text-sm">Playoffs have not started yet.</div>;
  }

  const roundOrder = ['UQF1', 'UQF2', 'USF1', 'USF2', 'UF', 'LR1', 'LSF', 'LF', 'GF'];
  const upperRounds = ['UQF1', 'UQF2', 'USF1', 'USF2', 'UF'];
  const lowerRounds = ['LR1', 'LSF', 'LF'];

  function renderMatch(round: string) {
    const m = bracket!.matches.find(x => x.round === round);
    if (!m) return null;
    const teamA = m.teamAId ? state.teams.get(m.teamAId) : null;
    const teamB = m.teamBId ? state.teams.get(m.teamBId) : null;
    const result = m.result;
    return (
      <div className="card" style={{ padding: '8px 12px', marginBottom: 8 }}>
        <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 4 }}>{round}</div>
        <div className="flex justify-between items-center">
          <span style={{ fontWeight: result?.winner === 'A' ? 700 : 400, color: result?.winner === 'A' ? 'var(--teal)' : 'inherit' }}>
            {teamA?.name ?? 'TBD'}
          </span>
          <span className="font-mono text-dim text-xs">
            {result ? `${result.winsA} - ${result.winsB}` : m.format.toUpperCase()}
          </span>
          <span style={{ fontWeight: result?.winner === 'B' ? 700 : 400, color: result?.winner === 'B' ? 'var(--teal)' : 'inherit', textAlign: 'right' }}>
            {teamB?.name ?? 'TBD'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Upper Bracket</div>
        {upperRounds.map(r => <div key={r}>{renderMatch(r)}</div>)}
      </div>
      <div>
        <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Lower Bracket & Grand Final</div>
        {lowerRounds.map(r => <div key={r}>{renderMatch(r)}</div>)}
        <div className="text-amber text-xs font-head uppercase" style={{ marginTop: 8, marginBottom: 8 }}>Grand Final</div>
        {renderMatch('GF')}
        {bracket.champion && (
          <div className="card p-2" style={{ background: 'var(--teal-dim)', borderColor: 'var(--teal)', textAlign: 'center' }}>
            <div className="text-teal font-head bold" style={{ fontSize: 16 }}>
              🏆 {state.teams.get(bracket.champion)?.name ?? 'Champion'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Standings({ state }: Props) {
  const [tab, setTab] = useState<StandingsTab>('groupA');

  const league = state.leagues.get(state.leagueId);
  const groupA = league?.groups?.groupA ?? [];
  const groupB = league?.groups?.groupB ?? [];

  const allRows: StandingsRow[] = [];
  state.standings.forEach(row => {
    if (row.leagueId === state.leagueId && row.season === state.season) allRows.push(row);
  });
  const sorted = sortStandings(allRows);

  const rowsA = sortStandings(sorted.filter(r => groupA.includes(r.teamId)));
  const rowsB = sortStandings(sorted.filter(r => groupB.includes(r.teamId)));

  return (
    <div className="flex-col" style={{ height: '100%', padding: 16, overflow: 'hidden' }}>
      <h2 className="font-head" style={{ fontSize: 18, marginBottom: 12 }}>Standings — Season {state.season}</h2>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <div className={`tab ${tab === 'groupA' ? 'active' : ''}`} onClick={() => setTab('groupA')}>Group A</div>
        <div className={`tab ${tab === 'groupB' ? 'active' : ''}`} onClick={() => setTab('groupB')}>Group B</div>
        <div className={`tab ${tab === 'playoffs' ? 'active' : ''}`} onClick={() => setTab('playoffs')}>Playoffs</div>
        <div className={`tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>My Schedule</div>
      </div>

      <div className="scroll-area" style={{ flex: 1 }}>
        {tab === 'groupA' && <StandingsTable rows={rowsA} state={state} playerTeamId={state.playerTeamId} />}
        {tab === 'groupB' && <StandingsTable rows={rowsB} state={state} playerTeamId={state.playerTeamId} />}
        {tab === 'schedule' && <ScheduleView state={state} />}
        {tab === 'playoffs' && <PlayoffView state={state} />}
      </div>
    </div>
  );
}
