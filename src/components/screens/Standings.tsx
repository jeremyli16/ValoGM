import type { GameState, StandingsRow } from '../../types';
import { sortStandings } from '../../engine/leagueInit';

interface Props { state: GameState; }

function StandingsTable({ label, rows, state, playerTeamId }: {
  label: string;
  rows: StandingsRow[];
  state: GameState;
  playerTeamId: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontFamily: 'var(--font-head)', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--text-secondary)',
        marginBottom: 8,
        borderBottom: '1px solid var(--border-dim)', paddingBottom: 6,
      }}>
        {label}
      </div>
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
    </div>
  );
}

export function Standings({ state }: Props) {
  const league = state.leagues.get(state.leagueId);
  const groupAIds = league?.groups?.groupA ?? [];
  const groupBIds = league?.groups?.groupB ?? [];

  const allRows: StandingsRow[] = [];
  state.standings.forEach(row => {
    if (row.leagueId === state.leagueId && row.season === state.season) allRows.push(row);
  });
  const sorted = sortStandings(allRows);

  const rowsA = sortStandings(sorted.filter(r => groupAIds.includes(r.teamId)));
  const rowsB = sortStandings(sorted.filter(r => groupBIds.includes(r.teamId)));

  return (
    <div style={{ height: '100%', padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 className="font-head" style={{ fontSize: 18 }}>Standings — Season {state.season}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <StandingsTable label="Group A" rows={rowsA} state={state} playerTeamId={state.playerTeamId} />
        <StandingsTable label="Group B" rows={rowsB} state={state} playerTeamId={state.playerTeamId} />
      </div>
    </div>
  );
}
