import { useState } from 'react';
import type { GameState, SplitRecord, SeasonRecord, PlayerRole, StandingsRow, InternationalTournament } from '../../types';

const ROLE_COLORS: Record<PlayerRole, string> = {
  duelist:    'var(--role-duelist)',
  initiator:  'var(--role-initiator)',
  controller: 'var(--role-controller)',
  sentinel:   'var(--role-sentinel)',
};

function teamName(state: GameState, id: string): string {
  return state.teams.get(id)?.name ?? '—';
}

function playerAlias(state: GameState, id: string): string {
  const p = state.players.get(id);
  return p ? p.alias.toUpperCase() : '—';
}

function playerTeam(state: GameState, playerId: string): string {
  const player = state.players.get(playerId);
  if (!player?.teamId) return '';
  return state.teams.get(player.teamId)?.name ?? '';
}

function playerRole(state: GameState, playerId: string): PlayerRole | null {
  return state.players.get(playerId)?.primaryRole ?? null;
}

// ─── Award card ───────────────────────────────────────────────────────────────

function AwardCard({
  label, playerId, state, accent,
}: {
  label: string;
  playerId: string;
  state: GameState;
  accent?: string;
}) {
  const role = playerRole(state, playerId);
  const color = accent ?? (role ? ROLE_COLORS[role] : 'var(--text-secondary)');
  const team = playerTeam(state, playerId);

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: `1px solid var(--border)`,
      borderTop: `2px solid ${color}`,
      padding: '10px 14px',
      minWidth: 120,
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 8 }}>
        {label}
      </div>
      {playerId ? (
        <>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', color }}>
            {playerAlias(state, playerId)}
          </div>
          {team && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{team}</div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</div>
      )}
    </div>
  );
}

// ─── Split standings ──────────────────────────────────────────────────────────

function SplitStandings({ gameSeason, state }: { gameSeason: number; state: GameState }) {
  const rows: (StandingsRow & { name: string })[] = [];
  state.standings.forEach(row => {
    if (row.leagueId === state.leagueId && row.season === gameSeason) {
      rows.push({ ...row, name: state.teams.get(row.teamId)?.name ?? row.teamId });
    }
  });
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.points - a.points || b.mapDiff - a.mapDiff || b.roundDiff - a.roundDiff);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 11 }}>
      <thead>
        <tr style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-head)', fontSize: 9, letterSpacing: '0.06em' }}>
          <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 400 }}>#</th>
          <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 400 }}>TEAM</th>
          <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 400 }}>W</th>
          <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 400 }}>L</th>
          <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 400 }}>PTS</th>
          <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 400 }}>MD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const isPlayer = row.teamId === state.playerTeamId;
          return (
            <tr key={row.teamId} style={{ color: isPlayer ? 'var(--teal)' : 'var(--text-secondary)' }}>
              <td style={{ fontFamily: 'var(--font-mono)', paddingRight: 6, color: 'var(--text-dim)' }}>{i + 1}</td>
              <td style={{ fontWeight: isPlayer ? 700 : 400, paddingRight: 12 }}>{row.name}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', paddingRight: 6 }}>{row.wins}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', paddingRight: 6 }}>{row.losses}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', paddingRight: 6 }}>{row.points}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: row.mapDiff >= 0 ? 'var(--text-secondary)' : 'var(--red)' }}>
                {row.mapDiff >= 0 ? '+' : ''}{row.mapDiff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Split row ────────────────────────────────────────────────────────────────

function SplitRow({ split, state }: { split: SplitRecord; state: GameState }) {
  const [showStandings, setShowStandings] = useState(false);
  const winner     = teamName(state, split.winnerTeamId);
  const runnerUp   = teamName(state, split.runnerUpTeamId);
  const mvpAlias   = playerAlias(state, split.mvpPlayerId);
  const mvpTeam    = playerTeam(state, split.mvpPlayerId);
  const mvpRole    = playerRole(state, split.mvpPlayerId);
  const gameSeason = (split.calendarSeason - 1) * 3 + split.splitNum;

  return (
    <div style={{ borderBottom: '1px solid var(--border-dim)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '70px 1fr 1fr 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 0',
      }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 11, color: 'var(--amber)', letterSpacing: '0.08em' }}>
          SPLIT {split.splitNum}
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 3 }}>WINNER</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{winner}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 3 }}>RUNNER-UP</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{runnerUp}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 3 }}>SPLIT MVP</div>
          <div style={{
            fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 700,
            color: mvpRole ? ROLE_COLORS[mvpRole] : 'var(--text-primary)',
          }}>
            {mvpAlias}
          </div>
          {mvpTeam && <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{mvpTeam}</div>}
        </div>
        <button
          className="btn"
          style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-dim)' }}
          onClick={() => setShowStandings(s => !s)}
        >
          {showStandings ? 'Hide' : 'Standings'}
        </button>
      </div>
      {showStandings && (
        <div style={{ paddingBottom: 12 }}>
          <SplitStandings gameSeason={gameSeason} state={state} />
        </div>
      )}
    </div>
  );
}

// ─── Tournament standings ─────────────────────────────────────────────────────

const T_REGION_COLOR: Record<string, string> = {
  americas: 'var(--red)', emea: 'var(--blue)', pacific: 'var(--teal)', china: 'var(--amber)',
};
const T_REGION_ABBR: Record<string, string> = {
  americas: 'AMR', emea: 'EMEA', pacific: 'PAC', china: 'CHN',
};

function placementLabel(t: InternationalTournament, teamId: string): string {
  if (teamId === t.champion) return '1st';
  if (teamId === t.runnerUp) return '2nd';
  if (t.mainBracket?.matches.some(m => m.teamAId === teamId || m.teamBId === teamId)) return 'Main Event';
  return 'Play-in';
}

const PLACEMENT_ORDER: Record<string, number> = { '1st': 0, '2nd': 1, 'Main Event': 2, 'Play-in': 3 };

function TournamentStandings({ tournament: t, state }: { tournament: InternationalTournament; state: GameState }) {
  const rows = t.qualifiedTeams.map(seed => ({
    ...seed,
    name: state.teams.get(seed.teamId)?.name ?? seed.teamId,
    placement: placementLabel(t, seed.teamId),
    isPlayer: seed.teamId === state.playerTeamId,
  })).sort((a, b) => (PLACEMENT_ORDER[a.placement] ?? 9) - (PLACEMENT_ORDER[b.placement] ?? 9));

  return (
    <div style={{ paddingBottom: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-head)', fontSize: 9, letterSpacing: '0.06em' }}>
            <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 400 }}>#</th>
            <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 400 }}>TEAM</th>
            <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 400 }}>REGION</th>
            <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 400 }}>RESULT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.teamId} style={{ color: row.isPlayer ? 'var(--teal)' : 'var(--text-secondary)' }}>
              <td style={{ fontFamily: 'var(--font-mono)', paddingRight: 6, color: 'var(--text-dim)' }}>{i + 1}</td>
              <td style={{ fontWeight: row.isPlayer ? 700 : 400, paddingRight: 12 }}>{row.name}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: T_REGION_COLOR[row.region] ?? 'var(--text-dim)', paddingRight: 12 }}>
                {T_REGION_ABBR[row.region] ?? row.region}
              </td>
              <td style={{
                fontFamily: 'var(--font-head)', fontSize: 10, letterSpacing: '0.04em',
                color: row.placement === '1st' ? 'var(--amber)' : row.placement === '2nd' ? 'var(--text-primary)' : 'var(--text-dim)',
              }}>
                {row.placement.toUpperCase()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tournament row ───────────────────────────────────────────────────────────

function TournamentRow({
  tournament: t, state, onViewTournament,
}: {
  tournament: InternationalTournament;
  state: GameState;
  onViewTournament?: (t: InternationalTournament) => void;
}) {
  const [showStandings, setShowStandings] = useState(false);
  const isChampions     = t.name === 'Champions';
  const accent          = isChampions ? 'var(--amber)' : 'var(--teal)';
  const champion        = t.champion ? teamName(state, t.champion) : '—';
  const runnerUp        = t.runnerUp ? teamName(state, t.runnerUp) : '—';
  const mvpAlias        = t.mvpPlayerId ? playerAlias(state, t.mvpPlayerId) : '—';
  const mvpTeam         = t.mvpPlayerId ? playerTeam(state, t.mvpPlayerId) : '';
  const mvpRole         = t.mvpPlayerId ? playerRole(state, t.mvpPlayerId) : null;
  const isPlayerChamp   = t.champion === state.playerTeamId;
  const inProgress      = t.phase !== 'complete';

  return (
    <div style={{ borderBottom: '1px solid var(--border-dim)', background: 'color-mix(in srgb, var(--bg-2) 40%, transparent)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 1fr 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 0',
      }}>
        <div>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em',
            color: accent, border: `1px solid ${accent}`, padding: '2px 6px',
          }}>
            {t.name.toUpperCase()}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 3 }}>CHAMPION</div>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: isPlayerChamp ? 'var(--amber)' : inProgress ? 'var(--text-dim)' : 'var(--text-primary)',
            fontStyle: inProgress ? 'italic' : undefined,
          }}>
            {inProgress ? 'In progress' : (isPlayerChamp ? '★ ' : '') + champion}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 3 }}>RUNNER-UP</div>
          <div style={{ fontSize: 13, color: inProgress ? 'var(--text-dim)' : 'var(--text-secondary)', fontStyle: inProgress ? 'italic' : undefined }}>
            {inProgress ? '—' : runnerUp}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 3 }}>TOURNAMENT MVP</div>
          <div style={{
            fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 700,
            color: mvpRole ? ROLE_COLORS[mvpRole] : inProgress ? 'var(--text-dim)' : 'var(--text-primary)',
            fontStyle: inProgress ? 'italic' : undefined,
          }}>
            {inProgress ? '—' : mvpAlias}
          </div>
          {!inProgress && mvpTeam && <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{mvpTeam}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <button
            className="btn"
            style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-dim)' }}
            onClick={() => setShowStandings(s => !s)}
          >
            {showStandings ? 'Hide' : 'Standings'}
          </button>
          {onViewTournament && (
            <button
              className="btn btn-teal"
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => onViewTournament(t)}
            >
              View Bracket
            </button>
          )}
        </div>
      </div>
      {showStandings && <TournamentStandings tournament={t} state={state} />}
    </div>
  );
}

// ─── Season block ─────────────────────────────────────────────────────────────

function SeasonBlock({
  season, record, splits, state, onViewTournament, tournamentsBySplit,
}: {
  season: number;
  record: SeasonRecord | null;
  splits: SplitRecord[];
  state: GameState;
  onViewTournament?: (t: InternationalTournament) => void;
  tournamentsBySplit: Map<string, InternationalTournament>;
}) {
  const champion = record ? teamName(state, record.championTeamId) : null;
  const playerTeamId = state.playerTeamId;
  const isChampion = record?.championTeamId === playerTeamId;

  return (
    <div style={{
      border: '1px solid var(--border)',
      marginBottom: 20,
      background: 'var(--bg-1)',
    }}>
      {/* Season header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
      }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, letterSpacing: '0.08em', fontWeight: 700 }}>
          SEASON {season}
        </div>
        {champion ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-head)', letterSpacing: '0.06em' }}>CHAMPION</span>
            <span style={{
              fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em',
              color: isChampion ? 'var(--amber)' : 'var(--text-primary)',
              padding: '3px 10px',
              border: `1px solid ${isChampion ? 'var(--amber)' : 'var(--border)'}`,
            }}>
              {isChampion ? '★ ' : ''}{champion}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-head)', fontStyle: 'italic' }}>
            Season in progress
          </span>
        )}
      </div>

      {/* Season awards */}
      {record && (
        <div style={{ padding: '16px 18px', borderBottom: splits.length > 0 ? '1px solid var(--border)' : undefined }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 12 }}>
            SEASON AWARDS
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <AwardCard label="SEASON MVP"       playerId={record.mvpPlayerId}       state={state} accent="var(--amber)" />
            <AwardCard label="BEST DUELIST"     playerId={record.bestDuelistId}     state={state} />
            <AwardCard label="BEST INITIATOR"   playerId={record.bestInitiatorId}   state={state} />
            <AwardCard label="BEST CONTROLLER"  playerId={record.bestControllerId}  state={state} />
            <AwardCard label="BEST SENTINEL"    playerId={record.bestSentinelId}    state={state} />
          </div>
        </div>
      )}

      {/* Split + tournament rows */}
      {splits.length > 0 && (
        <div style={{ padding: '12px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 4 }}>
            SPLITS & TOURNAMENTS
          </div>
          {splits.map(split => {
            const t = tournamentsBySplit.get(`${split.calendarSeason}-${split.splitNum}`);
            return (
              <div key={`${split.calendarSeason}-${split.splitNum}`}>
                {t && <TournamentRow tournament={t} state={state} onViewTournament={onViewTournament} />}
                <SplitRow split={split} state={state} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function LeagueHistory({ state, onViewTournament }: { state: GameState; onViewTournament?: (t: InternationalTournament) => void }) {
  const { splitHistory, seasonHistory } = state;

  if (seasonHistory.length === 0 && splitHistory.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
          NO HISTORY YET
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Split results appear here after each split ends.
        </div>
      </div>
    );
  }

  const splitsBySeason = new Map<number, SplitRecord[]>();
  for (const s of splitHistory) {
    if (!splitsBySeason.has(s.calendarSeason)) splitsBySeason.set(s.calendarSeason, []);
    splitsBySeason.get(s.calendarSeason)!.push(s);
  }

  // Build lookup: "calendarSeason-splitNum" → tournament
  const tournamentsBySplit = new Map<string, InternationalTournament>();
  const allTournaments = [
    ...state.tournamentHistory,
    ...(state.activeInternationalTournament ? [state.activeInternationalTournament] : []),
  ];
  for (const t of allTournaments) {
    tournamentsBySplit.set(`${t.calendarSeason}-${t.splitNum}`, t);
  }

  const allSeasons = new Set([
    ...seasonHistory.map(r => r.season),
    ...splitHistory.map(s => s.calendarSeason),
  ]);
  const sortedSeasons = [...allSeasons].sort((a, b) => b - a);

  return (
    <div className="scroll-area" style={{ height: '100%', padding: '20px 24px' }}>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 20 }}>
        LEAGUE HISTORY
      </div>
      {sortedSeasons.map(season => {
        const record = seasonHistory.find(r => r.season === season) ?? null;
        const splits = (splitsBySeason.get(season) ?? []).sort((a, b) => b.splitNum - a.splitNum);
        return (
          <SeasonBlock
            key={season}
            season={season}
            record={record}
            splits={splits}
            state={state}
            onViewTournament={onViewTournament}
            tournamentsBySplit={tournamentsBySplit}
          />
        );
      })}
    </div>
  );
}
