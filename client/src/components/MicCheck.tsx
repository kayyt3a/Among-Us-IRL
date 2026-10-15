import { useEffect, useState } from 'react';
import { Check, Mic, MicOff } from 'lucide-react';
import { requestMicPermission } from '../audio/proximity';

type MicState = 'unknown' | 'granted' | 'denied' | 'asking';

/**
 * Asks for the microphone in the lobby, with the reason spelled out, instead
 * of letting the browser pop its permission box the moment the game starts
 * (when people tend to tap "Don't allow" on reflex). If it's already allowed
 * this collapses to a one-line "ready".
 */
export default function MicCheck() {
  const [state, setState] = useState<MicState>('unknown');

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const sync = () => {
      if (status?.state === 'granted') setState('granted');
      else if (status?.state === 'denied') setState('denied');
    };
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        sync();
        s.addEventListener('change', sync);
      })
      .catch(() => {
        // Not every browser can be asked about the mic up front. The button still works.
      });
    return () => status?.removeEventListener('change', sync);
  }, []);

  async function ask() {
    setState('asking');
    setState((await requestMicPermission()) ? 'granted' : 'denied');
  }

  if (state === 'granted') {
    return (
      <div className="mic-ready" role="status">
        <Check size={15} strokeWidth={3} />
        Microphone ready for the kill check
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="card card-amber mic-card">
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <div className="icon-circle amber">
            <MicOff size={20} />
          </div>
          <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
            <h3 className="h3">Microphone is blocked</h3>
            <p className="muted small">
              You can still play. Eliminations on you will use the honour system instead of the sound check. To turn it
              on, allow the microphone for this site in your browser settings, then reload.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-cyan mic-card">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="icon-circle cyan">
          <Mic size={20} />
        </div>
        <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
          <h3 className="h3">Allow your microphone</h3>
          <p className="muted small">
            When the impostor eliminates you, your phone listens for a quiet tone from theirs to prove they're really next
            to you. Nothing is recorded or sent anywhere.
          </p>
        </div>
      </div>
      <button className="btn btn-secondary btn-block" onClick={ask} disabled={state === 'asking'}>
        <Mic size={17} />
        {state === 'asking' ? 'Waiting for your answer…' : 'Allow microphone'}
      </button>
    </div>
  );
}
