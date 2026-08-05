import { useState, useEffect, useMemo } from 'react';
import { getTransactions, addTransaction, updateTransaction, deleteTransaction, getProducts } from '../utils/storage';
import { exportToCSV, exportToExcelAdvanced } from '../utils/export';
import type { Transaction, Product } from '../types';
import { format, isThisWeek, isThisMonth } from 'date-fns';
import { Plus, Download, Pencil, Trash2, Calendar, X } from 'lucide-react';
import { useToast } from './Toast';
import { formatCurrencyInput } from '../utils/currencyInput';

const Finance = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [exportConfirm, setExportConfirm] = useState<{ type: 'CSV' | 'Excel'; count: number } | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month'>('all');
  const [dateSearch, setDateSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: 'Supply',
    description: '',
    paymentMethod: 'Tunai',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  const fetchData = async (pageNum = 0, append = false) => {
    if (!append) setLoading(true);
    const [txData, prodData] = await Promise.all([
      getTransactions(PAGE_SIZE, pageNum * PAGE_SIZE), 
      getProducts()
    ]);
    
    if (append) {
      setTransactions(prev => [...prev, ...txData]);
    } else {
      setTransactions(txData);
    }
    setProducts(prodData);
    setHasMore(txData.length === PAGE_SIZE);
    if (!append) setLoading(false);
  };

  useEffect(() => { 
    fetchData(0, false); 
    setPage(0);
  }, []);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage, true);
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ type: 'expense', amount: '', category: 'Supply', description: '', paymentMethod: 'Tunai', date: format(new Date(), 'yyyy-MM-dd') });
    setIsModalOpen(true);
  };

  const openEditModal = (t: Transaction) => {
    setEditingId(t.id);
    let dateStr = t.date;
    try { dateStr = format(new Date(t.date), 'yyyy-MM-dd'); } catch(e) { /* ignore */ }
    
    let currentDesc = t.description;
    let currentMethod = 'Tunai';
    const match = currentDesc.match(/^\[(.*?)\]\s/);
    if (match) {
      currentMethod = match[1];
      currentDesc = currentDesc.replace(match[0], '').trim();
    }

    setFormData({ type: t.type, amount: t.amount.toString(), category: t.category, description: currentDesc, paymentMethod: currentMethod, date: dateStr });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let actionName = "Admin";
    let actionReason = "Edit Transaksi";
    
    if (editingId) {
      const name = window.prompt('Masukkan Nama Anda (wajib untuk edit):');
      if (!name) return;
      const reason = window.prompt('Masukkan Alasan perubahan (wajib):');
      if (!reason) return;
      actionName = name;
      actionReason = reason;
    }

    setIsSubmitting(true);
    const finalDesc = formData.paymentMethod ? `[${formData.paymentMethod}] ${formData.description.trim()}` : formData.description.trim();
    try {
      if (editingId) {
        await updateTransaction(editingId, { 
          type: formData.type as 'income' | 'expense', 
          amount: parseFloat(formData.amount), 
          category: formData.category, 
          description: finalDesc, 
          date: formData.date 
        }, actionName, actionReason);
        showToast('success', 'Transaksi Diperbarui', 'Perubahan berhasil disimpan');
      } else {
        await addTransaction({
          type: formData.type as 'income' | 'expense',
          amount: parseFloat(formData.amount),
          category: formData.category,
          description: finalDesc,
          date: formData.date
        });
        showToast('success', 'Transaksi Tersimpan', 'Transaksi berhasil dicatat');
      }
    
    setIsModalOpen(false);
    setEditingId(null);
    fetchData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    const name = window.prompt('Masukkan Nama Anda (wajib untuk hapus):');
    if (!name) return;
    const reason = window.prompt('Masukkan Alasan penghapusan (wajib):');
    if (!reason) return;

    setIsDeleting(true);
    try {
      await deleteTransaction(id, name, reason);
      setDeleteConfirmId(null);
      showToast('success', 'Transaksi Dihapus', 'Data telah dihapus');
      fetchData();
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTransactions = useMemo(() => transactions.filter(t => {
    if (dateSearch && !t.date.startsWith(dateSearch)) return false;
    if (timeFilter === 'all') return true;
    const date = new Date(t.date);
    if (timeFilter === 'week') return isThisWeek(date);
    if (timeFilter === 'month') return isThisMonth(date);
    return true;
  }), [transactions, timeFilter, dateSearch]);

  const parseTransactionData = (t: Transaction) => {
    let namaPembeli = '-';
    let detailMenu = t.description;
    let kategoriMenu = '-';
    let paymentMethod = '-';

    const match = detailMenu.match(/^\[(.*?)\]\s/);
    if (match) {
      paymentMethod = match[1];
      detailMenu = detailMenu.replace(match[0], '');
    }

    if (detailMenu.startsWith('Pesanan:')) {
      const withoutPrefix = detailMenu.replace('Pesanan:', '').trim();
      const dashIdx = withoutPrefix.indexOf(' - ');
      if (dashIdx !== -1) {
        namaPembeli = withoutPrefix.substring(0, dashIdx).trim();
        detailMenu = withoutPrefix.substring(dashIdx + 3).trim();
      }
    }

    const categoriesFound = new Set<string>();
    products.forEach(p => {
      if (detailMenu.includes(p.name)) {
        const cat = p.category || 'Umum';
        categoriesFound.add(cat);
      }
    });
    if (categoriesFound.size > 0) {
      kategoriMenu = Array.from(categoriesFound).join(', ');
    }

    return { namaPembeli, detailMenu, kategoriMenu, paymentMethod };
  };

  const prepareExportData = (txList: typeof filteredTransactions) =>
    txList.map(t => {
      const parsed = parseTransactionData(t);

      return {
        'id': t.id,
        'tipe': t.type === 'income' ? 'income' : 'expense',
        'metode pembayaran': parsed.paymentMethod,
        'amount': t.amount,
        'category': t.category,
        'description': parsed.detailMenu,
        'date': t.date,
        'nama pelanggan': parsed.namaPembeli,
        'category menu': parsed.kategoriMenu,
      };
    });

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) { showToast('error', 'Tidak Ada Data', 'Tidak ada transaksi untuk diekspor'); return; }
    setExportConfirm({ type: 'CSV', count: filteredTransactions.length });
  };

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) { showToast('error', 'Tidak Ada Data', 'Tidak ada transaksi untuk diekspor'); return; }
    setExportConfirm({ type: 'Excel', count: filteredTransactions.length });
  };

  const executeExport = () => {
    if (!exportConfirm) return;
    if (exportConfirm.type === 'CSV') {
      exportToCSV(`keuangan_vrimae_${timeFilter}`, prepareExportData(filteredTransactions));
      showToast('success', 'Export Berhasil', `${filteredTransactions.length} transaksi diekspor ke CSV`);
    } else {
      exportToExcelAdvanced(
        `laporan_vrimae_${timeFilter}`,
        prepareExportData(filteredTransactions),
        products
      );
      showToast('success', 'Export Berhasil', `Laporan lengkap (4 sheet) berhasil diekspor ke Excel`);
    }
    setExportConfirm(null);
  };

  const formatCurrency = (amount: number) => {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Keuangan</h1>
          <p className="page-subtitle">Kelola pemasukan dan pengeluaran</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="filter-group">
            <button className={`filter-chip ${timeFilter === 'all' ? 'active' : ''}`} onClick={() => setTimeFilter('all')}>Semua</button>
            <button className={`filter-chip ${timeFilter === 'week' ? 'active' : ''}`} onClick={() => setTimeFilter('week')}>Minggu</button>
            <button className={`filter-chip ${timeFilter === 'month' ? 'active' : ''}`} onClick={() => setTimeFilter('month')}>Bulan</button>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Calendar size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--color-primary)', pointerEvents: 'none' }} />
            <input 
              type="date" 
              value={dateSearch} 
              onChange={(e) => setDateSearch(e.target.value)}
              className="form-input" 
              style={{ padding: '0.6rem 0.6rem 0.6rem 2.2rem', width: 'auto', minWidth: '150px', cursor: 'pointer', borderColor: dateSearch ? 'var(--color-primary)' : 'var(--color-border)' }}
              title="Cari berdasarkan tanggal"
            />
          </div>
          <button className="btn btn-outline" onClick={handleExportCSV}><Download size={14} /> CSV</button>
          <button className="btn btn-outline" onClick={handleExportExcel}><Download size={14} /> Excel</button>
          <button className="btn btn-primary" onClick={openAddModal}><Plus size={14} /> Transaksi</button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Tipe</th>
                <th>Metode</th>
                <th>Kategori</th>
                <th>Pelanggan</th>
                <th>Kategori Menu</th>
                <th>Deskripsi</th>
                <th style={{ textAlign: 'right' }}>Jumlah</th>
                <th style={{ textAlign: 'center', width: '90px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><div className="loading-spinner" /></td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted p-6 text-sm">Belum ada transaksi pada periode ini.</td></tr>
              ) : (
                filteredTransactions.map(t => {
                  const parsed = parseTransactionData(t);
                  return (
                  <tr key={t.id}>
                    <td className="text-sm text-secondary">{format(new Date(t.date), 'dd MMM yyyy')}</td>
                    <td><span className={`badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}`}>{t.type === 'income' ? 'Masuk' : 'Keluar'}</span></td>
                    <td className="text-sm">{parsed.paymentMethod !== '-' ? <span className="badge badge-neutral">{parsed.paymentMethod}</span> : <span className="text-muted">-</span>}</td>
                    <td className="text-sm"><span className="badge badge-neutral">{t.category}</span></td>
                    <td className="text-sm">{parsed.namaPembeli !== '-' ? parsed.namaPembeli : <span className="text-muted">-</span>}</td>
                    <td className="text-sm">{parsed.kategoriMenu !== '-' ? <span className="badge badge-primary">{parsed.kategoriMenu}</span> : <span className="text-muted">-</span>}</td>
                    <td className="text-sm" style={{ maxWidth: '200px', whiteSpace: 'normal' }}>{parsed.detailMenu}</td>
                    <td className={`font-bold text-right ${t.type === 'income' ? 'text-income' : 'text-expense'}`} style={{ whiteSpace: 'nowrap' }}>{t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}</td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button className="btn-icon" onClick={() => openEditModal(t)} title="Edit"><Pencil size={14} /></button>
                        <button className="btn-icon" onClick={() => { setDeleteConfirmId(t.id); }} title="Hapus" style={{ color: 'var(--color-expense)' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
          {hasMore && !loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
              <button className="btn btn-outline" onClick={loadMore}>Muat Lebih Banyak</button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Transaksi' : 'Tambah Transaksi'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="modal-close-btn">
                <X size={28} strokeWidth={2.5} />
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Tipe Transaksi</label>
                <select className="form-select" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                  <option value="income">Pemasukan</option>
                  <option value="expense">Pengeluaran</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Metode Pembayaran</label>
                <select className="form-select" value={formData.paymentMethod} onChange={e => setFormData({...formData, paymentMethod: e.target.value})}>
                  <option value="Tunai">Tunai (Cash)</option>
                  <option value="Transfer Bank">Transfer Bank / M-Banking</option>
                  <option value="QRIS">QRIS</option>
                  <option value="DANA">DANA</option>
                  <option value="GoPay">GoPay</option>
                  <option value="Kartu Debit/Kredit">Kartu Debit / Kredit</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                {formData.type === 'expense' ? (
                  <select className="form-select" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    <option value="Supply">Supply (Bahan Baku)</option>
                    <option value="Rent">Rent (Sewa Tempat)</option>
                    <option value="Other">Lain-lain</option>
                  </select>
                ) : (
                  <input type="text" className="form-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Kategori" required />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Deskripsi</label>
                <input type="text" className="form-input" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Deskripsi" required />
              </div>
              <div className="form-group">
                <label className="form-label">Jumlah (Rp)</label>
                <input type="text" inputMode="numeric" pattern="[0-9\.]*" className="form-input" value={formData.amount ? formatCurrencyInput(formData.amount) : ''} onChange={e => setFormData({...formData, amount: e.target.value.replace(/[^0-9]/g, '')})} required placeholder="10.000" />
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Calendar size={16} style={{ position: 'absolute', left: '1rem', color: 'var(--color-text)', opacity: 0.5, pointerEvents: 'none' }} />
                  <input type="date" className="form-input" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ paddingLeft: '2.5rem', cursor: 'pointer' }} required />
                </div>
              </div>
              <div className="flex justify-end gap-2" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => { setIsModalOpen(false); setEditingId(null); }}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="text-center">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-expense-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Trash2 size={24} style={{ color: 'var(--color-expense)' }} />
              </div>
              <h2 className="text-lg font-bold mb-2">Hapus Transaksi?</h2>
              <p className="text-sm text-secondary mb-4">Transaksi ini akan dihapus secara permanen.</p>

              <div className="flex justify-center gap-2">
                <button className="btn btn-outline" onClick={() => setDeleteConfirmId(null)}>Batal</button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirmId)} disabled={isDeleting}>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {exportConfirm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="text-center">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary-lighter)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Download size={24} style={{ color: 'var(--color-primary)' }} />
              </div>
              <h2 className="text-lg font-bold mb-2">Konfirmasi Unduhan</h2>
              <p className="text-sm text-secondary mb-6">
                Apakah Anda yakin ingin mengunduh <strong>{exportConfirm.count}</strong> data transaksi ini dalam format <strong>{exportConfirm.type}</strong>?
              </p>
              <div className="flex justify-center gap-2">
                <button className="btn btn-outline" onClick={() => setExportConfirm(null)}>Batal</button>
                <button className="btn btn-primary" onClick={executeExport}>Ya, Unduh</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
