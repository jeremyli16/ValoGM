import { useState, useCallback } from 'react';
import type { GameState, RegionId } from './types';
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

  const handleAdvanceWeek = useCallback(async () => {
    if (!gameState) return;
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
    <Layout state={gameState} active={nav} onNav={setNav} onAdvanceWeek={handleAdvanceWeek}>
      {nav === 'dashboard'  && <Dashboard  state={gameState} />}
      {nav === 'roster'     && <Roster     state={gameState} onMovePlayer={handleMovePlayer} />}
      {nav === 'transfers'  && <TransferMarket state={gameState} />}
      {nav === 'matchday'   && <MatchDay   state={gameState} />}
      {nav === 'standings'  && <Standings  state={gameState} />}
      {nav === 'schedule'   && <Schedule   state={gameState} />}
      {nav === 'playoffs'   && <Playoffs   state={gameState} />}
    </Layout>
  );
}
