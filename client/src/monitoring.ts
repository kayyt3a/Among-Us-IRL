/**
 * Browser error tracking. The server adds a <meta name="sentry-dsn"> tag only
 * when SENTRY_DSN is configured; without it nothing is loaded at all, so the
 * Sentry SDK never costs players a download.
 */
type Capture = (err: unknown) => void;
let capture: Capture | null = null;
const queued: unknown[] = [];

export function initMonitoring() {
  const dsn = document.querySelector<HTMLMetaElement>('meta[name="sentry-dsn"]')?.content;
  if (!dsn) return;
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({ dsn, environment: window.location.hostname, tracesSampleRate: 0, sendDefaultPii: false });
      capture = (err) => Sentry.captureException(err);
      queued.splice(0).forEach((err) => capture!(err));
    })
    .catch(() => {});
}

/** Reports an error if monitoring is on (queued until the SDK finishes loading). */
export function reportError(err: unknown) {
  if (capture) capture(err);
  else if (document.querySelector('meta[name="sentry-dsn"]')) queued.push(err);
}
