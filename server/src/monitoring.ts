import * as Sentry from '@sentry/node';

/**
 * Error tracking with Sentry, on only when SENTRY_DSN is set. Without it,
 * errors are just logged as before. Only errors are sent: no performance
 * tracing and no personal data (players' names and photos never leave).
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  });
  console.log('[monitoring] Sentry error tracking on.');
}

/** Logs an error and, when Sentry is configured, reports it. */
export function reportError(message: string, err: unknown, context?: Record<string, unknown>) {
  console.error(message, err);
  if (dsn) Sentry.captureException(err, { extra: { message, ...context } });
}

/** The DSN the browser should use too (Sentry DSNs are safe to expose). */
export const clientSentryDsn = dsn ?? null;
