import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

export default function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${window.location.origin}/?code=${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked (insecure origin or permission), nothing useful to do
    }
  }

  async function invite() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'IRL Impostor', text: `Join my IRL Impostor game. Room code ${code}.`, url: inviteUrl });
      } catch {
        // share sheet dismissed
      }
      return;
    }
    copy();
  }

  return (
    <div className="card stack center" style={{ gap: 14, paddingTop: 18 }}>
      <span className="label">Room code</span>
      <div className="code-tiles room-code" data-code={code} aria-label={`Room code ${code.split('').join(' ')}`}>
        {code.split('').map((ch, i) => (
          <span key={i} className="code-tile">
            {ch}
          </span>
        ))}
      </div>
      <p className="muted small">Friends open this site and enter the code, or tap your invite link.</p>
      <div className="grid-2">
        <button className="btn btn-sm btn-secondary" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button className="btn btn-sm btn-secondary" onClick={invite}>
          <Share2 size={16} />
          Invite
        </button>
      </div>
    </div>
  );
}
