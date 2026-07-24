import { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Mail, Store, Save, Moon, Sun, Phone, Tag, Plus, Trash2, Pencil, Check, X, Send, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCategories, saveCategories, renameCategoryInItems } from '../utils/storage';
import { useToast } from './Toast';
import { AuthContext } from '../App';

const FullPageLoader = () => (
  <div style={{
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeIn 0.2s ease-out'
  }}>
    <style>{`
      @keyframes spin-minimal {
        to { transform: rotate(360deg); }
      }
      .minimal-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin-minimal 0.8s linear infinite;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
    `}</style>
    <div className="minimal-spinner"></div>
  </div>
);

const Settings = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { setIsAdmin, setAdminPin } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    shopName: '',
    phone: '',
    email: '',
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    avatarUrl: '',
    receiptAddress: '',
    receiptFooter: '',
    qrisString: '',
    telegramBotToken: '',
    telegramChatId: '',
    geminiApiKey: '',
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });



  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState('');

  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setFormData(prev => ({
          ...prev,
          email: user.email || '',
          fullName: user.user_metadata?.full_name || '',
          shopName: user.user_metadata?.shop_name || '',
          phone: user.user_metadata?.phone || '',
          avatarUrl: user.user_metadata?.avatar_url || '',
          receiptAddress: user.user_metadata?.receipt_address || '',
          receiptFooter: user.user_metadata?.receipt_footer || '',
          qrisString: user.user_metadata?.qris_string || '',
          telegramBotToken: user.user_metadata?.telegram_bot_token || '',
          telegramChatId: user.user_metadata?.telegram_chat_id || '',
          geminiApiKey: user.user_metadata?.gemini_api_key || '',
        }));
      }
    });
    getCategories().then(setCategories);
  }, []);

  const handleAddCategory = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const trimmed = newCategory.trim();
      if (!trimmed) return;
      
      const currentCategories = Array.isArray(categories) ? categories : [];
      if (currentCategories.includes(trimmed)) {
        showToast('error', 'Gagal', 'Kategori sudah ada');
        return;
      }
      const updated = [...currentCategories, trimmed];
      setCategories(updated);
      setNewCategory('');
      await saveCategories(updated, "Admin", "Penambahan Kategori");
      showToast('success', 'Berhasil', 'Kategori ditambahkan');
    } catch (error) {
      console.error('handleAddCategory error:', error);
      showToast('error', 'Gagal', 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditCategory = async (index: number) => {
    if (loading) return;
    try {
      const trimmed = editCategoryValue.trim();
      if (!trimmed || categories[index] === trimmed) {
        setEditingCategoryIndex(null);
        return;
      }
      if (categories.includes(trimmed)) {
        showToast('error', 'Gagal', 'Nama kategori sudah digunakan');
        return;
      }
      const oldName = categories[index];
      const updated = [...categories];
      updated[index] = trimmed;
      setCategories(updated);
      setEditingCategoryIndex(null);
      await saveCategories(updated, "Admin", "Edit Kategori");
      await renameCategoryInItems(oldName, trimmed);
      showToast('success', 'Berhasil', 'Kategori diubah dan diperbarui di semua data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (index: number) => {
    if (loading) return;
    const confirmed = window.confirm('Hapus kategori ini? Pastikan tidak ada produk/barang yang sedang menggunakannya.');
    if (!confirmed) return;
    
    setLoading(true);
    try {
      const updated = categories.filter((_, i) => i !== index);
      setCategories(updated);
      await saveCategories(updated, "Admin", "Hapus Kategori");
      showToast('success', 'Berhasil', 'Kategori dihapus');
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = () => {
    const nextTheme = !isDarkMode;
    setIsDarkMode(nextTheme);
    if (nextTheme) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB to prevent huge memory spikes during processing)
    if (file.size > 5 * 1024 * 1024) {
      showToast('error', 'Gagal', 'Ukuran gambar maksimal 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200; // Keep it small for DB efficiency
        let width = img.width;
        let height = img.height;

        // Crop to square if needed, or just scale down proportionally. Let's scale down proportionally.
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setFormData(prev => ({ ...prev, avatarUrl: dataUrl }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updates: any = {
        data: {
          full_name: formData.fullName,
          shop_name: formData.shopName,
          phone: formData.phone,
          avatar_url: formData.avatarUrl,
          receipt_address: formData.receiptAddress,
          receipt_footer: formData.receiptFooter,
          qris_string: formData.qrisString,
          telegram_bot_token: formData.telegramBotToken,
          telegram_chat_id: formData.telegramChatId,
          gemini_api_key: formData.geminiApiKey,
        }
      };

      if (formData.newPassword) {
        if (!formData.oldPassword) {
          showToast('error', 'Gagal', 'Masukkan password saat ini untuk keamanan');
          setLoading(false);
          return;
        }
        if (formData.newPassword !== formData.confirmPassword) {
          showToast('error', 'Gagal', 'Password baru tidak cocok dengan konfirmasi');
          setLoading(false);
          return;
        }

        // Verifikasi password lama dengan login ulang
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.oldPassword
        });

        if (signInError) {
          showToast('error', 'Gagal', 'Password saat ini yang Anda masukkan salah');
          setLoading(false);
          return;
        }

        updates.password = formData.newPassword;
      }

      const { error } = await supabase.auth.updateUser(updates);

      if (error) throw error;

      showToast('success', 'Berhasil', 'Profil Anda telah diperbarui');
      setFormData(prev => ({ ...prev, oldPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (error: any) {
      showToast('error', 'Gagal Memperbarui', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!formData.telegramBotToken || !formData.telegramChatId) {
      showToast('error', 'Gagal', 'Token Bot dan Chat ID harus diisi terlebih dahulu');
      return;
    }
    setLoading(true);
    try {
      const url = `https://api.telegram.org/bot${formData.telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: formData.telegramChatId,
          text: '✅ *Test Notifikasi Vrimae*\n\nSelamat! Aplikasi kasir Anda berhasil terhubung dengan Telegram.',
          parse_mode: 'Markdown'
        })
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.description || 'Gagal mengirim pesan');
      showToast('success', 'Berhasil', 'Pesan test terkirim ke Telegram Anda');
    } catch (error: any) {
      showToast('error', 'Koneksi Gagal', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (pinInput !== confirmPinInput) {
        showToast('error', 'Gagal', 'PIN dan konfirmasi tidak cocok');
        setLoading(false);
        return;
      }
      
      if (pinInput && pinInput.length !== 6) {
        showToast('error', 'Gagal', 'PIN Admin harus berisi tepat 6 digit.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        data: { admin_pin: pinInput || null }
      });
      if (error) throw error;
      
      showToast('success', 'Berhasil', pinInput ? 'PIN Admin berhasil disimpan. Sistem kini bisa dilock ke Mode Kasir.' : 'PIN Admin berhasil dihapus. Sistem terbuka untuk semua.');
      setPinInput('');
      setConfirmPinInput('');
      
      setAdminPin(pinInput || null);
      if (pinInput) {
        setIsAdmin(false);
        navigate('/pos');
      } else {
        setIsAdmin(true);
      }
    } catch (error: any) {
      showToast('error', 'Gagal', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      {loading && <FullPageLoader />}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Setelan</h1>
        <p className="text-secondary">Kelola profil, akun, dan preferensi aplikasi Anda.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* ── TAMPILAN ── */}
        <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--color-border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isDarkMode ? <Moon size={18} className="text-primary" /> : <Sun size={18} className="text-warning" />} Preferensi Tampilan
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-surface-alt)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>Mode Gelap</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Ubah tema aplikasi menjadi gelap untuk kenyamanan mata.</div>
            </div>
            <button
              onClick={toggleTheme}
              style={{
                width: 50, height: 28, borderRadius: '999px', border: 'none', cursor: 'pointer',
                background: isDarkMode ? 'var(--color-primary)' : '#d1d5db',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: isDarkMode ? 25 : 3,
                width: 22, height: 22, borderRadius: '50%', background: 'white',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)', transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)', display: 'block',
              }} />
            </button>
          </div>

        </div>

        {/* ── PROFIL & AKUN ── */}
        <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--color-border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={18} className="text-primary" /> Profil Pengguna
          </h2>
          
          <form onSubmit={handleUpdateProfile}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleImageUpload} 
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                style={{ 
                  width: 100, height: 100, borderRadius: '50%', background: 'var(--color-surface-alt)', 
                  border: '2px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', marginBottom: '1rem', cursor: 'pointer', position: 'relative'
                }}
                className="hover-opacity-transition"
              >
                {formData.avatarUrl ? (
                  <img src={formData.avatarUrl} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = ''; e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <User size={40} className="text-muted" />
                )}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.65rem', fontWeight: 'bold', padding: '0.2rem 0', textAlign: 'center' }}>
                  GANTI
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  Pilih Gambar
                </button>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>Otomatis dikompres & disimpan secara lokal.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              {/* Note: In a real responsive setup, we'd use media queries, but for now 1fr is safe */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={14} /> Email (Tidak bisa diubah)</label>
                <input type="email" className="form-input" value={formData.email} disabled style={{ background: 'var(--color-surface-alt)', cursor: 'not-allowed', opacity: 0.7 }} />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={14} /> Nama Lengkap</label>
                <input 
                  type="text" className="form-input" placeholder="Nama Anda"
                  value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Store size={14} /> Nama Toko / Bisnis</label>
                <input 
                  type="text" className="form-input" placeholder="Nama Toko / Bisnis"
                  value={formData.shopName} onChange={e => setFormData({...formData, shopName: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} /> Nomor Telepon</label>
                <input 
                  type="tel" className="form-input" placeholder="Nomor Telepon"
                  value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} 
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--color-border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Store size={15} /> Pengaturan Struk
                </h3>
              </div>

              <div className="form-group">
                <label className="form-label">Alamat Toko (Struk)</label>
                <textarea 
                  className="form-input" placeholder="Masukkan alamat toko yang akan tampil di struk"
                  value={formData.receiptAddress} onChange={e => setFormData({...formData, receiptAddress: e.target.value})} 
                  style={{ minHeight: '60px' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Pesan Footer Struk</label>
                <textarea 
                  className="form-input" placeholder="Misal: Terima kasih telah berbelanja!"
                  value={formData.receiptFooter} onChange={e => setFormData({...formData, receiptFooter: e.target.value})} 
                  style={{ minHeight: '60px' }}
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--color-border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Store size={15} /> QRIS Dinamis (Otomatis Sesuai Harga)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Jika Anda memiliki QRIS (DANA/BCA/dll), scan barcode-nya menggunakan aplikasi Scanner Barcode. Paste kode panjangnya di bawah ini. Kasir akan menampilkan QRIS Dinamis saat proses pembayaran.
                </p>
                <label className="form-label">Teks Kode QRIS</label>
                <textarea 
                  className="form-input" placeholder="Misal: 00020101021126570014ID.CO.QRIS..."
                  value={formData.qrisString} onChange={e => setFormData({...formData, qrisString: e.target.value})} 
                  style={{ minHeight: '80px', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--color-border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Send size={15} className="text-info" /> Notifikasi Telegram (Otomatis)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Kirim laporan setiap ada transaksi baru langsung ke chat Telegram Anda. Buat bot baru di <strong>@BotFather</strong> untuk mendapatkan Token.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group mb-0">
                    <label className="form-label">Telegram Bot Token</label>
                    <input 
                      type="text" className="form-input" placeholder="Misal: 123456:ABC-DEF1234..."
                      value={formData.telegramBotToken} onChange={e => setFormData({...formData, telegramBotToken: e.target.value})} 
                      style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label">Telegram Chat ID</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" className="form-input" placeholder="Misal: 987654321"
                        value={formData.telegramChatId} onChange={e => setFormData({...formData, telegramChatId: e.target.value})} 
                        style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                      />
                      <button 
                        type="button" 
                        onClick={handleTestTelegram}
                        className="btn btn-outline"
                        style={{ padding: '0 1rem', whiteSpace: 'nowrap' }}
                        title="Test Kirim Pesan"
                      >
                        <MessageCircle size={16} /> Test
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="form-group" style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--color-border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Lock size={15} /> Ganti Password
                </h3>
              </div>

              <div className="form-group">
                <label className="form-label">Password Saat Ini</label>
                <input 
                  type="password" className="form-input" placeholder="Masukkan password lama"
                  value={formData.oldPassword} onChange={e => setFormData({...formData, oldPassword: e.target.value})} 
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password Baru</label>
                <input 
                  type="password" className="form-input" placeholder="Biarkan kosong jika tidak ingin ganti"
                  value={formData.newPassword} onChange={e => setFormData({...formData, newPassword: e.target.value})} 
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Konfirmasi Password Baru</label>
                <input 
                  type="password" className="form-input" placeholder="Ulangi password baru"
                  value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} 
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: '160px', justifyContent: 'center' }}>
                <Save size={16} /> Simpan Perubahan
              </button>
            </div>
          </form>
        </div>

        {/* ── KEAMANAN: PIN ADMIN ── */}
        <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--color-border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} className="text-expense" /> Keamanan: PIN Admin & Mode Kasir
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            Atur PIN Admin untuk mengaktifkan <strong>Mode Kasir</strong>. Saat Mode Kasir aktif, karyawan hanya bisa mengakses halaman Kasir (POS).
            Biarkan kosong jika tidak ingin menggunakan fitur ini.
          </p>

          <form onSubmit={handleSavePin} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">PIN Admin Baru (Wajib 6 digit)</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Misal: 123456 (Kosongkan untuk hapus)"
                value={pinInput} 
                onChange={e => setPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Konfirmasi PIN</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Ulangi PIN"
                  value={confirmPinInput} 
                  onChange={e => setConfirmPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} 
                />
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  <Save size={16} /> Simpan
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* ── KATEGORI PRODUK ── */}
        <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--color-border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tag size={18} className="text-primary" /> Manajemen Kategori (Tipe Produk)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            Kategori ini akan muncul sebagai pilihan "Tipe" atau "Based" saat Anda menambah Produk di Kasir atau Barang di Inventori.
          </p>

          <form onSubmit={handleAddCategory} className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Tambah Kategori</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Kategori Baru"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0 1rem', flexShrink: 0 }}>
                <Plus size={18} /> Tambah
              </button>
            </div>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {categories.map((cat, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                {editingCategoryIndex === index ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={editCategoryValue}
                        onChange={e => setEditCategoryValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveEditCategory(index)}
                        autoFocus
                        style={{ padding: '0.4rem 0.75rem', minHeight: 'auto' }}
                      />
                      <button type="button" onClick={() => handleSaveEditCategory(index)} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', minHeight: 'auto' }} title="Simpan"><Check size={16} /></button>
                      <button type="button" onClick={() => { setEditingCategoryIndex(null); }} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', minHeight: 'auto' }} title="Batal"><X size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={{ fontWeight: 600 }}>{cat}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button 
                        type="button"
                        onClick={() => { setEditingCategoryIndex(index); setEditCategoryValue(cat); }}
                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '0.25rem' }}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleDeleteCategory(index)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-expense)', cursor: 'pointer', padding: '0.25rem' }}
                        title="Hapus"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                Belum ada kategori.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
