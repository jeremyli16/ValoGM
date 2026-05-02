import { useState } from 'react';
import type { GameState, SplitRecord, SeasonRecord, PlayerRole, StandingsRow, InternationalTournament, RegionId } from '../../types';
import { sortStandings } from '../../engine/leagueInit';

const REGION_LABEL: Record<RegionId, string> = {
  americas: 'AMR', emea: 'EMEA', pacific: 'PAC', china: 'CHN',
};
const REGION_COLOR: Record<RegionId, string> = {
  americas: 'var(--red)', emea: 'var(--blue)', pacific: 'var(--teal)', china: 'var(--amber)',
};
const ALL_REGIONS: RegionId[] = ['americas', 'emea', 'pacific', 'china'];

const ROLE_COLORS: Record<PlayerRole, string> = {
  duelist:    'var(--role-duelist)',
  initiator:  'var(--role-initiator)',
  controller: 'var(--role-controller)',
  sentinel:   'var(--role-sentinel)',
};

const ROW_GRID = '110px 1fr 1fr 1fr auto';

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

// ─── Regional split boxes ─────────────────────────────────────────────────────

function RegionRow({ region, gameSeason, split, state }: {
  region: RegionId;
  gameSeason: number;
  split: SplitRecord;
  state: GameState;
}) {
  const [expanded, setExpanded] = useState(false);
  const league = Array.from(state.leagues.values()).find(l => l.region === region);
  if (!league) return null;

  const isPlayerRegion = league.id === state.leagueId;
  const accent = REGION_COLOR[region];

  let winnerName = '—';
  let runnerUpName = '—';
  let mvpAlias = '—';
  let mvpTeamName = '';
  let mvpRole: PlayerRole | null = null;
  const isPlayerWinner = isPlayerRegion && split.winnerTeamId === state.playerTeamId;

  if (isPlayerRegion) {
    winnerName   = teamName(state, split.winnerTeamId);
    runnerUpName = teamName(state, split.runnerUpTeamId);
    mvpAlias     = playerAlias(state, split.mvpPlayerId);
    mvpTeamName  = playerTeam(state, split.mvpPlayerId);
    mvpRole      = playerRole(state, split.mvpPlayerId);
  } else {
    const rows: StandingsRow[] = [];
    state.standings.forEach(row => {
      if (row.leagueId === league.id && row.season === gameSeason) rows.push(row);
    });
    const sorted = sortStandings(rows);
    if (sorted[0]) winnerName   = state.teams.get(sorted[0].teamId)?.name ?? '—';
    if (sorted[1]) runnerUpName = state.teams.get(sorted[1].teamId)?.name ?? '—';
    if (sorted[0]) {
      const winTeam = state.teams.get(sorted[0].teamId);
      if (winTeam) {
        const starters = winTeam.rosterIds
          .map(id => state.players.get(id))
          .filter((p): p is NonNullable<typeof p> => !!p);
        starters.sort((a, b) => (b.aim + b.gameSense) - (a.aim + a.gameSense));
        const top = starters[0];
        if (top) {
          mvpAlias    = top.alias.toUpperCase();
          mvpTeamName = winTeam.name;
          mvpRole     = top.primaryRole;
        }
      }
    }
  }

  const mvpColor = mvpRole ? ROLE_COLORS[mvpRole] : 'var(--text-primary)';

  return (
    <div style={{ borderLeft: `3px solid color-mix(in srgb, ${accent} 50%, transparent)` }}>
      <div style={{
        display: 'grid', gridTemplateColumns: ROW_GRID, gap: 12, alignItems: 'center',
        padding: '7px 18px',
        borderBottom: expanded ? 'none' : '1px solid var(--border-dim)',
        background: `color-mix(in srgb, ${accent} 3%, transparent)`,
      }}>
        <div>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.07em',
            color: accent,
            border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
            padding: '2px 6px',
          }}>
            {REGION_LABEL[region]}{isPlayerRegion ? ' ★' : ''}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: isPlayerWinner ? 700 : 400, color: isPlayerWinner ? 'var(--teal)' : 'var(--text-primary)' }}>
          {isPlayerWinner ? '★ ' : ''}{winnerName}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{runnerUpName}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 700, color: mvpColor }}>{mvpAlias}</span>
          {mvpTeamName && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{mvpTeamName}</span>}
        </div>
        <button
          className="btn"
          style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-dim)', justifySelf: 'end' }}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? 'Hide' : 'Standings'}
        </button>
      </div>
      {expanded && (
        <div style={{
          padding: '8px 18px 12px',
          borderBottom: '1px solid var(--border-dim)',
          background: 'color-mix(in srgb, var(--bg-2) 60%, transparent)',
        }}>
          <SplitStandings gameSeason={gameSeason} state={state} leagueId={league.id} />
        </div>
      )}
    </div>
  );
}

function RegionalWinners({ gameSeason, split, state }: { gameSeason: number; split: SplitRecord; state: GameState }) {
  return (
    <div>
      {ALL_REGIONS.map(region => (
        <RegionRow key={region} region={region} gameSeason={gameSeason} split={split} state={state} />
      ))}
    </div>
  );
}

// ─── Award card ───────────────────────────────────────────────────────────────

function AwardCard({ label, playerId, state, accent }: {
  label: string; playerId: string; state: GameState; accent?: string;
}) {
  const role = playerRole(state, playerId);
  const color = accent ?? (role ? ROLE_COLORS[role] : 'var(--text-secondary)');
  const team = playerTeam(state, playerId);
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderTop: `2px solid ${color}`, padding: '10px 14px', minWidth: 120,
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 8 }}>
        {label}
      </div>
      {playerId ? (
        <>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', color }}>{playerAlias(state, playerId)}</div>
          {team && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{team}</div>}
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</div>
      )}
    </div>
  );
}

// ─── Split standings ──────────────────────────────────────────────────────────

function SplitStandings({ gameSeason, state, leagueId }: { gameSeason: number; state: GameState; leagueId?: string }) {
  const lid = leagueId ?? state.leagueId;
  const rows: (StandingsRow & { name: string })[] = [];
  state.standings.forEach(row => {
    if (row.leagueId === lid && row.season === gameSeason) {
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
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, fontSize: 11 }}>
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
  );
}

// ─── Split divider ────────────────────────────────────────────────────────────

function SplitDivider({ splitNum }: { splitNum: number }) {
  return (
    <div style={{
      padding: '4px 18px',
      fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.1em',
      color: 'var(--amber)',
      background: 'color-mix(in srgb, var(--amber) 4%, var(--bg-1))',
      borderBottom: '1px solid var(--border-dim)',
      borderTop: '1px solid var(--border-dim)',
    }}>
      SPLIT {splitNum}
    </div>
  );
}

// ─── Flat tournament row ──────────────────────────────────────────────────────

function TournamentRow({
  tournament: t, state, onViewTournament,
}: {
  tournament: InternationalTournament;
  state: GameState;
  onViewTournament?: (t: InternationalTournament) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isChampions   = t.name === 'Champions';
  const isMasters     = t.name.startsWith('Masters');
  const accent        = isChampions ? 'var(--amber)' : isMasters ? '#9b5fe0' : 'var(--teal)';
  const champion      = t.champion ? teamName(state, t.champion) : '—';
  const runnerUp      = t.runnerUp ? teamName(state, t.runnerUp) : '—';
  const mvpAlias      = t.mvpPlayerId ? playerAlias(state, t.mvpPlayerId) : '—';
  const mvpTeam       = t.mvpPlayerId ? playerTeam(state, t.mvpPlayerId) : '';
  const mvpRole       = t.mvpPlayerId ? playerRole(state, t.mvpPlayerId) : null;
  const isPlayerChamp = t.champion === state.playerTeamId;
  const inProgress    = t.phase !== 'complete';

  return (
    <div style={{ background: `color-mix(in srgb, ${accent} 4%, transparent)` }}>
      <div style={{
        display: 'grid', gridTemplateColumns: ROW_GRID, gap: 12, alignItems: 'center',
        padding: '9px 18px',
        borderBottom: expanded ? 'none' : '1px solid var(--border-dim)',
        borderLeft: `3px solid ${accent}`,
      }}>
        <div>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.07em',
            color: accent,
            border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
            padding: '2px 6px',
          }}>
            {t.name.toUpperCase()}
          </span>
        </div>
        <div style={{
          fontSize: 13, fontWeight: isPlayerChamp ? 700 : 500,
          color: inProgress ? 'var(--text-dim)' : isPlayerChamp ? 'var(--amber)' : 'var(--text-primary)',
          fontStyle: inProgress ? 'italic' : undefined,
        }}>
          {inProgress ? 'In progress' : (isPlayerChamp ? '★ ' : '') + champion}
        </div>
        <div style={{ fontSize: 13, color: inProgress ? 'var(--text-dim)' : 'var(--text-secondary)', fontStyle: inProgress ? 'italic' : undefined }}>
          {inProgress ? '—' : runnerUp}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {!inProgress && (
            <>
              <span style={{ fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 700, color: mvpRole ? ROLE_COLORS[mvpRole] : 'var(--text-primary)' }}>
                {mvpAlias}
              </span>
              {mvpTeam && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{mvpTeam}</span>}
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button
            className="btn"
            style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-dim)' }}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? 'Hide' : 'Standings'}
          </button>
          {onViewTournament && (
            <button
              className="btn btn-teal"
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => onViewTournament(t)}
            >
              Bracket
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{
          padding: '10px 18px 14px',
          borderBottom: '1px solid var(--border-dim)',
          background: 'color-mix(in srgb, var(--bg-2) 60%, transparent)',
        }}>
          <TournamentStandings tournament={t} state={state} />
        </div>
      )}
    </div>
  );
}

// ─── Season section ───────────────────────────────────────────────────────────

function SeasonSection({
  season, record, splits, state, onViewTournament, tournamentsBySplit,
}: {
  season: number;
  record: SeasonRecord | null;
  splits: SplitRecord[];
  state: GameState;
  onViewTournament?: (t: InternationalTournament) => void;
  tournamentsBySplit: Map<string, InternationalTournament>;
}) {
  const [showAwards, setShowAwards] = useState(false);
  const champion   = record ? teamName(state, record.championTeamId) : null;
  const isChampion = record?.championTeamId === state.playerTeamId;

  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border)' }}>
      {/* Season header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 18px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
          SEASON {season}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {champion && (
            <span style={{ fontFamily: 'var(--font-head)', fontSize: 12, letterSpacing: '0.06em', color: isChampion ? 'var(--amber)' : 'var(--text-secondary)' }}>
              {isChampion ? '★ ' : ''}{champion}
            </span>
          )}
          {!champion && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>Season in progress</span>
          )}
          {record && (
            <button
              className="btn"
              style={{ fontSize: 9, padding: '1px 7px', color: 'var(--text-dim)' }}
              onClick={() => setShowAwards(a => !a)}
            >
              {showAwards ? 'Hide Awards' : 'Awards'}
            </button>
          )}
        </div>
      </div>

      {/* Season awards (collapsible) */}
      {showAwards && record && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-1)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <AwardCard label="SEASON MVP"       playerId={record.mvpPlayerId}       state={state} accent="var(--amber)" />
            <AwardCard label="BEST DUELIST"     playerId={record.bestDuelistId}     state={state} />
            <AwardCard label="BEST INITIATOR"   playerId={record.bestInitiatorId}   state={state} />
            <AwardCard label="BEST CONTROLLER"  playerId={record.bestControllerId}  state={state} />
            <AwardCard label="BEST SENTINEL"    playerId={record.bestSentinelId}    state={state} />
          </div>
        </div>
      )}

      {/* Column headers */}
      {splits.length > 0 && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: ROW_GRID, gap: 12,
            padding: '5px 18px',
            fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em',
            color: 'var(--text-dim)',
            borderBottom: '1px solid var(--border-dim)',
            background: 'var(--bg-1)',
          }}>
            <div>EVENT</div>
            <div>WINNER</div>
            <div>RUNNER-UP</div>
            <div>MVP</div>
            <div />
          </div>
          {splits.map(split => {
            const gameSeason = (split.calendarSeason - 1) * 3 + split.splitNum;
            const t = tournamentsBySplit.get(`${split.calendarSeason}-${split.splitNum}`);
            return (
              <div key={`${split.calendarSeason}-${split.splitNum}`}>
                {t && <TournamentRow tournament={t} state={state} onViewTournament={onViewTournament} />}
                <SplitDivider splitNum={split.splitNum} />
                <RegionalWinners gameSeason={gameSeason} split={split} state={state} />
              </div>
            );
          })}
        </>
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
          <SeasonSection
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
