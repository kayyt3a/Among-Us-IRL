import type { SpecialRole } from '@irl-impostor/shared';

const ROLE_INFO: Record<SpecialRole, { label: string; emoji: string; className: string }> = {
  judge: { label: 'Judge', emoji: '⚖️', className: 'role-chip-judge' },
  'guardian-angel': { label: 'Guardian Angel', emoji: '👼', className: 'role-chip-guardian' },
  sheriff: { label: 'Sheriff', emoji: '⭐', className: 'role-chip-sheriff' },
  engineer: { label: 'Engineer', emoji: '🔧', className: 'role-chip-engineer' },
};

export default function SpecialRoleBadge({ role }: { role: SpecialRole }) {
  const info = ROLE_INFO[role];
  return (
    <span className={`role-chip ${info.className}`}>
      {info.emoji} {info.label}
    </span>
  );
}
