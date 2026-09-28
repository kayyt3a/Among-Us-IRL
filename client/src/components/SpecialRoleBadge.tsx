import type { SpecialRole } from '@irl-impostor/shared';
import { ROLE_INFO } from './roles';

export default function SpecialRoleBadge({ role }: { role: SpecialRole }) {
  const { label, Icon, className } = ROLE_INFO[role];
  return (
    <span className={`role-chip ${className}`}>
      <Icon size={15} strokeWidth={2.4} />
      {label}
    </span>
  );
}
