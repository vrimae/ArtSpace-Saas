import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, PackageOpen, ShoppingCart, LogOut, Settings, Menu, Activity, Lock, Unlock, Bot, ShieldCheck } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Finance from './components/Finance';
import Inventory from './components/Inventory';
import POS from './components/POS';
import SettingsPage from './components/Settings';
import Login from './components/Login';
import AnalyticsPro from './components/AnalyticsPro';
import AiAssistant from './components/AiAssistant';
import ActivityLog from './components/ActivityLog';
import SuperAdmin from './components/SuperAdmin';
import { ToastProvider, useToast } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { supabase } from './lib/supabase';
import { initStorage } from './utils/storage';

initStorage();

export const AuthContext = createContext<{ isAdmin: boolean, setIsAdmin: (val: boolean) => void, adminPin: string | null, setAdminPin: (pin: string | null) => void }>({ isAdmin: true, setIsAdmin: () => {}, adminPin: null, setAdminPin: () => {} });

// ── Sidebar Drawer ──────────────────────────────────────────────────────────
const Sidebar = ({
  open,
  onClose,
  onLogout,
  userEmail,
  shopName,
  userAvatar,
  userMetadata = {},
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  userEmail: string;
  shopName: string;
  userAvatar?: string;
  userMetadata?: any;
}) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const { isAdmin, setIsAdmin, adminPin } = useContext(AuthContext);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const { showToast } = useToast();

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput === adminPin) {
      setIsAdmin(true);
      setShowPinPrompt(false);
      setPinInput('');
      setPinError(false);
      showToast('success', 'Berhasil', 'Berhasil masuk ke Mode Admin');
    } else {
      setPinError(true);
      setPinInput('');
      showToast('error', 'PIN Salah', 'PIN yang Anda masukkan tidak sesuai');
      // Remove error state after animation
      setTimeout(() => setPinError(false), 500);
    }
  };

  // Sinkronkan dark mode dengan sistem
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    };

    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    
    if (savedTheme) {
      applyTheme(savedTheme === 'dark');
    } else {
      applyTheme(systemPrefersDark.matches);
    }

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) {
        applyTheme(e.matches);
      }
    };

    systemPrefersDark.addEventListener('change', handleSystemThemeChange);
    return () => systemPrefersDark.removeEventListener('change', handleSystemThemeChange);
  }, []);

  // Tutup sidebar saat navigasi
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const navItems = [
    { to: '/pos',       icon: <ShoppingCart size={18} />,    label: 'Kasir'     },
    { to: '/activity',  icon: <Activity size={18} />, label: 'Riwayat Aktivitas' },
  ];

  const adminNavItems = [
    { to: '/',          icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/finance',   icon: <Wallet size={18} />,          label: 'Keuangan'  },
    { to: '/inventory', icon: <PackageOpen size={18} />,     label: 'Inventori' },
    { to: '/analytics-pro', icon: <LayoutDashboard size={18} style={{color: '#F59E0B'}} />, label: 'Analitik Pro' },
    { to: '/ai-assistant', icon: <Bot size={18} style={{color: '#10b981'}} />, label: 'Vrimae AI' },
    { to: '/settings',  icon: <Settings size={18} />,        label: 'Setelan'   },
  ];

  const now = new Date().getTime();
  const hasAnalyticsAccess = userMetadata.analytics_ends_at 
    ? new Date(userMetadata.analytics_ends_at).getTime() > now 
    : false;
  const hasAIAccess = userMetadata.ai_ends_at 
    ? new Date(userMetadata.ai_ends_at).getTime() > now 
    : false;
  const isSuperAdmin = userEmail === 'bimdarmawa2@gmail.com';

  const finalNav = isAdmin 
    ? [
        adminNavItems[0], // Dashboard
        navItems[0],      // Kasir
        adminNavItems[1], // Keuangan
        adminNavItems[2], // Inventori
        navItems[1],      // Riwayat Aktivitas
        { ...adminNavItems[3], locked: (!hasAnalyticsAccess && !isSuperAdmin) }, // Analitik Pro
        { ...adminNavItems[4], locked: (!hasAIAccess && !isSuperAdmin) }, // Vrimae AI
        adminNavItems[5], // Setelan
        ...(isSuperAdmin ? [{ to: '/superadmin', icon: <ShieldCheck size={18} />, label: 'Super Admin' }] : [])
      ]
    : navItems;

  return (
    <>
      {/* Overlay gelap di belakang sidebar */}
      <div
        onClick={onClose}
        className={`sidebar-overlay ${open ? 'open' : ''}`}
      />

      {/* Sidebar Drawer */}
      <div
        ref={sidebarRef}
        className={`sidebar ${open ? 'open' : ''}`}
      >
        {/* Header sidebar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="sidebar-logo" style={{ margin: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <img src="/logo.svg" alt="Vrimae Logo" className="theme-adaptive-logo" style={{ height: '28px', width: 'auto' }} />
            <span>Vrimae</span>
          </div>
        </div>

        {/* Shop Name Display (Moved to top) */}
        <div style={{ 
          padding: '1rem 0.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          color: 'var(--color-text)',
          borderBottom: '1px solid var(--color-border-light)',
          marginBottom: '0.5rem'
        }}>
          {userAvatar ? (
            <img src={userAvatar} alt="Profile" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
              {shopName ? shopName.charAt(0).toUpperCase() : 'T'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.2, marginBottom: '2px' }}>
              {shopName || 'Nama Toko Belum Diatur'}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.2 }}>
              {userEmail || 'Pengguna'}
            </span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '1rem', overflowY: 'auto', paddingRight: '4px' }}>
          {finalNav.map((item: any) => (
            <Link
              key={item.to}
              to={item.locked ? '#' : item.to}
              onClick={(e) => {
                if (item.locked) {
                  e.preventDefault();
                  showToast('error', 'Fitur Terkunci', `Paket Anda tidak memiliki akses ke ${item.label}. Silakan hubungi Super Admin untuk melakukan Upgrade.`);
                }
              }}
              className={`nav-item ${isActive(item.to) && !item.locked ? 'active' : ''}`}
              style={{ opacity: item.locked ? 0.6 : 1, filter: item.locked ? 'grayscale(100%)' : 'none' }}
            >
              {item.icon}
              <span className="nav-text" style={{ flex: 1 }}>{item.label}</span>
              {item.locked && <Lock size={15} style={{ color: 'var(--color-text-secondary)', marginLeft: 'auto' }} />}
            </Link>
          ))}
        </nav>

        {/* Toggle Admin/Kasir Mode */}
        {adminPin && (
          <div style={{ padding: '0.75rem 0.5rem 0', borderTop: '1px solid var(--color-border-light)', marginTop: '0.75rem' }}>
            <button
              onClick={() => {
                if (isAdmin) setIsAdmin(false);
                else setShowPinPrompt(true);
              }}
              className="nav-item"
              style={{ background: isAdmin ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: 'none', cursor: 'pointer', color: isAdmin ? 'var(--color-expense)' : 'var(--color-income)', width: '100%', borderRadius: '10px', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.2, alignItems: 'center' }}
            >
              <div style={{ flexShrink: 0 }}>
                {isAdmin ? <Lock size={18} /> : <Unlock size={18} />}
              </div>
              <span className="nav-text" style={{ fontWeight: 700, fontSize: '0.85rem' }}>{isAdmin ? 'Kunci ke Mode Kasir' : 'Buka Akses Admin'}</span>
            </button>
          </div>
        )}

        {/* Bottom: Keluar */}
        <div style={{
          borderTop: '1px solid var(--color-border-light)',
          paddingTop: '0.75rem', marginTop: '0.75rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="nav-item"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-expense)', width: '100%' }}
          >
            <LogOut size={18} />
            <span className="nav-text">Keluar</span>
          </button>
        </div>
      </div>

      {/* ── Modal PIN Admin ── */}
      {showPinPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '320px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', border: '1px solid var(--color-border-light)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <Unlock size={24} style={{ color: 'var(--color-income)' }} />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--color-text)' }}>Masukkan PIN Admin</h2>
            <form onSubmit={handlePinSubmit}>
              <div style={{ position: 'relative', marginBottom: '2rem', display: 'flex', gap: '0.4rem', justifyContent: 'center', animation: pinError ? 'shake 0.4s ease-in-out' : 'none' }}>
                <input 
                  type="tel"
                  maxLength={6}
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0,6)); setPinError(false); }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', zIndex: 10, cursor: 'text', background: 'transparent', color: 'transparent', border: 'none' }}
                  autoFocus
                />
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ 
                    flex: 1, maxWidth: '3rem', height: '3.5rem', 
                    borderRadius: '10px',
                    border: `2px solid ${pinError ? 'var(--color-expense)' : (pinInput.length === i ? 'var(--color-primary)' : (pinInput.length > i ? 'var(--color-primary)' : 'var(--color-border)'))}`,
                    background: pinError ? 'var(--color-expense-bg)' : 'var(--color-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem', color: pinError ? 'var(--color-expense)' : 'var(--color-primary)',
                    transition: 'all 0.2s ease',
                    boxShadow: pinInput.length === i && !pinError ? '0 0 0 4px rgba(16,185,129,0.1)' : 'none'
                  }}>
                    {pinInput[i] ? '•' : ''}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" onClick={() => { setShowPinPrompt(false); setPinInput(''); setPinError(false); }} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '2px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>Batal</button>
                <button type="submit" style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>Buka</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Logout ── */}
      {showLogoutConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '360px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', border: '1px solid var(--color-border-light)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <LogOut size={24} style={{ color: 'var(--color-expense)' }} />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--color-text)' }}>Keluar dari Akun?</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              Anda akan keluar dari sesi ini. Pastikan semua data sudah tersimpan.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, padding: '0.7rem', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Batal</button>
              <button onClick={() => { setShowLogoutConfirm(false); onLogout(); }} style={{ flex: 1, padding: '0.7rem', borderRadius: '10px', border: 'none', background: 'var(--color-expense)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: 'none' }}>Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ── Mobile Bottom Nav ───────────────────────────────────────────────────────
const MobileBottomNav = () => {
  const location = useLocation();
  const { isAdmin } = useContext(AuthContext);

  if (!isAdmin) return null;

  return (
    <>
      <nav className="mobile-bottom-nav">
        {isAdmin && (
          <Link to="/" className={`mobile-bottom-nav-item ${location.pathname === '/' ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
        )}
        <Link to="/pos" className={`mobile-bottom-nav-item ${location.pathname === '/pos' ? 'active' : ''}`}>
          <ShoppingCart size={20} />
          <span>Kasir</span>
        </Link>
        {isAdmin && (
          <Link to="/inventory" className={`mobile-bottom-nav-item ${location.pathname === '/inventory' ? 'active' : ''}`}>
            <PackageOpen size={20} />
            <span>Inventori</span>
          </Link>
        )}
        {isAdmin && (
          <Link to="/finance" className={`mobile-bottom-nav-item ${location.pathname === '/finance' ? 'active' : ''}`}>
            <Wallet size={20} />
            <span>Keuangan</span>
          </Link>
        )}
      </nav>
    </>
  );
};

const AuthListener = () => {
  const { showToast } = useToast();
  useEffect(() => {
    const handleAuthError = () => {
      showToast('error', 'Akses Ditolak', 'Maaf akun anda telah expired.');
    };
    window.addEventListener('auth_expired_error', handleAuthError);
    return () => window.removeEventListener('auth_expired_error', handleAuthError);
  }, [showToast]);
  return null;
};

// ── App ─────────────────────────────────────────────────────────────────────
const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  const [isAdmin, setIsAdmin] = useState(true);
  const [adminPin, setAdminPin] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.user_metadata?.admin_pin) {
        setAdminPin(session.user.user_metadata.admin_pin);
        setIsAdmin(false); // Default to Kasir mode if PIN is set
      } else {
        setAdminPin(null);
        setIsAdmin(true);
      }

      setTimeout(() => setLoading(false), 1500);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user?.user_metadata?.admin_pin) {
        setAdminPin(session.user.user_metadata.admin_pin);
        if (event === 'SIGNED_IN') setIsAdmin(false);
      } else {
        setAdminPin(null);
        setIsAdmin(true);
      }
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => { 
    setAdminPin(null);
    setIsAdmin(true);
    await supabase.auth.signOut(); 
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', position: 'relative', overflow: 'hidden' }}>
        <style>
          {`
            /* Smooth cinematic entrance for Logo */
            @keyframes spring-in {
              0% { transform: scale(0.85) translateY(30px); opacity: 0; filter: blur(10px); }
              60% { filter: blur(0px); }
              100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
            }
            /* Gentle float after entrance */
            @keyframes float-logo-pro {
              0%, 100% { transform: translateY(0) scale(1); }
              50% { transform: translateY(-12px) scale(1.02); }
            }
            /* Ripple effect for the glow */
            @keyframes ripple-pulse {
              0% { transform: scale(0.5); opacity: 0.8; box-shadow: 0 0 0 0 rgba(65, 118, 252, 0.4); }
              70% { transform: scale(1.8); opacity: 0; box-shadow: 0 0 0 40px rgba(65, 118, 252, 0); }
              100% { transform: scale(2.2); opacity: 0; }
            }
            /* Shimmering gradient text */
            @keyframes shimmer-text {
              0% { background-position: -200% center; }
              100% { background-position: 200% center; }
            }
            /* Smooth reveal for text */
            @keyframes text-reveal {
              0% { transform: translateY(15px); opacity: 0; filter: blur(4px); }
              100% { transform: translateY(0); opacity: 1; filter: blur(0); }
            }
            /* Sleek progress line */
            @keyframes progress-slide {
              0% { transform: translateX(-100%); opacity: 0; }
              50% { opacity: 1; }
              100% { transform: translateX(100%); opacity: 0; }
            }

            .splash-container {
              position: relative;
              display: flex;
              flex-direction: column;
              align-items: center;
              z-index: 10;
            }

            .logo-wrapper {
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 0.5rem;
              animation: spring-in 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            }

            /* The continuous floating animation applied after spring-in */
            .logo-floater {
              animation: float-logo-pro 5s ease-in-out infinite;
              animation-delay: 1.4s; /* start after spring */
            }

            .ripple-circle {
              position: absolute;
              width: 120px;
              height: 120px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(65,118,252,0.3) 0%, rgba(65,118,252,0) 70%);
              animation: ripple-pulse 2.5s cubic-bezier(0.1, 0.7, 0.1, 1) infinite;
              z-index: 0;
            }

            .ripple-circle-2 {
              animation-delay: 1.25s;
            }

            .splash-logo-img {
              position: relative;
              z-index: 2;
              height: 120px;
              filter: drop-shadow(0 20px 30px rgba(0,0,0,0.15));
            }
            [data-theme='dark'] .splash-logo-img {
              filter: drop-shadow(0 20px 30px rgba(255,255,255,0.1));
            }

            .splash-title {
              font-size: 3.2rem;
              font-weight: 800;
              letter-spacing: -0.05em;
              margin-top: 0.5rem;
              margin-bottom: 0.25rem;
              background: linear-gradient(
                90deg, 
                var(--color-text) 0%, 
                var(--color-primary) 50%, 
                var(--color-text) 100%
              );
              background-size: 200% auto;
              color: transparent;
              -webkit-background-clip: text;
              background-clip: text;
              
              animation: 
                text-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.3s,
                shimmer-text 3s linear infinite;
              opacity: 0;
            }

            [data-theme='dark'] .splash-title {
              background: linear-gradient(
                90deg, 
                var(--color-text) 0%, 
                var(--color-primary) 50%, 
                var(--color-text) 100%
              );
              background-size: 200% auto;
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }

            .splash-subtitle {
              font-size: 0.9rem;
              color: #9CA3AF;
              font-weight: 600;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              opacity: 0;
              animation: text-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.5s;
              margin-bottom: 2.5rem;
            }

            .progress-track {
              width: 200px;
              height: 3px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 4px;
              overflow: hidden;
              opacity: 0;
              animation: text-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.7s;
              position: relative;
            }

            .progress-bar {
              position: absolute;
              top: 0;
              left: 0;
              width: 50%;
              height: 100%;
              background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
              border-radius: 4px;
              animation: progress-slide 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            }
            [data-theme='dark'] .progress-bar {
              background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
            }
            
            /* Ambient background glow */
            .ambient-bg {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 80vw;
              height: 80vw;
              max-width: 600px;
              max-height: 600px;
              background: radial-gradient(circle, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0) 60%);
              z-index: 0;
              pointer-events: none;
            }
            [data-theme='dark'] .ambient-bg {
              background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 60%);
            }
          `}
        </style>
        
        <div className="ambient-bg"></div>

        <div className="splash-container">
          <div className="logo-wrapper">
            <div className="ripple-circle"></div>
            <div className="ripple-circle ripple-circle-2"></div>
            <div className="logo-floater">
              <img src="/logo.svg" alt="Vrimae Logo" className="splash-logo-img theme-adaptive-logo" />
            </div>
          </div>
          
          <h1 className="splash-title">Vrimae</h1>
          <div className="splash-subtitle">Mempersiapkan Ruang Kerja</div>
          
          <div className="progress-track">
            <div className="progress-bar"></div>
          </div>
        </div>
      </div>
    );
  }

  if (recoveryMode || !session) return <ToastProvider><Login initialViewMode={recoveryMode ? 'reset_password' : 'login'} /></ToastProvider>;

  return (
    <ToastProvider>
      <AuthContext.Provider value={{ isAdmin, setIsAdmin, adminPin, setAdminPin }}>
      <AuthListener />
      <Router>
        <div className={`app-container ${!isAdmin ? 'kasir-mode' : ''}`}>
        {/* ── Top Navbar ── */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '1.1rem' }}>
            <img src="/logo.svg" alt="Vrimae Logo" className="theme-adaptive-logo" style={{ height: '22px', width: 'auto' }} />
            <span style={{ color: 'var(--color-text)' }}>Vrimae</span>
          </div>

          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: 38, height: 38, flexShrink: 0,
              background: 'var(--color-surface-alt)',
              border: '1.5px solid var(--color-border-light)',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-lighter)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-alt)')}
            title="Buka Menu"
          >
            <Menu size={18} />
          </button>
        </header>

        {/* Sidebar Drawer */}
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
          userEmail={session?.user?.email || ''}
          shopName={session?.user?.user_metadata?.shop_name || ''}
          userAvatar={session?.user?.user_metadata?.avatar_url || ''}
          userMetadata={session?.user?.user_metadata || {}}
        />

        {/* Main Content — dibawah navbar */}
        <main className={`main-content ${location.pathname === '/pos' ? 'pos-mode' : ''}`}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }} className="main-inner">
            <Routes>
              <Route path="/pos" element={<POS />} />
              <Route path="/activity" element={<ActivityLog />} />
              {/* Admin Routes with Middleware Protection */}
              <Route path="/" element={
                isAdmin ? <Dashboard /> : <Navigate to="/pos" replace />
              } />
              <Route path="/finance" element={
                <ProtectedRoute isAllowed={isAdmin} loading={loading}>
                  <Finance />
                </ProtectedRoute>
              } />
              <Route path="/inventory" element={
                <ProtectedRoute isAllowed={isAdmin} loading={loading}>
                  <Inventory />
                </ProtectedRoute>
              } />
              <Route path="/analytics-pro" element={
                <ProtectedRoute isAllowed={isAdmin} loading={loading}>
                  <AnalyticsPro />
                </ProtectedRoute>
              } />
              <Route path="/ai-assistant" element={
                <ProtectedRoute isAllowed={isAdmin} loading={loading}>
                  <AiAssistant />
                </ProtectedRoute>
              } />
              <Route path="/superadmin" element={
                <ProtectedRoute isAllowed={isAdmin && session?.user?.email === 'bimdarmawa2@gmail.com'} loading={loading}>
                  <SuperAdmin />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute isAllowed={isAdmin} loading={loading}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
            </Routes>
          </div>
        </main>

        {/* ── Mobile Bottom Navbar ── */}
        <MobileBottomNav />
        </div>
      </Router>
      </AuthContext.Provider>
    </ToastProvider>
  );
};

export default App;
