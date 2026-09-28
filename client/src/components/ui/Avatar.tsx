function hueFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = (w: string) => Array.from(w)[0] ?? '';
  return (words.length === 1 ? first(words[0]) : first(words[0]) + first(words[1])).toUpperCase();
}

/**
 * Initials on a muted, name-derived colour. Deliberately low-saturation so
 * no avatar ever reads as the red (impostor) or cyan (crew) role colours.
 */
export default function Avatar({
  name,
  size = 'md',
  dead = false,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  dead?: boolean;
}) {
  const hue = hueFor(name);
  const sizeClass = size === 'md' ? '' : ` avatar-${size}`;
  return (
    <span
      className={`avatar${sizeClass}${dead ? ' avatar-dead' : ''}`}
      style={{
        background: `hsl(${hue} 30% 22%)`,
        color: `hsl(${hue} 70% 84%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 35% 34%)`,
      }}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
