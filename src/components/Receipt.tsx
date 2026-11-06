import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, safeFormatDate } from '../utils/format';
import { supabase } from '../lib/supabase';
import { Printer, X } from 'lucide-react';

interface ReceiptProps {
  transaction: any;
  showPreviewModal?: boolean;
  onClosePreview?: () => void;
}

export function ReceiptInner({ transaction, storeInfo }: { transaction: any; storeInfo: any }) {
  if (!transaction) return null;

  return (
    <>
      <div className="receipt-header">
        {storeInfo.logoUrl && (
          <img 
            src={storeInfo.logoUrl} 
            alt="Store Logo" 
            style={{ 
              maxWidth: '60%', 
              maxHeight: '80px', 
              objectFit: 'contain', 
              margin: '0 auto 10px', 
              display: 'block' 
            }} 
          />
        )}
        <h2 className="receipt-shop-name">{storeInfo.shopName}</h2>
        {storeInfo.address && <p className="receipt-address">{storeInfo.address}</p>}
        {storeInfo.phone && <p className="receipt-phone">{storeInfo.phone}</p>}
      </div>

      <div className="receipt-divider">--------------------------------</div>
      
      <div className="receipt-meta">
        <div><span>Tgl:</span> <span>{safeFormatDate(transaction?.date, 'dd/MM/yy HH:mm')}</span></div>
        <div><span>Trx:</span> <span>{transaction.transactionId}</span></div>
        <div><span>Ksr:</span> <span>Kasir</span></div>
        {transaction.customerName && (
          <div><span>Plg:</span> <span>{transaction.customerName}</span></div>
        )}
      </div>

      <div className="receipt-divider">--------------------------------</div>

      <div className="receipt-items">
        {(transaction.items || []).map((item: any, idx: number) => {
          const addOnTotal = item.addOns?.reduce((s: number, a: any) => s + a.price, 0) || 0;
          const extrasTotal = item.extras?.reduce((s: number, e: any) => s + (e.pricePerUnit * e.quantity), 0) || 0;
          const basePrice = (item.product?.price || 0) + addOnTotal + extrasTotal;
          const pricePerItem = item.customUnitPrice !== undefined ? item.customUnitPrice : basePrice;
          const lineTotal = pricePerItem * (item.quantity || 1);
          
          return (
            <div key={idx} className="receipt-item">
              <div className="receipt-item-name">{item.product?.name || item.name || 'Produk'}</div>
              {item.note && (
                <div className="receipt-item-sub" style={{ fontStyle: 'italic' }}>Catatan: {item.note}</div>
              )}
              {item.addOns?.map((a: any, i: number) => (
                <div key={`addon-${i}`} className="receipt-item-sub">+ {a.name}</div>
              ))}
              {item.extras?.map((e: any, i: number) => (
                <div key={`extra-${i}`} className="receipt-item-sub">✦ {e.name} {e.quantity}{e.unit}</div>
              ))}
              <div className="receipt-item-calc">
                <span>{item.quantity} x {formatCurrency(pricePerItem)}</span>
                <span>{formatCurrency(lineTotal)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="receipt-divider">--------------------------------</div>

      <div className="receipt-totals">
        <div className="receipt-total-row">
          <span>Total:</span>
          <span>{formatCurrency(transaction.total)}</span>
        </div>
        <div className="receipt-total-row" style={{ fontSize: '11px', fontWeight: 'normal', color: '#555' }}>
          <span>Pembayaran:</span>
          <span>{transaction.paymentMethod}</span>
        </div>
      </div>

      {transaction.poStatus && (
        <>
          <div className="receipt-divider">--------------------------------</div>
          <div className="receipt-meta">
            <div><span>Jenis:</span> <span>PRE-ORDER (PO)</span></div>
            {transaction.poPickupDate && (
              <div><span>Ambil:</span> <span>{safeFormatDate(transaction.poPickupDate, 'dd/MM/yyyy')}</span></div>
            )}
            {transaction.poTotalAmount !== undefined && (
              <div><span>Total PO:</span> <span>{formatCurrency(transaction.poTotalAmount)}</span></div>
            )}
            {transaction.poDpAmount !== undefined && (
              <div><span>DP Masuk:</span> <span>{formatCurrency(transaction.poDpAmount)}</span></div>
            )}
            {transaction.poTotalAmount !== undefined && transaction.poDpAmount !== undefined && (
              <div style={{ fontWeight: 'bold' }}><span>Sisa Tagihan:</span> <span>{formatCurrency(Math.max(0, transaction.poTotalAmount - transaction.poDpAmount))}</span></div>
            )}
          </div>
        </>
      )}

      <div className="receipt-divider">================================</div>

      {storeInfo.footer && (
        <div className="receipt-footer" style={{ whiteSpace: 'pre-line' }}>
          {storeInfo.footer}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '9px', color: '#888', fontStyle: 'italic' }}>
        Made by Vrimae.com
      </div>
    </>
  );
}

export default function Receipt({ transaction, showPreviewModal, onClosePreview }: ReceiptProps) {
  const [storeInfo, setStoreInfo] = useState({
    shopName: 'Vrimae Store',
    address: '',
    phone: '',
    footer: 'Terima Kasih Atas Kunjungan Anda\nBarang yang sudah dibeli tidak dapat ditukar',
    logoUrl: null as string | null,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) {
        setStoreInfo({
          shopName: user.user_metadata.shop_name || 'Vrimae Store',
          address: user.user_metadata.receipt_address || '',
          phone: user.user_metadata.phone || '',
          footer: user.user_metadata.receipt_footer || 'Terima Kasih Atas Kunjungan Anda\nBarang yang sudah dibeli tidak dapat ditukar',
          logoUrl: user.user_metadata.avatar_url || null,
        });
      }
    });
  }, []);

  if (!transaction) return null;

  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.error('Print error:', err);
    }
  };

  return (
    <>
      {/* Komponen Cetak Struk (Disisipkan langsung ke document.body via Portal) */}
      {createPortal(
        <div className="print-receipt">
          <ReceiptInner transaction={transaction} storeInfo={storeInfo} />
        </div>,
        document.body
      )}

      {/* Modal Preview Struk di Layar (HP & Laptop) */}
      {showPreviewModal && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={onClosePreview}
        >
          <div 
            className="modal-content"
            style={{ 
              maxWidth: '380px', 
              width: '100%', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column',
              padding: '1.25rem',
              borderRadius: '16px'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem' }}>
                <Printer size={18} className="text-primary" />
                <span>Pratinjau Struk</span>
              </div>
              <button 
                onClick={onClosePreview} 
                className="btn-icon"
                style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Simulated thermal receipt paper */}
            <div 
              style={{ 
                flex: 1, 
                overflowY: 'auto', 
                background: '#fff', 
                color: '#000', 
                padding: '16px', 
                borderRadius: '8px',
                boxShadow: 'inset 0 0 8px rgba(0,0,0,0.06), 0 2px 10px rgba(0,0,0,0.08)',
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: '12px',
                lineHeight: 1.3
              }}
            >
              <ReceiptInner transaction={transaction} storeInfo={storeInfo} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button 
                className="btn btn-outline" 
                onClick={onClosePreview}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', fontWeight: 600 }}
              >
                Tutup
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handlePrint}
                style={{ flex: 1.5, padding: '0.75rem', borderRadius: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <Printer size={18} />
                <span>Cetak Struk</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}