'use client';

import { useState } from 'react';

/** Re-send the Mailgun confirmation for an existing order. */
export function ResendEmail({ reference }: { reference: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [detail, setDetail] = useState('');

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={state === 'sending' || state === 'done'}
        onClick={async () => {
          setState('sending');
          try {
            const res = await fetch(`/api/orders/${encodeURIComponent(reference)}/email`, {
              method: 'POST',
            });
            const payload = await res.json();
            setDetail(payload.detail ?? '');
            setState(res.ok ? 'done' : 'error');
          } catch (error) {
            setDetail((error as Error).message);
            setState('error');
          }
        }}
      >
        {state === 'sending' ? 'Sending…' : state === 'done' ? 'Confirmation sent' : 'Resend confirmation email'}
      </button>
      <p
        className="small muted"
        role="status"
        aria-live="polite"
        style={{ marginTop: 8, minHeight: 18 }}
      >
        {detail}
      </p>
    </div>
  );
}
