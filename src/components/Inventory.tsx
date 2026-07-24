import { useState, useEffect } from 'react';
import { getInventory, addInventory, updateInventory, deleteInventory, addTransaction } from '../utils/storage';
import { exportToCSV, exportToExcel } from '../utils/export';
import type { InventoryItem } from '../types';
import { format } from 'date-fns';
import { Plus, Download, Pencil, Trash2, Calendar, X } from 'lucide-react';
import { useToast } from './Toast';
import { formatCurrencyInput } from '../utils/currencyInput';

const Inventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [exportConfirm, setExportConfirm] = useState<{ type: 'CSV' | 'Excel'; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useToast();
  const [customUnit, setCustomUnit] = useState('');
  const standardUnits = ['gram', 'kg', 'ml', 'liter', 'pcs', 'pack', 'botol', 'sachet', 'dus'];
  
  const [formData, setFormData] = useState({
    name: '', category: 'Bubuk Matcha', quantity: '', unit: 'gram', unitPrice: '', date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    setLoading(true);
    const data = await getInventory();
    setInventory(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', category: 'Bubuk Matcha', quantity: '', unit: 'gram', unitPrice: '', date: new Date().toISOString().split('T')[0] });
    setCustomUnit('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingId(item.id);
    const isCustom = !standardUnits.includes(item.unit || '');
    setFormData({
      name: item.name, category: item.category, quantity: item.quantity.toString(), unit: isCustom ? 'custom' : (item.unit || 'gram'), unitPrice: item.unitPrice.toString(), date: item.date
    });
    setCustomUnit(isCustom ? (item.unit || '') : '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
    const qty = parseInt(formData.quantity);
    const price = parseFloat(formData.unitPrice);
    const finalUnit = formData.unit === 'custom' ? customUnit : formData.unit;

    if (editingId) {
      await updateInventory(editingId, {
        name: formData.name, category: formData.category, quantity: qty, unit: finalUnit, unitPrice: price, totalPrice: qty * price, date: formData.date
      });
      showToast('success', 'Barang Diperbarui', 'Perubahan berhasil disimpan');
    } else {
      await addInventory({
        name: formData.name, category: formData.category, quantity: qty, unit: finalUnit, unitPrice: price, totalPrice: qty * price, date: formData.date
      });
      await addTransaction({
        type: 'expense',
        amount: qty * price,
        category: 'Supply',
        description: `Stok: ${qty}x ${formData.name}`,
        date: formData.date
      });
      showToast('success', 'Barang Ditambahkan', 'Berhasil disimpan & tercatat di Keuangan');
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
    setIsDeleting(true);
    try {
      await deleteInventory(id);
      setDeleteConfirmId(null);
      showToast('success', 'Barang Dihapus', 'Data telah dihapus');
      fetchData();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCSV = () => {
    if (inventory.length === 0) { showToast('error', 'Tidak Ada Data', 'Tidak ada data inventori'); return; }
    setExportConfirm({ type: 'CSV', count: inventory.length });
  };

  const handleExportExcel = () => {
    if (inventory.length === 0) { showToast('error', 'Tidak Ada Data', 'Tidak ada data inventori'); return; }
    setExportConfirm({ type: 'Excel', count: inventory.length });
  };

  const executeExport = () => {
    if (!exportConfirm) return;
    if (exportConfirm.type === 'CSV') {
      exportToCSV('inventori_matcha', inventory);
      showToast('success', 'Export Berhasil', `${inventory.length} barang diekspor ke CSV`);
    } else {
      exportToExcel('inventori_matcha', inventory);
      showToast('success', 'Export Berhasil', `${inventory.length} barang diekspor ke Excel`);
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
          <h1 className="page-title">Inventori</h1>
          <p className="page-subtitle">Kelola stok dan pembelian barang</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-outline" onClick={handleExportCSV}><Download size={14} /> CSV</button>
          <button className="btn btn-outline" onClick={handleExportExcel}><Download size={14} /> Excel</button>
          <button className="btn btn-primary" onClick={openAddModal}><Plus size={14} /> Barang</button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Barang</th>
                <th>Kategori</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Harga Satuan</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'center', width: '90px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="loading-spinner" /></td></tr>
              ) : inventory.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted p-6 text-sm">Belum ada data inventori.</td></tr>
              ) : (
                inventory.map(item => (
                  <tr key={item.id}>
                    <td className="text-sm text-secondary">{format(new Date(item.date), 'dd MMM yyyy')}</td>
                    <td className="font-semibold text-sm">{item.name}</td>
                    <td><span className="badge badge-neutral">{item.category}</span></td>
                    <td className="text-center font-semibold" style={{ whiteSpace: 'nowrap' }}>{item.quantity} <span style={{fontSize: '0.8rem', color: 'var(--color-text-secondary)'}}>{item.unit ? `/ ${item.unit}` : ''}</span></td>
                    <td className="text-right text-sm" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.unitPrice)}</td>
                    <td className="text-right font-bold text-primary" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.totalPrice)}</td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button className="btn-icon" onClick={() => openEditModal(item)} title="Edit"><Pencil size={14} /></button>
                        <button className="btn-icon" onClick={() => { setDeleteConfirmId(item.id); }} title="Hapus" style={{ color: 'var(--color-expense)' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Barang' : 'Tambah Barang'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="modal-close-btn">
                <X size={28} strokeWidth={2.5} />
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Nama Barang</label>
                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="Nama Barang" />
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select className="form-select" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option value="Bubuk Matcha">Bubuk Matcha</option>
                  <option value="Packaging">Packaging (Gelas, Sedotan)</option>
                  <option value="Susu/Pemanis">Susu / Pemanis</option>
                  <option value="Peralatan">Peralatan (Whisk, dll)</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="form-group">
                  <label className="form-label">Kuantitas</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="number" inputMode="numeric" pattern="[0-9\.]*" className="form-input" style={{ flex: 1 }} value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} min="1" placeholder="0" required />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{formData.unit}</span>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Satuan</label>
                  <select className="form-select" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})}>
                    <option value="gram">Gram (g)</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="ml">Mililiter (ml)</option>
                    <option value="liter">Liter (L)</option>
                    <option value="pcs">Pcs (buah)</option>
                    <option value="pack">Pack</option>
                    <option value="botol">Botol</option>
                    <option value="sachet">Sachet</option>
                    <option value="dus">Dus</option>
                    <option value="custom">Lainnya (Isi Sendiri)</option>
                  </select>
                  {formData.unit === 'custom' && (
                    <input type="text" className="form-input" style={{ marginTop: '0.5rem' }} value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder="Satuan" required />
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ whiteSpace: 'nowrap' }}>Harga (Rp)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9\.]*" className="form-input" value={formData.unitPrice ? formatCurrencyInput(formData.unitPrice) : ''} onChange={e => setFormData({...formData, unitPrice: e.target.value.replace(/[^0-9]/g, '')})} placeholder="10.000" required />
                </div>
              </div>
              <div style={{ background: 'var(--color-primary-lighter)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
                <div className="text-xs text-secondary font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Harga Beli</div>
                <div className="text-lg font-extrabold text-primary">{formatCurrency((parseInt(formData.quantity || '0') * parseFloat(formData.unitPrice || '0')) || 0)}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Beli</label>
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
              <h2 className="text-lg font-bold mb-2">Hapus Barang?</h2>
              <p className="text-sm text-secondary mb-4">Barang ini akan dihapus permanen dari inventori.</p>

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
                Apakah Anda yakin ingin mengunduh <strong>{exportConfirm.count}</strong> data inventori ini dalam format <strong>{exportConfirm.type}</strong>?
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

export default Inventory;
