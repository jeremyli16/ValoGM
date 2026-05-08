import type { GameState } from '../types';
import { notifId } from './notifId';
import { releasePlayer } from './transfers';

export function detectExpiringContracts(state: GameState): GameState {
  if (state.season % 3 !== 0) return state;
  const team = state.teams.get(state.playerTeamId);
  if (!team) return state;

  [...team.rosterIds, ...team.subIds].forEach(playerId => {
    const player = state.players.get(playerId);
    if (!player?.contractId) return;
    const contract = state.contracts.get(player.contractId);
    if (!contract || contract.endSeason !== state.season) return;

    const decisionId = `renewal_${state.season}_${playerId}`;
    if (state.pendingDecisions.some(d => d.id === decisionId)) return;

    state.pendingDecisions.push({
      id: decisionId,
      type: 'contract_renewal',
      description: `Re-sign ${player.alias}?`,
      deadline: state.week + 2,
      data: {
        playerId,
        askingSalary: contract.salary,
        currentSalary: contract.salary,
        contractId: contract.id,
        offerPending: false,
      },
    });

    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Contract Expired',
      body: `${player.alias}'s contract has expired. Re-sign them from the Finances screen or they enter free agency in 2 weeks.`,
      week: state.week,
      read: false,
    });
  });

  return state;
}

export function warnUnresolvedRenewals(state: GameState): GameState {
  state.pendingDecisions.forEach(d => {
    if (d.type !== 'contract_renewal' || d.data.offerPending) return;
    const player = state.players.get(d.data.playerId as string);
    if (!player) return;
    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Final Week to Re-sign',
      body: `No offer made for ${player.alias}. They enter free agency next week if you don't act.`,
      week: state.week,
      read: false,
    });
  });
  return state;
}

export function resolveExpiredRenewals(state: GameState): GameState {
  const unresolved = state.pendingDecisions.filter(d => d.type === 'contract_renewal');
  unresolved.forEach(d => {
    const playerId = d.data.playerId as string;
    const player = state.players.get(playerId);
    if (!player) return;
    state = releasePlayer(state, playerId);
    state.notifications.push({
      id: notifId(),
      type: 'contract_expiring',
      title: 'Entered Free Agency',
      body: `${player.alias} entered free agency after their contract expired without a renewal offer.`,
      week: state.week,
      read: false,
    });
  });
  state.pendingDecisions = state.pendingDecisions.filter(d => d.type !== 'contract_renewal');
  return state;
}

let _renewalSeq = 0;

export function processRenewalOffers(state: GameState): GameState {
  const rng = Math.random;
  const toRemove: string[] = [];
  const pending = state.pendingDecisions.filter(
    d => d.type === 'contract_renewal' && !!d.data.offerPending,
  );

  pending.forEach(d => {
    const playerId = d.data.playerId as string;
    const player = state.players.get(playerId);
    if (!player) { toRemove.push(d.id); return; }

    const offered = d.data.offeredSalary as number;
    const length  = d.data.offeredLength  as number;
    const asking  = d.data.askingSalary   as number;

    const acceptChance = Math.max(0.05, Math.min(0.95,
      0.5 + (offered / asking - 0.9) * 2.5 + (player.morale - 75) / 500,
    ));

    if (rng() < acceptChance) {
      const contractId = `contract_${state.season}_${++_renewalSeq}_${playerId}`;
      state.contracts.set(contractId, {
        id: contractId,
        playerId,
        teamId: state.playerTeamId,
        salary: offered,
        length,
        buyout: Math.round(offered * length * 0.75),
        startSeason: state.season + 1,
        endSeason: (Math.ceil(state.season / 3) + length) * 3,
      });
      state.players.set(playerId, { ...player, contractId });
      state.dirtyPlayers.add(playerId);
      state.notifications.push({
        id: notifId(),
        type: 'contract_expiring',
        title: 'Contract Renewed',
        body: `${player.alias} signed a new ${length}-year deal at $${offered.toLocaleString()}/yr.`,
        week: state.week,
        read: false,
      });
      toRemove.push(d.id);
    } else {
      state.pendingDecisions = state.pendingDecisions.map(pd =>
        pd.id === d.id ? { ...pd, data: { ...pd.data, offerPending: false } } : pd,
      );
      state.notifications.push({
        id: notifId(),
        type: 'contract_expiring',
        title: 'Renewal Rejected',
        body: `${player.alias} rejected your offer of $${offered.toLocaleString()}/yr.`,
        week: state.week,
        read: false,
      });
    }
  });

  state.pendingDecisions = state.pendingDecisions.filter(d => !toRemove.includes(d.id));
  return state;
}

export function submitRenewalOffer(
  state: GameState,
  playerId: string,
  offeredSalary: number,
  offeredLength: number,
): GameState {
  const idx = state.pendingDecisions.findIndex(
    d => d.type === 'contract_renewal' && d.data.playerId === playerId,
  );
  if (idx === -1) return state;
  state.pendingDecisions = state.pendingDecisions.map((d, i) =>
    i === idx
      ? { ...d, data: { ...d.data, offeredSalary, offeredLength, offerPending: true } }
      : d,
  );
  return state;
}
