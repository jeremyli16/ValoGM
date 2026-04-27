import type { GameState, SplitRecord, SeasonRecord, PlayerRole } from '../../types';

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

// ─── Split row ────────────────────────────────────────────────────────────────

function SplitRow({ split, state }: { split: SplitRecord; state: GameState }) {
  const winner    = teamName(state, split.winnerTeamId);
  const runnerUp  = teamName(state, split.runnerUpTeamId);
  const mvpAlias  = playerAlias(state, split.mvpPlayerId);
  const mvpTeam   = playerTeam(state, split.mvpPlayerId);
  const mvpRole   = playerRole(state, split.mvpPlayerId);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '70px 1fr 1fr 1fr',
      gap: 12,
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border-dim)',
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
    </div>
  );
}

// ─── Season block ─────────────────────────────────────────────────────────────

function SeasonBlock({
  season, record, splits, state,
}: {
  season: number;
  record: SeasonRecord | null;
  splits: SplitRecord[];
  state: GameState;
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

      {/* Split rows */}
      {splits.length > 0 && (
        <div style={{ padding: '12px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 4 }}>
            SPLITS
          </div>
          {splits.map(split => (
            <SplitRow key={`${split.calendarSeason}-${split.splitNum}`} split={split} state={state} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function LeagueHistory({ state }: { state: GameState }) {
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
          />
        );
      })}
    </div>
  );
}
