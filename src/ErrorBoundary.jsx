import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ maxWidth: '480px' }}>
          <h1>333 The Collection</h1>
          <p>Something went wrong loading the app.</p>
          <div className="error" style={{ textAlign: 'left', wordBreak: 'break-all' }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            Try refreshing. If it persists, use another browser or device.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
