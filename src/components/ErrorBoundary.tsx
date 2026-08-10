import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', padding: '20px', textAlign: 'center',
          backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)'
        }}>
          <AlertTriangle size={64} style={{ color: '#ef4444', marginBottom: '20px' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>Oops! Sesuatu berjalan salah.</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', maxWidth: '400px' }}>
            Aplikasi mengalami kesalahan sistem (Mungkin karena jaringan atau pembaruan). Silakan muat ulang halaman ini.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px', backgroundColor: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem',
              fontWeight: 600, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            <RefreshCw size={20} />
            Muat Ulang Halaman
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{
              marginTop: '40px', padding: '15px', background: '#1e293b', color: '#f87171',
              borderRadius: '8px', maxWidth: '80%', overflowX: 'auto', textAlign: 'left', fontSize: '0.8rem'
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
