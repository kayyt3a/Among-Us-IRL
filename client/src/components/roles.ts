import type { SpecialRole } from '@irl-impostor/shared';
import { Scale, ShieldCheck, Star, Wrench, type LucideIcon } from 'lucide-react';

export const ROLE_INFO: Record<SpecialRole, { label: string; Icon: LucideIcon; className: string; color: string }> = {
  judge: { label: 'Judge', Icon: Scale, className: 'role-chip-judge', color: 'var(--judge)' },
  'guardian-angel': { label: 'Guardian Angel', Icon: ShieldCheck, className: 'role-chip-guardian', color: 'var(--guardian)' },
  sheriff: { label: 'Sheriff', Icon: Star, className: 'role-chip-sheriff', color: 'var(--sheriff)' },
  engineer: { label: 'Engineer', Icon: Wrench, className: 'role-chip-engineer', color: 'var(--engineer)' },
};
