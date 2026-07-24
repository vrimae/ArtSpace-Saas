import React from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  isAllowed: boolean;
  redirectPath?: string;
  loading?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  isAllowed, 
  redirectPath = '/pos',
  loading = false
}) => {
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '300px' }}>
        <p style={{ color: '#fff' }}>Memuat kredensial keamanan...</p>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%', 
        minHeight: '60vh', 
        textAlign: 'center', 
        padding: '2rem' 
      }}>
        <div style={{
          background: 'rgba(30, 30, 35, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '3rem 2rem',
          maxWidth: '480px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.05) 100%)', 
            padding: '1.25rem', 
            borderRadius: '50%', 
            marginBottom: '1.5rem',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.15)'
          }}>
            <ShieldAlert size={56} color="#F87171" strokeWidth={1.5} />
          </div>
          <h2 style={{ 
            color: '#F9FAFB', 
            fontSize: '1.75rem', 
            fontWeight: '700',
            marginBottom: '0.75rem',
            letterSpacing: '-0.025em'
          }}>Akses Terbatas</h2>
          <p style={{ 
            color: '#9CA3AF', 
            fontSize: '0.95rem',
            lineHeight: '1.6',
            marginBottom: '2.5rem' 
          }}>
            Sistem keamanan <strong>Vrimae</strong> mendeteksi percobaan akses ke area sensitif. Halaman ini <span style={{color: '#F87171'}}>({location.pathname})</span> dikunci secara eksklusif dan hanya diizinkan untuk profil <strong>Administrator</strong>.
          </p>
          <button 
            onClick={() => window.location.href = redirectPath}
            style={{ 
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', 
              color: '#fff', 
              padding: '0.85rem 1.75rem', 
              borderRadius: '12px', 
              border: 'none', 
              cursor: 'pointer', 
              fontWeight: '600',
              fontSize: '0.95rem',
              boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 15px 25px -5px rgba(16, 185, 129, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(16, 185, 129, 0.3)';
            }}
          >
            <ArrowLeft size={18} />
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
