import type {
  GameState, Player, Team, Contract, TransferOffer, TransferStatus,
} from '../types';
import { notifId } from './notifId';

export function computeBuyout(
  player: Player,
  contract: Contract,
  team: Team,
  season: number,
): number {
  const yearsLeft = Math.max(1, contract.endSeason / 3 - Math.ceil(season / 3) + 1);
  const skillMod = 0.75 + (player.aim + player.gameSense) / 200 * 0.75;
  const benchMod = team.subIds.includes(player.id) ? 0.6 : 1.0;
  return Math.round(contract.salary * yearsLeft * skillMod * benchMod / 10_000) * 10_000;
}

function evaluateOffer(
  offer: TransferOffer,
  player: Player,
  state: GameState,
  rng: () => number,
): { status: TransferStatus; counterSalary?: number } {
  if (player.teamId) {
    const sellingTeam = state.teams.get(player.teamId);
    const contract = player.contractId ? state.contracts.get(player.contractId) : undefined;
    if (sellingTeam && contract) {
      const required = computeBuyout(player, contract, sellingTeam, state.season);
      if (offer.fee < required) return { status: 'rejected' };
    }
  }

  const ratio = offer.offeredSalary / Math.max(1, player.salary);
  const salaryScore =
    ratio >= 1.5 ? 70 :
    ratio >= 1.0 ? 35 + (ratio - 1.0) * 70 :
    ratio >= 0.7 ? Math.max(0, (ratio - 0.7) * 117) : 0;

  const buyingTeam = state.teams.get(offer.fromTeamId);
  const currentTeam = player.teamId ? state.teams.get(player.teamId) : null;
  const buyRate = buyingTeam ? buyingTeam.wins / Math.max(1, buyingTeam.wins + buyingTeam.losses) : 0.5;
  const curRate = currentTeam ? currentTeam.wins / Math.max(1, currentTeam.wins + currentTeam.losses) : 0.4;
  const teamScore = Math.max(-10, Math.min(20, (buyRate - curRate) * 40));

  const moraleScore = (75 - player.morale) * 0.3;
  const freeAgentBonus = player.teamId === null ? 35 : 0;
  const benchBonus = currentTeam?.subIds.includes(player.id) ? 10 : 0;

  const prob = Math.max(5, Math.min(95, salaryScore + teamScore + moraleScore + freeAgentBonus + benchBonus));

  if (rng() * 100 < prob) return { status: 'accepted' };

  if (ratio >= 0.8 && ratio < 1.3 && rng() * 100 < 35) {
    const counter = Math.round(Math.max(player.salary * 1.05, offer.offeredSalary * 1.2) / 5_000) * 5_000;
    return { status: 'countered', counterSalary: counter };
  }

  return { status: 'rejected' };
}

function executeTransfer(offer: TransferOffer, player: Player, state: GameState): void {
  const newTeamId = offer.fromTeamId;

  if (player.teamId) {
    const oldTeam = state.teams.get(player.teamId);
    if (oldTeam) {
      state.teams.set(oldTeam.id, {
        ...oldTeam,
        rosterIds: oldTeam.rosterIds.filter(id => id !== player.id),
        subIds: oldTeam.subIds.filter(id => id !== player.id),
      });
    }
  } else {
    state.freeAgents = state.freeAgents.filter(id => id !== player.id);
  }

  const contractId = `tf_${offer.id}`;
  state.contracts.set(contractId, {
    id: contractId,
    playerId: player.id,
    teamId: newTeamId,
    salary: offer.offeredSalary,
    length: offer.contractLength,
    buyout: Math.round(offer.offeredSalary * 2),
    startSeason: state.season,
    endSeason: (Math.ceil(state.season / 3) + offer.contractLength - 1) * 3,
  });

  const newTeam = state.teams.get(newTeamId);
  if (newTeam) {
    state.teams.set(newTeamId, {
      ...newTeam,
      subIds: [...newTeam.subIds.filter(id => id !== player.id), player.id],
    });
  }

  state.players.set(player.id, { ...player, teamId: newTeamId, contractId, salary: offer.offeredSalary });
  state.dirtyPlayers.add(player.id);
}

export function processTransferOffers(state: GameState): GameState {
  const pending = state.transferOffers.filter(o => o.status === 'pending');
  if (pending.length === 0) return state;

  const rng = Math.random;

  for (const offer of pending) {
    const player = state.players.get(offer.playerId);
    if (!player) { offer.status = 'rejected'; continue; }

    const result = evaluateOffer(offer, player, state, rng);
    offer.status = result.status;
    if (result.counterSalary) offer.counterSalary = result.counterSalary;

    if (result.status === 'accepted') executeTransfer(offer, player, state);

    state.notifications.push({
      id: notifId(),
      type: 'transfer_offer',
      title: result.status === 'accepted' ? 'Transfer Accepted!' :
             result.status === 'countered' ? 'Counter Offer Received' : 'Transfer Rejected',
      body: result.status === 'accepted'
        ? `${player.alias} accepted your offer and has joined your squad.`
        : result.status === 'countered'
        ? `${player.alias} will consider an offer of $${result.counterSalary?.toLocaleString()}/yr.`
        : `${player.alias} declined your offer.`,
      week: state.week,
      read: false,
      data: { offerId: offer.id, playerId: player.id },
    });
  }

  return state;
}

export function releasePlayer(state: GameState, playerId: string): GameState {
  const player = state.players.get(playerId);
  if (!player || player.teamId !== state.playerTeamId) return state;

  const team = state.teams.get(state.playerTeamId);
  if (!team) return state;

  state.teams.set(team.id, {
    ...team,
    rosterIds: team.rosterIds.filter(id => id !== playerId),
    subIds: team.subIds.filter(id => id !== playerId),
  });

  state.players.set(playerId, { ...player, teamId: null, contractId: null });
  state.dirtyPlayers.add(playerId);

  if (!state.freeAgents.includes(playerId)) {
    state.freeAgents = [...state.freeAgents, playerId];
  }

  return { ...state };
}

let _offerSeq = 0;

export function makeTransferOffer(
  state: GameState,
  playerId: string,
  offeredSalary: number,
  contractLength: number,
  fee: number,
): GameState {
  const player = state.players.get(playerId);
  if (!player) return state;

  const hasPending = state.transferOffers.some(
    o => o.playerId === playerId && o.fromTeamId === state.playerTeamId && o.status === 'pending',
  );
  if (hasPending) return state;

  const offer: TransferOffer = {
    id: `offer_${state.season}_${state.week}_${++_offerSeq}`,
    playerId,
    fromTeamId: state.playerTeamId,
    toTeamId: player.teamId ?? '',
    fee,
    offeredSalary,
    contractLength,
    status: 'pending',
    deadline: state.week,
  };

  return { ...state, transferOffers: [...state.transferOffers, offer] };
}
