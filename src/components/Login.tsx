import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useToast } from './Toast';

type ViewMode = 'login' | 'register' | 'forgot_password' | 'reset_password';

export default function Login({ initialViewMode = 'login' }: { initialViewMode?: ViewMode }) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (viewMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (viewMode === 'register') {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {}
          }
        });
        if (error) throw error;
        showToast('success', 'Pendaftaran Berhasil!', 'Silakan login dengan akun baru Anda.');
        setViewMode('login');
        setLoading(false);
        return;
      } else if (viewMode === 'forgot_password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        showToast('success', 'Email Terkirim', 'Silakan cek kotak masuk email Anda untuk tautan pemulihan.');
        setViewMode('login');
        setLoading(false);
        return;
      } else if (viewMode === 'reset_password') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        showToast('success', 'Password Diperbarui', 'Kata sandi Anda berhasil diubah. Mengalihkan...');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
        return;
      }
    } catch (error: any) {
      let errMsg = error.message || 'Gagal melakukan operasi.';
      if (errMsg === 'Invalid login credentials') {
        errMsg = 'Email atau password salah';
      } else if (errMsg.toLowerCase().includes('banned')) {
        errMsg = 'Maaf akun anda telah expired';
      }
      showToast('error', 'Akses Ditolak', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const renderTitle = () => {
    if (viewMode === 'login') return 'Selamat Datang Kembali!';
    if (viewMode === 'register') return 'Buat Akun Baru';
    if (viewMode === 'forgot_password') return 'Lupa Password';
    if (viewMode === 'reset_password') return 'Buat Password Baru';
  };

  const renderSubmitText = () => {
    if (loading) return 'Memproses...';
    if (viewMode === 'login') return 'Masuk';
    if (viewMode === 'register') return 'Daftar';
    if (viewMode === 'forgot_password') return 'Kirim Tautan Reset';
    if (viewMode === 'reset_password') return 'Simpan Password Baru';
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <svg width="64" height="55" viewBox="0 0 871 750" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="gradient_0" gradientUnits="userSpaceOnUse" x1="93.953003" y1="383.88864" x2="825.92352" y2="306.944">
                  <stop offset="0" stopColor="#EC4899"/>
                  <stop offset="0.7" stopColor="#A855F7"/>
                  <stop offset="1" stopColor="#3B82F6"/>
                </linearGradient>
              </defs>
              <path fill="url(#gradient_0)" d="M311.985 465.731C310.063 462.37 306.856 457.842 304.684 454.413C299.404 445.894 294.064 437.413 288.663 428.971L240.353 352.624L64.5128 76.4058C62.685 73.5154 59.4695 69.3078 60.1681 66.2114C63.5274 64.1381 72.6656 65.5955 76.7296 65.624C99.0782 65.7765 123.98 67.8642 145.728 66.6974C148.531 66.547 189.381 133.043 193.059 138.834L289.866 291.475C294.642 298.977 299.366 306.512 304.037 314.08C306.062 317.385 310.328 326.118 313.667 327.039C314.191 326.743 334.339 292.402 336.299 289.144L420.82 147.323L450.915 96.8141C456.267 87.9037 464.486 75.1354 469.039 66.1806L469.774 66.15C486.24 65.5006 505.513 66.0142 522.285 66.0187L620.539 66.0307L736.63 66.0215C756.2 66.0207 775.84 65.9584 795.41 66.0499C797.854 66.0613 800.3 65.9055 801.991 67.4779C801.508 72.5855 785.767 96.8444 782.023 102.878L755.259 146.639L714.526 213.436C708.333 223.532 700.005 239.864 691.914 247.802C677.987 261.561 661.211 272.096 642.771 278.664C638.03 280.354 633.33 281.311 628.501 283.013C634.891 293.708 640.447 301.945 640.514 315.066C640.601 331.994 633.346 342.283 625.013 356.078L607.144 385.524L542.485 491.944L476.761 600.311C467.551 615.777 458.188 631.151 448.672 646.431C443.545 654.799 438.57 663.655 433.072 671.678C427.08 665.485 418.268 650.844 413.629 643.465C405.706 631.08 397.859 618.646 390.089 606.165L349.152 541.825C341.223 529.361 334.546 519.371 326.844 506.446C331.585 496.767 339.46 485.72 345.759 476.939C355.548 463.292 365.225 447.284 375.905 434.491C380.718 439.465 384.207 445.656 387.898 451.534C392.2 458.343 396.443 465.189 400.624 472.073C407.152 482.786 414.166 493.461 420.83 504.126C423.09 507.743 430.134 519.316 432.533 522.036C433.462 521.982 434.832 521.758 435.32 520.99C438.57 515.872 442.99 508.366 446.056 503.281L491.288 427.801C500.274 412.658 509.359 397.574 518.543 382.551C527.379 368.23 547.721 338.665 547.84 323.593C548.156 283.869 481.072 294.691 459.522 293.815C461.402 288.119 468.778 276.568 472.025 271.255C482.59 254.014 493.559 237.024 504.923 220.298C510.518 219.693 521.88 220 527.869 220.005L570.515 220.041C582.38 220.05 595.349 220.854 606.345 216.766C625.853 209.514 642.243 192.783 649.705 173.455C650.523 171.336 652.542 168.156 653.308 166.399C654.889 162.777 667.283 145.272 666.431 142.937C660.553 140.209 633.592 143.223 626.251 143.23C600.613 143.258 574.853 144.158 549.283 142.253C545.2 141.948 536.754 143.448 531.256 143.372C525.629 144.269 520.661 144.639 515.974 148.084C513.17 151.143 511.32 155.291 508.725 158.287C500.633 167.632 494.61 178.208 487.969 188.658L457.731 236.515L354.405 399.085L329.858 437.867C323.734 447.65 318.647 456.141 311.985 465.731Z"/>
              <path fill="#FFFFFF" d="M518.266 141.932C521.706 141.953 528.577 141.453 531.256 143.372C525.629 144.269 520.661 144.639 515.974 148.084L515.624 147.129C516.026 145.227 517.222 143.622 518.266 141.932Z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold" style={{ letterSpacing: '-0.03em', color: 'var(--color-text)', textAlign: 'center' }}>Vrimae</h1>
          <p className="text-sm" style={{ color: '#9CA3AF', textAlign: 'center' }}>Sistem Manajemen Bisnis Premium</p>
        </div>
        
        <h2 className="text-lg font-bold mb-6 text-center">
          {renderTitle()}
        </h2>
        
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(viewMode === 'login' || viewMode === 'register' || viewMode === 'forgot_password') && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input 
                  type="email" className="form-input" value={email} 
                  onChange={e => setEmail(e.target.value)} required 
                  placeholder="email@contoh.com" 
                  style={{ paddingLeft: '2.75rem', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '0.75rem 0.75rem 0.75rem 2.75rem' }}
                />
              </div>
            </div>
          )}

          {(viewMode === 'login' || viewMode === 'register' || viewMode === 'reset_password') && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginTop: '1rem' }}>{viewMode === 'reset_password' ? 'Password Baru' : 'Password'}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input 
                  type={showPassword ? "text" : "password"} className="form-input" value={password} 
                  onChange={e => setPassword(e.target.value)} required 
                  placeholder="••••••••" minLength={6}
                  style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '0.75rem 2.75rem 0.75rem 2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.875rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text)',
                    opacity: 0.5,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {viewMode === 'login' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem' }}>
              <button 
                type="button" 
                className="text-xs hover:underline"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#3a6b35', marginTop: '0.5rem' }}
                onClick={() => setViewMode('forgot_password')}
              >
                Lupa Password?
              </button>
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}
            style={{ padding: '0.85rem', fontSize: '1rem', marginTop: '1rem', borderRadius: '12px', backgroundColor: '#5a9b5f', color: 'white', fontWeight: 'bold' }}>
            {renderSubmitText()}
          </button>
        </form>
        
        <div className="text-center text-sm text-secondary" style={{ marginTop: '1.5rem' }}>
          {viewMode === 'login' && (
            <>
              Belum punya akun? 
              <button type="button" onClick={() => setViewMode('register')} className="login-toggle" style={{ marginLeft: '0.25rem' }}>
                Daftar Sekarang
              </button>
            </>
          )}
          {viewMode === 'register' && (
            <>
              Sudah punya akun? 
              <button type="button" onClick={() => setViewMode('login')} className="login-toggle" style={{ marginLeft: '0.25rem' }}>
                Masuk di Sini
              </button>
            </>
          )}
          {(viewMode === 'forgot_password' || viewMode === 'reset_password') && (
            <button type="button" onClick={() => setViewMode('login')} className="login-toggle flex items-center justify-center gap-1 mx-auto">
              <ArrowLeft size={14} /> Kembali ke Halaman Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

