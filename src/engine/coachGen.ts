import type { Coach, Team, RegionId } from '../types';
import type { Rng } from './rng';
import { randInt, clamp } from './rng';
import { generateNationalityForRegion, generateName } from './names';

export function generateCoach(id: string, rng: Rng, regionId: RegionId): Coach {
  const pool = generateNationalityForRegion(rng, regionId);
  const { firstName, lastName } = generateName(pool, rng);

  const age = randInt(rng, 35, 65);

  // Each coach specialises in one area; the other two are weaker
  const spec = Math.floor(rng() * 3); // 0=tactics, 1=scouting, 2=moraleBoost
  const base = randInt(rng, 30, 75);
  const primary = clamp(base + randInt(rng, 10, 24), 10, 99);
  const secondary1 = clamp(base - randInt(rng, 5, 20), 10, 99);
  const secondary2 = clamp(base - randInt(rng, 5, 20), 10, 99);

  const [tactics, scouting, moraleBoost] =
    spec === 0 ? [primary, secondary1, secondary2]
    : spec === 1 ? [secondary1, primary, secondary2]
    : [secondary1, secondary2, primary];

  const avgRating = (tactics + scouting + moraleBoost) / 3;
  const salary = Math.round((10_000 + avgRating * 900) / 5_000) * 5_000;

  return {
    id,
    firstName,
    lastName,
    nationality: pool.nationality,
    age,
    salary,
    tactics,
    scouting,
    moraleBoost,
    teamId: null,
    role: null,
    contractEndSeason: null,
  };
}

export function generateCoachPool(count: number, rng: Rng, regionId: RegionId): Coach[] {
  return Array.from({ length: count }, (_, i) => generateCoach(`co_${regionId}_${i}`, rng, regionId));
}

export function effectiveCoachStat(
  team: Team,
  coaches: Map<string, Coach>,
  stat: 'tactics' | 'scouting' | 'moraleBoost'
): number {
  const head = team.headCoachId ? coaches.get(team.headCoachId) : null;
  const asst = team.assistantCoachId ? coaches.get(team.assistantCoachId) : null;
  return (head?.[stat] ?? 0) + (asst?.[stat] ?? 0) * 0.5;
}
