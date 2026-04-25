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
import { Layout } from './components/Layout';

type NavItem = 'dashboard' | 'roster' | 'transfers' | 'matchday' | 'standings';

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
    <Layout state={gameState} active={nav} onNav={setNav}>
      {nav === 'dashboard'  && <Dashboard  state={gameState} onAdvanceWeek={handleAdvanceWeek} />}
      {nav === 'roster'     && <Roster     state={gameState} />}
      {nav === 'transfers'  && <TransferMarket state={gameState} />}
      {nav === 'matchday'   && <MatchDay   state={gameState} />}
      {nav === 'standings'  && <Standings  state={gameState} />}
    </Layout>
  );
}
