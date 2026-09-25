import { useEffect, useState } from 'react';

function format(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export default function Countdown({
  endsAt,
  urgentBelowMs = 10_000,
}: {
  endsAt: number;
  urgentBelowMs?: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const msLeft = endsAt - now;
  const urgent = msLeft > 0 && msLeft <= urgentBelowMs;

  return <span className={`timer${urgent ? ' timer-urgent' : ''}`}>{format(msLeft)}</span>;
}
