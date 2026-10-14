import { Component, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { reportError } from '../monitoring';
import Logo from './ui/Logo';

/**
 * If a screen crashes, show a way back instead of a blank page. Reloading
 * rejoins the same game, since the session is kept in local storage.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 20, textAlign: 'center' }}>
        <Logo size={64} />
        <div className="stack-sm">
          <h1 className="h1">Something went wrong</h1>
          <p className="muted">Reload to jump back into your game. You won't lose your spot.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
          <RotateCcw size={18} />
          Reload
        </button>
      </div>
    );
  }
}
