import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Що показати замість дітей, якщо вони впали під час рендеру. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error) => void;
  children: ReactNode;
}

/** Ловить помилки рендеру, щоб одна зламана частина не гасила всю сторінку. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render failed', error, info.componentStack);
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
