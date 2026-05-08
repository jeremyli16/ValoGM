import type { GameState, Player, Team, Coach, PlayerRole } from '../types';
import { HOME_NATIONALITIES, IMPORT_LIMITS } from '../types';
import { notifId } from './notifId';

const ROLES: PlayerRole[] = ['duelist', 'initiator', 'controller', 'sentinel'];

function skillScore(p: Player): number {
  return p.trueAim * 0.55 + p.trueGameSense * 0.45;
}

export function autoFillRoster(state: GameState): GameState {
  const team = state.teams.get(state.playerTeamId);
  if (!team || team.rosterIds.length >= 5) return state;

  const homeNats = HOME_NATIONALITIES[team.region];
  const maxImports = IMPORT_LIMITS[team.region].maxImports;
  const starterSet = new Set(team.rosterIds);
  const newRoster = [...team.rosterIds];

  let importCount = newRoster
    .map(id => state.players.get(id))
    .filter((p): p is Player => !!p && !homeNats.includes(p.nationality))
    .length;

  const canAdd = (p: Player) => homeNats.includes(p.nationality) || importCount < maxImports;

  let benchPool = team.subIds
    .filter(id => !starterSet.has(id))
    .map(id => state.players.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => skillScore(b) - skillScore(a));

  let faPool = state.freeAgents
    .map(id => state.players.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => skillScore(b) - skillScore(a));

  const teamId = team.id;
  const promotedFromBench: string[] = [];
  const signedFromFA: string[] = [];

  function promote(p: Player, isBench: boolean) {
    if (newRoster.includes(p.id)) return;
    if (!homeNats.includes(p.nationality)) importCount++;
    newRoster.push(p.id);
    if (isBench) {
      benchPool = benchPool.filter(x => x.id !== p.id);
      promotedFromBench.push(p.id);
    } else {
      faPool = faPool.filter(x => x.id !== p.id);
      signedFromFA.push(p.id);
      const contractId = `auto_${p.id}_s${state.season}`;
      state.players.set(p.id, { ...p, teamId, contractId });
      state.dirtyPlayers.add(p.id);
      state.contracts.set(contractId, {
        id: contractId,
        playerId: p.id,
        teamId,
        salary: p.salary,
        length: 1,
        buyout: Math.round(p.salary * 2),
        startSeason: state.season,
        endSeason: Math.ceil(state.season / 3) * 3,
      });
      state.notifications.push({
        id: notifId(),
        type: 'development',
        title: 'Free Agent Signed',
        body: `${p.alias} signed to fill a vacant starting spot.`,
        week: state.week,
        read: false,
      });
    }
  }

  for (const role of ROLES) {
    if (newRoster.length >= 5) break;
    const currentRoles = new Set(newRoster.map(id => state.players.get(id)?.primaryRole));
    if (currentRoles.has(role)) continue;
    const fromBench = benchPool.find(p => p.primaryRole === role && canAdd(p));
    if (fromBench) { promote(fromBench, true); continue; }
    const fromFA = faPool.find(p => p.primaryRole === role && canAdd(p));
    if (fromFA) promote(fromFA, false);
  }

  while (newRoster.length < 5) {
    const b = benchPool.find(p => canAdd(p));
    const f = faPool.find(p => canAdd(p));
    if (!b && !f) break;
    if (b && (!f || skillScore(b) >= skillScore(f))) promote(b, true);
    else if (f) promote(f, false);
    else break;
  }

  team.rosterIds = newRoster;
  const promotedSet = new Set(promotedFromBench);
  team.subIds = team.subIds.filter(id => !promotedSet.has(id));
  const signedSet = new Set(signedFromFA);
  state.freeAgents = state.freeAgents.filter(id => !signedSet.has(id));
  state.teams.set(team.id, team);

  return state;
}

export function aiSignFreeAgent(state: GameState, team: Team, player: Player): void {
  const contractId = `ai_${player.id}_s${state.season}`;
  state.players.set(player.id, { ...player, teamId: team.id, contractId });
  state.dirtyPlayers.add(player.id);
  state.contracts.set(contractId, {
    id: contractId, playerId: player.id, teamId: team.id,
    salary: player.salary, length: 1,
    buyout: Math.round(player.salary * 2),
    startSeason: state.season,
    endSeason: Math.ceil(state.season / 3) * 3,
  });
  state.freeAgents = state.freeAgents.filter(id => id !== player.id);
  team.rosterIds = [...team.rosterIds, player.id];
}

export function aiSignBenchPlayer(state: GameState, team: Team, player: Player): void {
  if (!player.teamId) return;
  const src = state.teams.get(player.teamId);
  if (src) {
    src.subIds = src.subIds.filter(id => id !== player.id);
    state.teams.set(src.id, src);
  }
  const contractId = `ai_${player.id}_s${state.season}`;
  state.players.set(player.id, { ...player, teamId: team.id, contractId });
  state.dirtyPlayers.add(player.id);
  state.contracts.set(contractId, {
    id: contractId, playerId: player.id, teamId: team.id,
    salary: player.salary, length: 1,
    buyout: Math.round(player.salary * 2),
    startSeason: state.season,
    endSeason: Math.ceil(state.season / 3) * 3,
  });
  team.rosterIds = [...team.rosterIds, player.id];
}

export function aiHireCoach(state: GameState, team: Team, coach: Coach, role: 'head' | 'assistant'): void {
  const displaced = role === 'head' ? team.headCoachId : team.assistantCoachId;
  if (displaced) {
    const old = state.coaches.get(displaced);
    if (old) {
      state.coaches.set(displaced, { ...old, teamId: null });
      if (!state.freeAgentCoaches.includes(displaced))
        state.freeAgentCoaches = [...state.freeAgentCoaches, displaced];
    }
  }
  state.coaches.set(coach.id, { ...coach, teamId: team.id });
  state.freeAgentCoaches = state.freeAgentCoaches.filter(id => id !== coach.id);
  if (role === 'head') team.headCoachId = coach.id;
  else team.assistantCoachId = coach.id;
}

export function aiMidseasonTick(state: GameState): GameState {
  const rng = Math.random;

  state.teams.forEach((team, teamId) => {
    if (teamId === state.playerTeamId) return;

    const homeNats  = HOME_NATIONALITIES[team.region];
    const maxImports = IMPORT_LIMITS[team.region].maxImports;
    const countImports = (ids: string[]) =>
      ids.map(id => state.players.get(id))
         .filter((p): p is Player => !!p && !homeNats.includes(p.nationality)).length;
    const canAdd = (p: Player, roster: string[]) =>
      homeNats.includes(p.nationality) || countImports(roster) < maxImports;

    if (rng() < 0.30) {
      if (team.rosterIds.length < 5) {
        const rosterRoles = new Set(team.rosterIds.map(id => state.players.get(id)?.primaryRole));
        const needed = ROLES.find(r => !rosterRoles.has(r));
        const match = (p: Player) => !needed || p.primaryRole === needed;

        const fromBench = team.subIds
          .map(id => state.players.get(id))
          .filter((p): p is Player => !!p && match(p) && canAdd(p, team.rosterIds))
          .sort((a, b) => skillScore(b) - skillScore(a))[0];

        if (fromBench) {
          team.rosterIds = [...team.rosterIds, fromBench.id];
          team.subIds = team.subIds.filter(id => id !== fromBench.id);
        } else {
          const fromFA = state.freeAgents
            .map(id => state.players.get(id))
            .filter((p): p is Player => !!p && match(p) && canAdd(p, team.rosterIds))
            .sort((a, b) => skillScore(b) - skillScore(a))[0];
          if (fromFA) aiSignFreeAgent(state, team, fromFA);
        }
        state.teams.set(teamId, team);
      } else {
        const starters = team.rosterIds.map(id => state.players.get(id)).filter((p): p is Player => !!p);
        const worst = starters.reduce((a, b) => skillScore(a) < skillScore(b) ? a : b);
        const worstSc = skillScore(worst);
        const rosterWithout = team.rosterIds.filter(id => id !== worst.id);

        const bestBench = team.subIds
          .map(id => state.players.get(id))
          .filter((p): p is Player => !!p && canAdd(p, rosterWithout))
          .sort((a, b) => skillScore(b) - skillScore(a))[0];

        if (bestBench && skillScore(bestBench) > worstSc + 10) {
          team.rosterIds = [...rosterWithout, bestBench.id];
          team.subIds = team.subIds.filter(id => id !== bestBench.id).concat(worst.id);
          state.teams.set(teamId, team);
        } else if (rng() < 0.40) {
          const faUpgrade = state.freeAgents
            .map(id => state.players.get(id))
            .filter((p): p is Player => !!p
              && p.primaryRole === worst.primaryRole
              && canAdd(p, rosterWithout)
              && skillScore(p) > worstSc + 12)
            .sort((a, b) => skillScore(b) - skillScore(a))[0];

          if (faUpgrade) {
            team.rosterIds = rosterWithout;
            if (!team.subIds.includes(worst.id)) team.subIds = [...team.subIds, worst.id];
            aiSignFreeAgent(state, team, faUpgrade);
            state.teams.set(teamId, team);
          } else {
            const candidates: Player[] = [];
            state.teams.forEach((ot, oid) => {
              if (oid === teamId) return;
              ot.subIds.forEach(id => {
                const p = state.players.get(id);
                if (p && p.primaryRole === worst.primaryRole
                    && canAdd(p, rosterWithout) && skillScore(p) > worstSc + 15)
                  candidates.push(p);
              });
            });
            candidates.sort((a, b) => skillScore(b) - skillScore(a));
            const steal = candidates[0];
            if (steal) {
              team.rosterIds = rosterWithout;
              if (!team.subIds.includes(worst.id)) team.subIds = [...team.subIds, worst.id];
              aiSignBenchPlayer(state, team, steal);
              state.teams.set(teamId, team);
            }
          }
        }
      }
    }

    if (rng() < 0.20 && state.freeAgentCoaches.length > 0) {
      const role: 'head' | 'assistant' | null =
        !team.headCoachId ? 'head' :
        (!team.assistantCoachId && rng() < 0.4) ? 'assistant' : null;
      if (role) {
        const best = state.freeAgentCoaches
          .map(id => state.coaches.get(id))
          .filter((c): c is Coach => !!c)
          .sort((a, b) => (b.tactics + b.scouting + b.moraleBoost) - (a.tactics + a.scouting + a.moraleBoost))[0];
        if (best) {
          aiHireCoach(state, team, best, role);
          state.teams.set(teamId, team);
        }
      }
    }
  });

  return state;
}
