import type { SpecialRole } from '@irl-impostor/shared';
import { Scale, ShieldCheck, Star, Wrench, type LucideIcon } from 'lucide-react';

export const ROLE_INFO: Record<SpecialRole, {
  label: string;
  Icon: LucideIcon;
  className: string;
  color: string;
  /** One-line rules summary, shown in the lobby and the How to play guide. */
  summary: string;
}> = {
  judge: {
    label: 'Judge',
    Icon: Scale,
    className: 'role-chip-judge',
    color: 'var(--judge)',
    summary: 'Can force-eject one player in a vote. Guess wrong and the Judge goes instead.',
  },
  'guardian-angel': {
    label: 'Guardian Angel',
    Icon: ShieldCheck,
    className: 'role-chip-guardian',
    color: 'var(--guardian)',
    summary: 'After dying, can shield one living player from the next kill.',
  },
  sheriff: {
    label: 'Sheriff',
    Icon: Star,
    className: 'role-chip-sheriff',
    color: 'var(--sheriff)',
    summary: 'Can shoot one suspect. An innocent guess takes out the Sheriff instead.',
  },
  engineer: {
    label: 'Engineer',
    Icon: Wrench,
    className: 'role-chip-engineer',
    color: 'var(--engineer)',
    summary: 'Can trigger one decoy blackout to throw suspicion around.',
  },
};
