import { useState, useEffect } from 'react';
import { getTransactions, updateTransaction, addTransaction, getUser } from '../utils/storage';
import { safeFormatDate } from '../utils/format';
import { CheckCircle2, Clock, Search, MessageCircle, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDynamicQRIS } from '../utils/qris';
import { useToast } from './Toast';
import type { Transaction } from '../types';

const POList = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [waGatewayConfig, setWaGatewayConfig] = useState({ token: '', url: '/api/fonnte/send', customTemplate: '', shopName: 'Vrimae' });
  const [qrisString, setQrisString] = useState('');
  const [settleModal, setSettleModal] = useState<{ isOpen: boolean; tx: Transaction | null; sisa: number; paymentMethod: string }>({ isOpen: false, tx: null, sisa: 0, paymentMethod: 'Tunai' });
  const { showToast } = useToast();

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const data = await getTransactions(500, 0);
      setTransactions(data.filter(t => t.poStatus));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
    getUser().then((user: any) => {
      if (user?.user_metadata) {
        if (user.user_metadata.qris_string) {
          setQrisString(user.user_metadata.qris_string);
        }
        const isSuperAdmin = user.email === 'bimdarmawa2@gmail.com' || user.email === 'vrimae23@gmail.com';
        const defaultWaToken = isSuperAdmin ? 'SbmGAc1TxotP4TGuCGpS' : '';
        setWaGatewayConfig({
          token: user.user_metadata.wa_gateway_token || defaultWaToken,
          url: (user.user_metadata?.wa_gateway_url && !user.user_metadata?.wa_gateway_url.includes('api.fonnte.com')) ? user.user_metadata?.wa_gateway_url : '/api/fonnte/send',
          customTemplate: user.user_metadata.wa_custom_template || '',
          shopName: user.user_metadata.shop_name || 'Vrimae'
        });
      }
    });
  }, []);

  const sendWhatsAppSettle = (tx: Transaction, sisa: number, method: string) => {
    if (!tx || !tx.customerPhone) return;
    let phone = tx.customerPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);
    else if (phone.startsWith('8')) phone = '62' + phone;
    
    const formatCurrencyLocal = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    const itemDetails = tx.description.replace(/\[PO\|.*?\]\s/i, '').replace(/Pesanan:.*? - /i, '').trim();
    
    const customerNameVal = tx.customerName || 'Member';
    const shopNameVal = waGatewayConfig.shopName || 'Vrimae';
    
    let pelunasanText = '';
    if (sisa > 0) {
      pelunasanText = `\nTerima kasih juga atas pelunasan sebesar *${formatCurrencyLocal(sisa)}* menggunakan metode *${method}*.`;
    }

    const message = `Halo Kak *${customerNameVal}*,\n\nKami menginformasikan bahwa pesanan Pre-Order Anda:\n▪️ ${itemDetails}\n\nTelah berhasil *Selesai / Diambil* di *${shopNameVal}*.${pelunasanText}\n\nTerima kasih banyak telah mempercayakan pesanan Anda kepada kami. Ditunggu kedatangannya kembali! 😊🙏`;

    if (waGatewayConfig.token) {
      let endpoint = waGatewayConfig.url || '/api/fonnte/send';
      if (endpoint === 'https://api.fonnte.com/send' || endpoint.includes('api.fonnte.com')) endpoint = '/api/fonnte/send';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': waGatewayConfig.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: phone, message, countryCode: '62' })
      }).then(res => res.json()).then(data => {
        if (!data.status) {
          showToast('error', 'WA Gateway Gagal', 'Token Fonnte tidak valid / perangkat mati. Pop-up blocker memblokir tab manual. Silakan gunakan tombol WA di tabel.');
          const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
          window.open(url, '_blank');
        } else {
          showToast('success', 'Struk WA Terkirim!', `Notifikasi PO selesai dikirim ke pelanggan otomatis.`);
        }
      }).catch(() => {
        showToast('error', 'WA Gateway Gagal', 'Browser memblokir tab baru (Pop-up Blocker). Silakan izinkan pop-up atau kirim manual via tombol WA di tabel.');
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
      });
    } else {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
    }
  };

  const handleCompletePO = async (tx: Transaction) => {
    const totalVal = tx.poTotalAmount || tx.amount;
    const dpVal = tx.poDpAmount !== undefined ? tx.poDpAmount : tx.amount;
    const sisa = totalVal - dpVal;
    
    if (sisa > 0) {
      setSettleModal({ isOpen: true, tx, sisa, paymentMethod: 'Tunai' });
    } else {
      if (confirm(`Tandai pesanan PO dari ${tx.customerName || 'Pelanggan'} selesai?`)) {
        try {
          await updateTransaction(tx.id, { poStatus: 'selesai' }, 'Admin', 'Menandai PO selesai');
          showToast('success', 'Berhasil', 'Pesanan PO ditandai selesai.');
          sendWhatsAppSettle(tx, 0, '');
          fetchPOs();
        } catch {
          showToast('error', 'Gagal', 'Tidak dapat mengupdate status PO.');
        }
      }
    }
  };

  const confirmSettle = async () => {
    const { tx, sisa, paymentMethod } = settleModal;
    if (!tx) return;
    try {
      await updateTransaction(tx.id, { poStatus: 'selesai' }, 'Admin', 'Menandai PO selesai');
      
      const itemDetails = tx.description.replace(/\[PO\|.*?\]\s/i, '').replace(/Pesanan:.*? - /i, '').trim();
      await addTransaction({
        type: 'income',
        amount: sisa,
        category: 'Penjualan',
        description: `[${paymentMethod}] Pelunasan PO: ${tx.customerName || 'Umum'} - ${itemDetails.substring(0, 50)}...`,
        date: new Date().toISOString()
      }, 'Admin', 'Mencatat pelunasan PO');

      showToast('success', 'Berhasil', 'Pesanan PO dilunasi dan ditandai selesai.');
      sendWhatsAppSettle(tx, sisa, paymentMethod);
      setSettleModal({ isOpen: false, tx: null, sisa: 0, paymentMethod: 'Tunai' });
      fetchPOs();
    } catch {
      showToast('error', 'Gagal', 'Tidak dapat mengupdate status PO.');
    }
  };

  const handleChat = (tx: Transaction) => {
    const phone = tx.customerPhone || '';
    if (!phone) {
      showToast('error', 'Tidak ada No WA', 'Pelanggan ini tidak memasukkan nomor WhatsApp.');
      return;
    }
    
    // Auto format phone number
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '62' + formattedPhone.substring(1);
    }

    const itemDetails = tx.description.replace(/Pesanan:.*? - /i, '').trim();
    const text = `Halo Kak ${tx.customerName || ''}, pesanan Pre-Order Anda (${itemDetails}) sudah dapat diambil di Vrimae ArtSpace. Terima kasih!`;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const filteredPOs = transactions.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.customerName?.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const formatCurrency = (amount: number) => {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="text-2xl font-black text-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Daftar Pre-Order (PO)
          </h2>
          <p className="text-secondary mt-1 text-sm">Kelola daftar pesanan yang belum diambil / dikirim.</p>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            type="text"
            placeholder="Cari nama pemesan atau menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: '12px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none' }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tgl Dibuat</th>
                <th>Tgl Ambil (PO)</th>
                <th>Pelanggan</th>
                <th>Pesanan</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="loading-spinner" /></td></tr>
              ) : filteredPOs.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted p-6 text-sm">Tidak ada daftar PO ditemukan.</td></tr>
              ) : (
                filteredPOs.map(t => (
                  <tr key={t.id} style={{ opacity: t.poStatus === 'selesai' ? 0.6 : 1 }}>
                    <td className="text-sm text-secondary">{safeFormatDate(t.date, 'dd MMM yyyy')}</td>
                    <td className="text-sm font-bold text-primary">
                      {t.poPickupDate ? safeFormatDate(t.poPickupDate, 'dd MMM yyyy, HH:mm') : '-'}
                    </td>
                    <td className="font-semibold text-sm">
                      {t.customerName || 'Umum'}
                      {t.customerPhone && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 400 }}>{t.customerPhone}</div>}
                    </td>
                    <td className="text-sm">
                      {t.description.replace(/\[QRIS\]\s*/i, '').replace(/Pesanan:.*? - /i, '')}
                    </td>
                    <td className="text-right text-sm">
                      <div className="font-bold">{formatCurrency(t.poTotalAmount || t.amount)}</div>
                      {(t.poDpAmount !== undefined && (t.poTotalAmount || t.amount) - t.poDpAmount > 0) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                          DP: {formatCurrency(t.poDpAmount)}
                        </div>
                      )}
                    </td>
                    <td>
                      {t.poStatus === 'pending' ? (
                        <span className="badge" style={{ background: 'var(--color-warning)', color: '#fff' }}><Clock size={12} style={{ display: 'inline', marginRight: 4 }} /> Menunggu</span>
                      ) : (
                        <span className="badge" style={{ background: '#22C55E', color: '#fff' }}><CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} /> Selesai</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        {t.poStatus === 'pending' && (
                          <button className="btn-icon" onClick={() => handleCompletePO(t)} title="Tandai Selesai" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        <button className="btn-icon" onClick={() => handleChat(t)} title="Hubungi WA" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                          <MessageCircle size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {settleModal.isOpen && settleModal.tx && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="text-xl font-bold">Pelunasan PO</h3>
              <button onClick={() => setSettleModal({ ...settleModal, isOpen: false })} className="btn-icon"><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem', background: 'var(--color-surface-alt)', padding: '1rem', borderRadius: '8px' }}>
                <p className="text-sm text-secondary" style={{ marginBottom: '0.25rem' }}>Pelanggan:</p>
                <p className="font-bold">{settleModal.tx.customerName || 'Umum'}</p>
                <div style={{ marginTop: '0.75rem' }}>
                  <p className="text-sm text-secondary" style={{ marginBottom: '0.25rem' }}>Sisa Tagihan:</p>
                  <p className="font-black text-xl text-primary">{formatCurrency(settleModal.sisa)}</p>
                </div>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Metode Pembayaran</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {['Tunai', 'QRIS', 'Transfer'].map(method => (
                    <button
                      key={method}
                      onClick={() => setSettleModal({ ...settleModal, paymentMethod: method })}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: `2px solid ${settleModal.paymentMethod === method ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: settleModal.paymentMethod === method ? 'rgba(236, 72, 153, 0.1)' : 'var(--color-surface)',
                        color: settleModal.paymentMethod === method ? 'var(--color-primary)' : 'var(--color-text)',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
              
              {settleModal.paymentMethod === 'QRIS' && qrisString && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
                  <div style={{ padding: '1rem', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <QRCodeSVG 
                      value={generateDynamicQRIS(qrisString, settleModal.sisa)} 
                      size={180}
                      level="M" 
                      includeMargin={false}
                      style={{ display: 'block', borderRadius: '8px' }}
                    />
                  </div>
                  <p className="text-sm text-secondary" style={{ marginTop: '0.75rem', textAlign: 'center', fontWeight: 600 }}>
                    Scan QRIS untuk membayar Rp {settleModal.sisa.toLocaleString('id-ID')}
                  </p>
                </div>
              )}
              {settleModal.paymentMethod === 'QRIS' && !qrisString && (
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: '8px', fontSize: '0.875rem', textAlign: 'center' }}>
                  String QRIS belum diatur di menu Setelan.
                </div>
              )}
              
              <button className="btn btn-primary w-full" onClick={confirmSettle}>
                Tandai Lunas & Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POList;
