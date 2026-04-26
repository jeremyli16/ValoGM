import { useState, useCallback } from 'react';
import type { GameState, RegionId, Player, CoachRole } from './types';
import { HOME_NATIONALITIES } from './types';
import { createNewGame, advanceWeek } from './engine/gameLoop';
import { initNewGameDb, persistGameState } from './db/repos';
import { NewGame } from './components/screens/NewGame';
import { Dashboard } from './components/screens/Dashboard';
import { Roster } from './components/screens/Roster';
import { TransferMarket } from './components/screens/TransferMarket';
import { MatchDay } from './components/screens/MatchDay';
import { Standings } from './components/screens/Standings';
import { Schedule } from './components/screens/Schedule';
import { Playoffs } from './components/screens/Playoffs';
import { Layout } from './components/Layout';

type NavItem = 'dashboard' | 'roster' | 'transfers' | 'matchday' | 'standings' | 'schedule' | 'playoffs';

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [nav, setNav] = useState<NavItem>('dashboard');
  const [loading, setLoading] = useState(false);
  const [importViolators, setImportViolators] = useState<Player[]>([]);

  const handleStart = useCallback(async (regionId: RegionId, teamIndex: number, seed: number) => {
    setLoading(true);
    try {
      // Run in a microtask to allow loading indicator to render
      await new Promise(r => setTimeout(r, 30));
      const state = createNewGame(regionId, teamIndex, seed);
      await initNewGameDb(state);
      setGameState(state);
      setNav('dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMovePlayer = useCallback((playerId: string, to: 'starter' | 'bench') => {
    if (!gameState) return;
    const team = gameState.teams.get(gameState.playerTeamId);
    if (!team) return;
    const newTeam = { ...team };
    if (to === 'bench') {
      newTeam.rosterIds = newTeam.rosterIds.filter(id => id !== playerId);
      if (!newTeam.subIds.includes(playerId)) newTeam.subIds = [...newTeam.subIds, playerId];
    } else {
      if (newTeam.rosterIds.length >= 5) return;
      newTeam.subIds = newTeam.subIds.filter(id => id !== playerId);
      if (!newTeam.rosterIds.includes(playerId)) newTeam.rosterIds = [...newTeam.rosterIds, playerId];
    }
    gameState.teams.set(gameState.playerTeamId, newTeam);
    setGameState({ ...gameState });
  }, [gameState]);

  const handleHireCoach = useCallback((coachId: string, role: CoachRole) => {
    if (!gameState) return;
    const team = gameState.teams.get(gameState.playerTeamId);
    if (!team) return;
    const coach = gameState.coaches.get(coachId);
    if (!coach) return;

    // Release whoever currently holds this role back to free agency
    const displacedId = role === 'head' ? team.headCoachId : team.assistantCoachId;
    if (displacedId) {
      const displaced = gameState.coaches.get(displacedId);
      if (displaced) {
        gameState.coaches.set(displacedId, { ...displaced, teamId: null, role: null });
        if (!gameState.freeAgentCoaches.includes(displacedId)) {
          gameState.freeAgentCoaches = [...gameState.freeAgentCoaches, displacedId];
        }
        gameState.dirtyCoaches.add(displacedId);
      }
    }

    // Assign new coach
    gameState.coaches.set(coachId, { ...coach, teamId: gameState.playerTeamId, role });
    gameState.freeAgentCoaches = gameState.freeAgentCoaches.filter(id => id !== coachId);
    gameState.dirtyCoaches.add(coachId);

    // Update team
    const updatedTeam = role === 'head'
      ? { ...team, headCoachId: coachId }
      : { ...team, assistantCoachId: coachId };
    gameState.teams.set(gameState.playerTeamId, updatedTeam);

    setGameState({ ...gameState });
  }, [gameState]);

  const handleFireCoach = useCallback((role: CoachRole) => {
    if (!gameState) return;
    const team = gameState.teams.get(gameState.playerTeamId);
    if (!team) return;

    const coachId = role === 'head' ? team.headCoachId : team.assistantCoachId;
    if (!coachId) return;

    const coach = gameState.coaches.get(coachId);
    if (coach) {
      gameState.coaches.set(coachId, { ...coach, teamId: null, role: null });
      if (!gameState.freeAgentCoaches.includes(coachId)) {
        gameState.freeAgentCoaches = [...gameState.freeAgentCoaches, coachId];
      }
      gameState.dirtyCoaches.add(coachId);
    }

    const updatedTeam = role === 'head'
      ? { ...team, headCoachId: null }
      : { ...team, assistantCoachId: null };
    gameState.teams.set(gameState.playerTeamId, updatedTeam);

    setGameState({ ...gameState });
  }, [gameState]);

  const handleAdvanceWeek = useCallback(async () => {
    if (!gameState) return;

    if (gameState.phase !== 'preseason' && gameState.phase !== 'new_game') {
      const team = gameState.teams.get(gameState.playerTeamId);
      if (team) {
        const homeNats = HOME_NATIONALITIES[team.region];
        const imports = team.rosterIds
          .map(id => gameState.players.get(id))
          .filter((p): p is Player => !!p && !homeNats.includes(p.nationality));
        if (imports.length > 1) {
          setImportViolators(imports);
          return;
        }
      }
    }

    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 20));
      const next = advanceWeek({ ...gameState });
      await persistGameState(next);
      setGameState({ ...next });
    } finally {
      setLoading(false);
    }
  }, [gameState]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontSize: 14 }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!gameState) {
    return <NewGame onStart={handleStart} />;
  }

  return (
    <>
      <Layout state={gameState} active={nav} onNav={setNav} onAdvanceWeek={handleAdvanceWeek}>
        {nav === 'dashboard'  && <Dashboard  state={gameState} />}
        {nav === 'roster'     && <Roster     state={gameState} onMovePlayer={handleMovePlayer} />}
        {nav === 'transfers'  && <TransferMarket state={gameState} onHireCoach={handleHireCoach} onFireCoach={handleFireCoach} />}
        {nav === 'matchday'   && <MatchDay   state={gameState} />}
        {nav === 'standings'  && <Standings  state={gameState} />}
        {nav === 'schedule'   && <Schedule   state={gameState} />}
        {nav === 'playoffs'   && <Playoffs   state={gameState} />}
      </Layout>

      {importViolators.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--red)',
            clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)',
            padding: 24,
            maxWidth: 420,
            width: '90%',
          }}>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, color: 'var(--red)', letterSpacing: '0.08em', marginBottom: 8 }}>
              IMPORT LIMIT EXCEEDED
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Only <strong style={{ color: 'var(--text-primary)' }}>1 import player</strong> is allowed in the starting lineup.
              Remove the following players from the starting five before advancing:
            </div>
            <div style={{ marginBottom: 20 }}>
              {importViolators.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', marginBottom: 6,
                  background: 'var(--bg-2)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14 }}>{p.alias.toUpperCase()}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.nationality}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-red"
                style={{ flex: 1 }}
                onClick={() => { setImportViolators([]); setNav('roster'); }}
              >
                Go to Roster
              </button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setImportViolators([])}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
