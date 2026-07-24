import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Package, Wallet } from 'lucide-react';
import { getTransactions, getInventory, getFinancialSummary } from '../utils/storage';
import type { Transaction, InventoryItem } from '../types';
import { format } from 'date-fns';

const Dashboard = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [financialSummary, setFinancialSummary] = useState({ total_income: 0, total_expense: 0, balance: 0, month_income: 0, today_income: 0 });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [tx, inv, summary] = await Promise.all([
        getTransactions(50), 
        getInventory(),
        getFinancialSummary()
      ]);
      setTransactions(tx);
      setInventory(inv);
      setFinancialSummary(summary);
      
      setLoading(false);
    };
    fetchData();
  }, []);

  const totalIncome = financialSummary.total_income;
  const totalExpense = financialSummary.total_expense;
  const netProfit = financialSummary.balance;

  const monthIncome = financialSummary.month_income;
  const todayIncome = financialSummary.today_income;
  const lowStockItems = inventory.filter(i => i.quantity < 10).length;

  const formatCurrency = (amount: number) => {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  if (loading) {
    return <div className="loading-spinner" />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Ringkasan performa bisnis Anda</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="stat-icon" style={{ background: 'var(--color-primary-lighter)', color: 'var(--color-primary)' }}><Wallet size={20} /></div>
            <div className="stat-label" style={{ margin: 0 }}>Total Pendapatan</div>
          </div>
          <div className="stat-value" style={{ color: '#10B981' }}>{formatCurrency(totalIncome)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="stat-icon" style={{ background: 'var(--color-expense-bg)', color: 'var(--color-expense)' }}><TrendingDown size={20} /></div>
            <div className="stat-label" style={{ margin: 0 }}>Total Pengeluaran</div>
          </div>
          <div className="stat-value" style={{ color: '#EF4444' }}>{formatCurrency(totalExpense)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="stat-icon" style={{ background: 'var(--color-income-bg)', color: 'var(--color-income)' }}><TrendingUp size={20} /></div>
            <div className="stat-label" style={{ margin: 0 }}>Keuntungan Bersih</div>
          </div>
          <div className="stat-value">{formatCurrency(netProfit)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="stat-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}><Package size={20} /></div>
            <div className="stat-label" style={{ margin: 0 }}>Stok Menipis</div>
          </div>
          <div className="stat-value">{lowStockItems}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><span style={{ fontWeight: 800, fontSize: '1.1rem', paddingRight: '2px' }}>Rp</span> Penjualan Terkini</h2>
          <div style={{ display: 'flex', gap: '1rem', padding: '0.875rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', marginBottom: '1.25rem' }}>
            <div style={{ flex: 1 }}>
              <div className="text-xs text-secondary font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Hari Ini</div>
              <div className="font-bold text-lg text-primary">{formatCurrency(todayIncome)}</div>
            </div>
            <div style={{ width: '1px', background: 'var(--color-border)' }} />
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div className="text-xs text-secondary font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Bulan Ini</div>
              <div className="font-bold text-lg">{formatCurrency(monthIncome)}</div>
            </div>
          </div>
          
          <h3 className="font-bold text-sm mb-4 text-secondary">5 Transaksi Terakhir</h3>
          <div className="table-container">
            <table>
              <tbody>
                {transactions.slice(0, 5).map(t => (
                  <tr key={t.id}>
                    <td className="text-sm text-secondary">{format(new Date(t.date), 'dd MMM')}</td>
                    <td className="text-sm" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                    <td className={`font-bold text-right text-sm ${t.type === 'income' ? 'text-income' : 'text-expense'}`} style={{ whiteSpace: 'nowrap' }}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && <tr><td colSpan={3} className="text-center text-muted p-4 text-sm">Belum ada transaksi</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Package size={18} /> Ringkasan Inventori</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Barang</th>
                  <th style={{ textAlign: 'center' }}>Sisa</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.slice(0, 8).map(i => (
                  <tr key={i.id}>
                    <td className="text-sm font-semibold">{i.name}</td>
                    <td className="text-center font-bold">{i.quantity}</td>
                    <td>
                      {i.quantity < 10 
                        ? <span className="badge badge-expense">Menipis</span> 
                        : <span className="badge badge-income">Aman</span>}
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 && <tr><td colSpan={3} className="text-center text-muted p-4 text-sm">Belum ada inventori</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
