import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { formatCurrency } from '../utils/format';
import { supabase } from '../lib/supabase';

export default function Receipt({ transaction }: { transaction: any }) {
  const [storeInfo, setStoreInfo] = useState({
    shopName: 'Vrimae Store',
    address: 'Jl. Contoh Alamat No. 123',
    phone: 'Telp: 0812-3456-7890',
    footer: 'Terima Kasih Atas Kunjungan Anda\nBarang yang sudah dibeli tidak dapat ditukar',
    logoUrl: null as string | null,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) {
        setStoreInfo({
          shopName: user.user_metadata.shop_name || 'Vrimae Store',
          address: user.user_metadata.receipt_address || 'Jl. Contoh Alamat No. 123',
          phone: user.user_metadata.phone || 'Telp: 0812-3456-7890',
          footer: user.user_metadata.receipt_footer || 'Terima Kasih Atas Kunjungan Anda\nBarang yang sudah dibeli tidak dapat ditukar',
          logoUrl: user.user_metadata.avatar_url || null,
        });
      }
    });
  }, []);

  if (!transaction) return null;

  return createPortal(
    <div className="print-receipt">
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
        <p className="receipt-address">{storeInfo.address}</p>
        <p className="receipt-phone">{storeInfo.phone}</p>
      </div>

      <div className="receipt-divider">--------------------------------</div>
      
      <div className="receipt-meta">
        <div><span>Tgl:</span> <span>{format(new Date(transaction.date), 'dd/MM/yy HH:mm')}</span></div>
        <div><span>Trx:</span> <span>{transaction.transactionId}</span></div>
        <div><span>Ksr:</span> <span>Kasir</span></div>
        {transaction.customerName && (
          <div><span>Plg:</span> <span>{transaction.customerName}</span></div>
        )}
      </div>

      <div className="receipt-divider">--------------------------------</div>

      <div className="receipt-items">
        {transaction.items.map((item: any, idx: number) => {
          const addOnTotal = item.addOns?.reduce((s: number, a: any) => s + a.price, 0) || 0;
          const extrasTotal = item.extras?.reduce((s: number, e: any) => s + (e.pricePerUnit * e.quantity), 0) || 0;
          const pricePerItem = item.product.price + addOnTotal + extrasTotal;
          const lineTotal = pricePerItem * item.quantity;
          
          return (
            <div key={idx} className="receipt-item">
              <div className="receipt-item-name">{item.product.name}</div>
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

      <div className="receipt-divider">================================</div>

      <div className="receipt-footer" style={{ whiteSpace: 'pre-line' }}>
        {storeInfo.footer}
      </div>

      <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '9px', color: '#888', fontStyle: 'italic' }}>
        Made by Vrimae.com
      </div>
    </div>,
    document.body
  );
}
