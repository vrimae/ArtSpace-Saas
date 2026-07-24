import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { ShieldCheck, Users, Edit3, Check, X, RefreshCw, Calendar, Sparkles, TrendingUp } from 'lucide-react';

interface UserData {
  id: string;
  email: string;
  display_name: string;
  ai_prompt_limit: number;
  analytics_ends_at: string | null;
  ai_ends_at: string | null;
}

const SuperAdmin: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editLimit, setEditLimit] = useState<number>(15);
  const [editTier, setEditTier] = useState<'biasa' | 'analytics_pro' | 'komplit'>('biasa');
  const [editDuration, setEditDuration] = useState<number>(0); // 0 = tidak berubah, -1 = cabut, 7, 30, 365 = tambah hari
  
  // Modal Delete State
  const [deletingUser, setDeletingUser] = useState<UserData | null>(null);

  const { showToast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_all_users_for_admin_v2');
      if (error) {
        // Fallback for older version if new RPC is not yet created
        if (error.message.includes('function get_all_users_for_admin_v2 does not exist')) {
            showToast('error', 'Fungsi SQL Belum Diupdate', 'Silakan jalankan kode SQL v2 di Supabase Anda.');
            return;
        }
        throw error;
      }
      setUsers(data || []);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Gagal Memuat Klien', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSaveSubscription = async () => {
    if (!editingUser) return;
    
    if (editDuration === 0) {
      if (editTier === 'komplit' && (!editingUser.analytics_ends_at || !editingUser.ai_ends_at)) {
        showToast('error', 'Durasi Wajib Diisi', 'Akun ini belum memiliki paket Komplit. Silakan pilih durasi untuk mengaktifkannya (misal: 7 atau 30 Hari).');
        return;
      }
      if (editTier === 'analytics_pro' && !editingUser.analytics_ends_at) {
        showToast('error', 'Durasi Wajib Diisi', 'Akun ini belum memiliki paket Analitik Pro. Silakan pilih durasi untuk mengaktifkannya (misal: 7 atau 30 Hari).');
        return;
      }
    }

    let newAnalyticsDate = editingUser.analytics_ends_at;
    let newAiDate = editingUser.ai_ends_at;
    
    // Hitung tanggal kadaluarsa baru jika durasi diubah
    if (editDuration === -1) {
       // Cabut akses (Reset ke Versi Biasa)
       newAnalyticsDate = null;
       newAiDate = null;
    } else if (editDuration > 0) {
       // Tambah hari dari SAAT INI
       const futureDate = new Date();
       futureDate.setDate(futureDate.getDate() + editDuration);
       const futureStr = futureDate.toISOString();
       
       if (editTier === 'analytics_pro') {
         newAnalyticsDate = futureStr;
         newAiDate = null;
       } else if (editTier === 'komplit') {
         newAnalyticsDate = futureStr;
         newAiDate = futureStr;
       }
    } else if (editDuration === 0) {
       // Jika durasi tidak diubah, tapi tier diturunkan
       if (editTier === 'biasa') {
         newAnalyticsDate = null;
         newAiDate = null;
       } else if (editTier === 'analytics_pro') {
         newAiDate = null;
       }
    }

    try {
      const { error } = await supabase.rpc('update_user_subscription', {
        target_user_id: editingUser.id,
        new_analytics_ends_at: newAnalyticsDate,
        new_ai_ends_at: newAiDate,
        new_ai_limit: editLimit
      });
      if (error) throw error;
      
      showToast('success', 'Berhasil', 'Paket klien berhasil diperbarui.');
      setUsers(users.map(u => u.id === editingUser.id ? { 
        ...u, 
        ai_prompt_limit: editLimit,
        analytics_ends_at: newAnalyticsDate,
        ai_ends_at: newAiDate
      } : u));
      setEditingUser(null);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Gagal Update', err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      const { error } = await supabase.rpc('delete_user_for_admin', {
        target_user_id: deletingUser.id
      });
      if (error) throw error;
      
      showToast('success', 'Berhasil', `Akun ${deletingUser.email} berhasil dihapus.`);
      setUsers(users.filter(u => u.id !== deletingUser.id));
      setDeletingUser(null);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Gagal Hapus', err.message);
    }
  };

  const getRemainingDays = (dateStr: string | null) => {
    if (!dateStr) return 0;
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const getTierInfo = (u: UserData) => {
    const analyticsDays = getRemainingDays(u.analytics_ends_at);
    const aiDays = getRemainingDays(u.ai_ends_at);

    if (analyticsDays > 0 && aiDays > 0) {
      return { 
        label: 'Komplit (Pro + AI)', 
        color: '#F59E0B', 
        bg: 'rgba(245, 158, 11, 0.1)',
        days: Math.min(analyticsDays, aiDays)
      };
    } else if (analyticsDays > 0) {
      return { 
        label: 'Analitik Pro', 
        color: '#3B82F6', 
        bg: 'rgba(59, 130, 246, 0.1)',
        days: analyticsDays
      };
    } else {
      return { 
        label: 'Versi Biasa', 
        color: 'var(--color-text-secondary)', 
        bg: 'var(--color-bg)',
        days: 0
      };
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '1rem', borderRadius: '50%' }}>
          <ShieldCheck size={32} color="#8B5CF6" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: 0, color: 'var(--color-text)' }}>Super Admin Dashboard</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Kelola Langganan (Tiers), Masa Percobaan (Trial), dan Limit AI.</p>
        </div>
        <button 
          onClick={fetchUsers}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-text)' }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Users size={20} color="var(--color-text-secondary)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>Daftar Klien ({users.length})</h2>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>NAMA & EMAIL</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>PAKET SAAT INI</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>SISA TRIAL</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>LIMIT AI</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.85rem', textAlign: 'right' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const tier = getTierInfo(u);
                return (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '1.2rem 1.5rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.2rem' }}>{u.display_name || 'Tanpa Nama'}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '1.2rem 1.5rem' }}>
                    <span style={{ background: tier.bg, color: tier.color, padding: '0.4rem 0.8rem', borderRadius: '20px', fontWeight: 600, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                       {tier.label === 'Komplit (Pro + AI)' && <Sparkles size={14} />}
                       {tier.label === 'Analitik Pro' && <TrendingUp size={14} />}
                       {tier.label}
                    </span>
                  </td>
                  <td style={{ padding: '1.2rem 1.5rem' }}>
                     {tier.days > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: tier.days <= 3 ? '#EF4444' : 'var(--color-text)' }}>
                          <Calendar size={16} />
                          <span style={{ fontWeight: 600 }}>{tier.days} Hari</span>
                        </div>
                     ) : (
                       <span style={{ color: 'var(--color-text-secondary)' }}>-</span>
                     )}
                  </td>
                  <td style={{ padding: '1.2rem 1.5rem' }}>
                     <span style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', padding: '0.3rem 0.8rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
                        {u.ai_prompt_limit}
                     </span>
                  </td>
                  <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => { 
                            setEditingUser(u); 
                            setEditLimit(u.ai_prompt_limit);
                            const currentTier = getTierInfo(u);
                            if (currentTier.label.includes('Komplit')) setEditTier('komplit');
                            else if (currentTier.label.includes('Analitik')) setEditTier('analytics_pro');
                            else setEditTier('biasa');
                            setEditDuration(0); // Default ke tidak mengubah durasi
                          }}
                          style={{ padding: '0.6rem 1rem', background: 'transparent', color: '#8B5CF6', border: '1px solid #8B5CF6', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                        >
                          <Edit3 size={16} /> Kelola
                        </button>
                        <button 
                          onClick={() => setDeletingUser(u)}
                          style={{ padding: '0.6rem 1rem', background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                        >
                          <X size={16} /> Hapus
                        </button>
                      </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit Subscription */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--color-surface)', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '500px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--color-text)', fontSize: '1.25rem' }}>Kelola Klien</h3>
              <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1.5rem', color: 'var(--color-text)' }}>
              <strong>Klien:</strong> {editingUser.email}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text)', fontWeight: 500 }}>Ubah Tipe Akun</label>
              <select 
                value={editTier} 
                onChange={(e) => setEditTier(e.target.value as any)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              >
                <option value="biasa">Versi Biasa (Gratis)</option>
                <option value="analytics_pro">Versi Analitik Pro</option>
                <option value="komplit">Versi Komplit (Pro + AI)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text)', fontWeight: 500 }}>Durasi Akses (Trial/Langganan)</label>
              <select 
                value={editDuration} 
                onChange={(e) => setEditDuration(Number(e.target.value))}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              >
                <option value={0}>Tidak Berubah (Biarkan durasi saat ini)</option>
                <option value={7}>Aktifkan / Perpanjang 7 Hari</option>
                <option value={30}>Aktifkan / Perpanjang 30 Hari</option>
                <option value={365}>Akses Setahun (365 Hari)</option>
                <option value={-1}>Cabut Akses (Reset)</option>
              </select>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text)', fontWeight: 500 }}>Limit AI Harian</label>
              <input 
                type="number"
                value={editLimit}
                onChange={(e) => setEditLimit(Number(e.target.value))}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text)', cursor: 'pointer', fontWeight: 600 }}>Batal</button>
              <button onClick={handleSaveSubscription} style={{ flex: 1, padding: '0.75rem', background: '#8B5CF6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={18} /> Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Delete User */}
      {deletingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--color-surface)', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <X size={28} color="#EF4444" />
            </div>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--color-text)', fontSize: '1.25rem' }}>Hapus Akun Klien?</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Apakah Anda yakin ingin menghapus permanen akun <strong>{deletingUser.email}</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setDeletingUser(null)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text)', cursor: 'pointer', fontWeight: 600 }}>Batal</button>
              <button onClick={handleDeleteUser} style={{ flex: 1, padding: '0.75rem', background: '#EF4444', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Hapus Permanen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
