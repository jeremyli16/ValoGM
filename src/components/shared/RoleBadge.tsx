import type { PlayerRole } from '../../types';

interface Props { role: PlayerRole; }

export function RoleBadge({ role }: Props) {
  return <span className={`role-badge ${role}`}>{role.slice(0, 3).toUpperCase()}</span>;
}
