import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { clearSystemCacheSafely } from '../utils/systemCache';
import { invalidateAllDataCaches } from '../utils/storage';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  clearing: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    clearing: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, clearing: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleCleanReload = async () => {
    this.setState({ clearing: true });
    try {
      await clearSystemCacheSafely(invalidateAllDataCaches);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            width: '100%',
            padding: '24px',
            textAlign: 'center',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
            boxSizing: 'border-box',
          }}
        >
          <AlertTriangle size={60} style={{ color: '#ef4444', marginBottom: '18px' }} />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px', color: 'var(--color-text)' }}>
            Halaman Perlu Disegarkan
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '26px', maxWidth: '420px', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Terjadi kendala pemuatan sementara (biasanya karena koneksi jaringan atau pembaruan versi sistem). Data transaksi & akun Anda tetap aman.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleCleanReload}
              disabled={this.state.clearing}
              style={{
                padding: '12px 24px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.95rem',
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              }}
            >
              <RefreshCw size={18} />
              {this.state.clearing ? 'Membersihkan Cache...' : 'Bersihkan Cache & Muat Ulang'}
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                marginTop: '32px',
                padding: '15px',
                background: '#1e293b',
                color: '#f87171',
                borderRadius: '8px',
                maxWidth: '90%',
                overflowX: 'auto',
                textAlign: 'left',
                fontSize: '0.8rem',
              }}
            >
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
