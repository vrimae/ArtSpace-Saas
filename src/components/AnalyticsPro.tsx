import { useState, useEffect } from 'react';
import { checkAnalyticsAccess, getTransactions, getInventory } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { Crown, Lock, TrendingUp, PackageOpen, ArrowDownRight, ArrowUpRight, ArrowRight, Wallet, Calendar, ChevronDown, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Transaction, InventoryItem } from '../types';
import { format, subDays, isAfter, startOfDay, isSameDay, startOfMonth, endOfMonth, subMonths, isSameMonth, startOfYear, endOfYear, subYears, isSameYear, parseISO, getWeekOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
};

const formatShortCurrency = (val: number) => {
  if (val >= 1000000) return `Rp${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `Rp${(val / 1000).toFixed(0)}k`;
  return `Rp${val}`;
};

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

type TimeFilter = 'today' | '7days' | 'month' | 'year';

const AnalyticsPro = () => {
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7days');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const proStatus = await checkAnalyticsAccess();
        setIsPro(proStatus);
        
        if (proStatus) {
          const fetchInitial = async () => {
            const [txs, inv] = await Promise.all([
              getTransactions(),
              getInventory()
            ]);
            setAllTransactions(txs);
            setInventory(inv);
          };
          
          await fetchInitial();

          const subscription = supabase
            .channel('public:transactions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
              getTransactions().then(setAllTransactions);
            })
            .subscribe();

          setLoading(false);

          return () => {
            supabase.removeChannel(subscription);
          };
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading analytics:", error);
        setLoading(false);
      }
    };
    
    const cleanup = init();
    return () => {
      cleanup.then(cleanFn => {
        if (typeof cleanFn === 'function') cleanFn();
      });
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="fade-in" style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <Lock size={36} style={{ color: '#F59E0B' }} />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
          Analitik Pro <Crown size={28} style={{ color: '#F59E0B' }} />
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '500px', marginBottom: '2rem', lineHeight: 1.6 }}>
          Fitur ini terkunci. Pantau kesehatan bisnis Anda secara visual dengan grafik interaktif dan laporan mendalam.
        </p>
      </div>
    );
  }

  // --- Filtering Logic ---
  const now = new Date();
  let currentTransactions: Transaction[] = [];
  let previousTransactions: Transaction[] = [];
  let trendData: any[] = [];
  let trendTitle = '';

  if (timeFilter === 'today') {
    trendTitle = 'Tren Pendapatan (Hari Ini vs Kemarin)';
    currentTransactions = allTransactions.filter(t => isSameDay(parseISO(t.date), now));
    previousTransactions = allTransactions.filter(t => isSameDay(parseISO(t.date), subDays(now, 1)));
    
    // For today, trend data shows cumulative income by hour
    trendData = Array.from({ length: 24 }, (_, i) => ({
      displayDate: `${i.toString().padStart(2, '0')}:00`,
      income: 0,
      kemarin: 0
    }));

    currentTransactions.filter(t => t.type === 'income').forEach(t => {
      const hour = parseISO(t.date).getHours();
      trendData[hour].income += t.amount;
    });
    
    previousTransactions.filter(t => t.type === 'income').forEach(t => {
      const hour = parseISO(t.date).getHours();
      trendData[hour].kemarin += t.amount;
    });

    let cumToday = 0;
    let cumYesterday = 0;
    const currentHour = now.getHours();

    for (let i = 0; i < 24; i++) {
      cumToday += trendData[i].income;
      cumYesterday += trendData[i].kemarin;
      
      trendData[i].kemarin = cumYesterday;
      if (i <= currentHour) {
        trendData[i].income = cumToday;
      } else {
        trendData[i].income = null;
      }
    }
  } else if (timeFilter === '7days') {
    trendTitle = 'Tren Pendapatan (7 Hari Terakhir)';
    const sevenDaysAgo = startOfDay(subDays(now, 6));
    const fourteenDaysAgo = startOfDay(subDays(now, 13));
    
    currentTransactions = allTransactions.filter(t => isAfter(parseISO(t.date), sevenDaysAgo) || isSameDay(parseISO(t.date), sevenDaysAgo));
    previousTransactions = allTransactions.filter(t => (isAfter(parseISO(t.date), fourteenDaysAgo) || isSameDay(parseISO(t.date), fourteenDaysAgo)) && !isAfter(parseISO(t.date), sevenDaysAgo) && !isSameDay(parseISO(t.date), sevenDaysAgo));

    trendData = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      return { dateStr: format(d, 'yyyy-MM-dd'), displayDate: format(d, 'dd MMM', { locale: id }), income: 0 };
    });
    currentTransactions.filter(t => t.type === 'income').forEach(t => {
      const txDateStr = format(parseISO(t.date), 'yyyy-MM-dd');
      const day = trendData.find(d => d.dateStr === txDateStr);
      if (day) day.income += t.amount;
    });
  } else if (timeFilter === 'month') {
    trendTitle = 'Tren Pendapatan (Bulan Ini)';
    const startOfPrevMonth = startOfMonth(subMonths(now, 1));
    const endOfPrevMonth = endOfMonth(subMonths(now, 1));

    currentTransactions = allTransactions.filter(t => isSameMonth(parseISO(t.date), now));
    previousTransactions = allTransactions.filter(t => isAfter(parseISO(t.date), startOfPrevMonth) && !isAfter(parseISO(t.date), endOfPrevMonth));

    // Group by weeks for month
    trendData = [
      { displayDate: 'M1', income: 0 }, { displayDate: 'M2', income: 0 }, { displayDate: 'M3', income: 0 }, { displayDate: 'M4', income: 0 }, { displayDate: 'M5', income: 0 }
    ];
    currentTransactions.filter(t => t.type === 'income').forEach(t => {
      const week = getWeekOfMonth(parseISO(t.date)); // 1 to 5
      if (week >= 1 && week <= 5) {
        trendData[week - 1].income += t.amount;
      }
    });
  } else if (timeFilter === 'year') {
    trendTitle = 'Tren Pendapatan (Tahun Ini)';
    const startOfPrevYear = startOfYear(subYears(now, 1));
    const endOfPrevYear = endOfYear(subYears(now, 1));

    currentTransactions = allTransactions.filter(t => isSameYear(parseISO(t.date), now));
    previousTransactions = allTransactions.filter(t => isAfter(parseISO(t.date), startOfPrevYear) && !isAfter(parseISO(t.date), endOfPrevYear));

    trendData = Array.from({ length: 12 }, (_, i) => ({
      monthIdx: i, displayDate: format(new Date(now.getFullYear(), i, 1), 'MMM', { locale: id }), income: 0
    }));
    currentTransactions.filter(t => t.type === 'income').forEach(t => {
      const m = parseISO(t.date).getMonth();
      trendData[m].income += t.amount;
    });
  }

  // --- Calculate Metrics ---
  const totalIncome = currentTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = currentTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const prevTotalIncome = previousTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  
  // Growth Calculation
  let growthPercent = 0;
  if (prevTotalIncome > 0) {
    growthPercent = ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100;
  } else if (totalIncome > 0) {
    growthPercent = 100; // 100% growth if prev was 0 and now we have income
  }
  
  let growthText = 'Sama';
  let growthColor = 'var(--color-text-secondary)';
  let GrowthIcon = ArrowRight;
  if (growthPercent > 0) {
    growthText = `Naik ${Math.abs(growthPercent).toFixed(1)}%`;
    growthColor = '#10B981';
    GrowthIcon = ArrowUpRight;
  } else if (growthPercent < 0) {
    growthText = `Turun ${Math.abs(growthPercent).toFixed(1)}%`;
    growthColor = '#EF4444';
    GrowthIcon = ArrowDownRight;
  }
  
  let growthComparisonText = '';
  if (timeFilter === 'today') growthComparisonText = 'dibanding kemarin';
  if (timeFilter === '7days') growthComparisonText = 'dibanding minggu lalu';
  if (timeFilter === 'month') growthComparisonText = 'dibanding bulan lalu';
  if (timeFilter === 'year') growthComparisonText = 'dibanding tahun lalu';

  // --- Top Products Logic ---
  // Parse descriptions: "[Tunai] Pesanan: Budi - Kopi Aren (+Boba) (2x), Matcha (1x)"
  const productMap: Record<string, number> = {};
  currentTransactions.filter(t => t.type === 'income').forEach(t => {
    const parts = t.description.split(' - ');
    if (parts.length > 1) {
      const itemsStr = parts.slice(1).join(' - ');
      const regex = /(.*?)\s*\((\d+)x\)(?:,\s*|$)/g;
      let match;
      while ((match = regex.exec(itemsStr)) !== null) {
        let namePart = match[1].trim();
        // Remove addons and extras formatting like (+Boba) or (?Es Sedikit)
        namePart = namePart.replace(/\s*\(\+[^)]+\)/g, '').replace(/\s*\(\?[^)]+\)/g, '').trim();
        const qty = parseInt(match[2], 10);
        if (!isNaN(qty) && namePart) {
          productMap[namePart] = (productMap[namePart] || 0) + qty;
        }
      }
    }
  });
  
  const topProducts = Object.entries(productMap)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // --- Top Customers Logic ---
  const customerMap: Record<string, number> = {};
  currentTransactions.filter(t => t.type === 'income').forEach(t => {
    // Expected format: "[Tunai] Pesanan: Nama Pelanggan - Produk..."
    const match = t.description.match(/Pesanan:\s*(.*?)\s*-/);
    if (match && match[1]) {
      const customerName = match[1].trim();
      if (customerName && customerName.toLowerCase() !== 'umum') {
        // Count frequency of transactions
        customerMap[customerName] = (customerMap[customerName] || 0) + 1;
      }
    }
  });

  const topCustomers = Object.entries(customerMap)
    .map(([name, orderCount]) => ({ name, orderCount }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5);

  const inventoryValue = inventory.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  const pieData = [
    { name: 'Pemasukan', value: totalIncome },
    { name: 'Pengeluaran', value: totalExpense }
  ];

  return (
    <div className="fade-in" style={{ padding: '1rem 0 3rem' }}>
      
      {/* Header & Filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <TrendingUp size={28} style={{ color: '#10B981' }} /> Analitik Pro <Crown size={22} style={{ color: '#F59E0B' }} />
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Pantau kesehatan bisnis Anda secara visual
          </p>
        </div>
        
        {/* Time Filter Dropdown */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', 
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', 
              padding: '0.5rem 1rem', borderRadius: '10px', color: 'var(--color-text)', 
              fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
              minWidth: '170px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
              {timeFilter === 'today' ? 'Hari Ini' : timeFilter === '7days' ? '7 Hari Terakhir' : timeFilter === 'month' ? 'Bulan Ini' : 'Tahun Ini'}
            </div>
            <ChevronDown size={16} />
          </button>
          
          {showFilterDropdown && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowFilterDropdown(false)} />
              <div style={{ 
                position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem', 
                background: 'var(--color-surface)', border: '1px solid var(--color-border)', 
                borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                zIndex: 10, minWidth: '100%', overflow: 'hidden' 
              }}>
              {[
                { id: 'today', label: 'Hari Ini' },
                { id: '7days', label: '7 Hari Terakhir' },
                { id: 'month', label: 'Bulan Ini' },
                { id: 'year', label: 'Tahun Ini' }
              ].map(f => (
                <div 
                  key={f.id}
                  onClick={() => { setTimeFilter(f.id as TimeFilter); setShowFilterDropdown(false); }}
                  style={{ 
                    padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem', 
                    background: timeFilter === f.id ? 'var(--color-primary-lighter)' : 'transparent',
                    color: timeFilter === f.id ? 'var(--color-primary)' : 'var(--color-text)',
                    fontWeight: timeFilter === f.id ? 700 : 500
                  }}
                >
                  {f.label}
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="analytics-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        
        {/* Net Profit Card - Golden */}
        <div style={{ background: 'linear-gradient(135deg, #FDE68A, #F59E0B)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(245, 158, 11, 0.2)', border: 'none', color: '#78350F' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 700, opacity: 0.9 }}>
            <div style={{ background: 'rgba(255,255,255,0.3)', padding: '4px', borderRadius: '6px' }}><Wallet size={16} /></div>
            Estimasi Laba Bersih
          </div>
          <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 900, marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatCurrency(netProfit)}
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.8 }}>
            Total Pendapatan - Total Pengeluaran
          </div>
        </div>

        {/* Total Income with Growth Badge */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
            <div style={{ background: 'var(--color-income-bg)', color: 'var(--color-income)', padding: '4px', borderRadius: '6px' }}><span style={{ fontWeight: 800, fontSize: '0.9rem', padding: '0 2px' }}>Rp</span></div>
            Pendapatan Kotor
          </div>
          <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatCurrency(totalIncome)}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: growthColor, fontWeight: 700 }}>
            <GrowthIcon size={14} strokeWidth={3} /> {growthText} <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{growthComparisonText}</span>
          </div>
        </div>

        {/* Total Expense */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
            <div style={{ background: 'var(--color-expense-bg)', color: 'var(--color-expense)', padding: '4px', borderRadius: '6px' }}><ArrowDownRight size={16} /></div>
            Pengeluaran Total
          </div>
          <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatCurrency(totalExpense)}
          </div>
        </div>

        {/* Inventory Value */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
            <div style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '4px', borderRadius: '6px' }}><PackageOpen size={16} /></div>
            Nilai Aset (Inventori)
          </div>
          <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatCurrency(inventoryValue)}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="analytics-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', width: '100%', overflow: 'hidden' }}>
        
        {/* Line Chart */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--color-text)' }}>{trendTitle}</h3>
          <div style={{ height: 300, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} dy={10} />
                <YAxis tickFormatter={formatShortCurrency} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} dx={-10} width={60} />
                <RechartsTooltip 
                  formatter={(value: any, name: any) => [formatCurrency(Number(value)), name === 'income' ? 'Pendapatan' : 'Kemarin']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border-light)', background: 'var(--color-surface)' }}
                  itemStyle={{ fontWeight: 700 }}
                  labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: '4px' }}
                />
                <Line type="monotone" dataKey="income" name="income" stroke="#10B981" strokeWidth={4} dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} animationDuration={1000} connectNulls />
                {timeFilter === 'today' && (
                  <Line type="monotone" dataKey="kemarin" name="kemarin" stroke="var(--color-text-secondary)" strokeDasharray="5 5" strokeWidth={2} dot={false} activeDot={false} animationDuration={1000} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Products Bar Chart */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--color-text)' }}>Top 5 Produk Terlaris ({timeFilter === 'today' ? 'Hari Ini' : timeFilter === '7days' ? '7 Hari Terakhir' : timeFilter === 'month' ? 'Bulan Ini' : 'Tahun Ini'})</h3>
          <div style={{ width: '100%' }}>
            {topProducts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                {topProducts.map((p, index) => (
                  <div key={index}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)' }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }}>{p.name}</span>
                      <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>{p.qty} Item</span>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: 'var(--color-bg)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${(p.qty / topProducts[0].qty) * 100}%`, height: '100%', background: COLORS[index % COLORS.length], borderRadius: '6px', transition: 'width 1s ease-out' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: '0.9rem', padding: '2rem 0' }}>
                Belum ada produk terjual di periode ini.
              </div>
            )}
          </div>
        </div>

        {/* Donut Chart */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--color-text)', textAlign: 'center' }}>Pemasukan vs Pengeluaran</h3>
          <div style={{ height: 220, width: '100%', WebkitTapHighlightColor: 'transparent' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart style={{ WebkitTapHighlightColor: 'transparent', outline: 'none' }}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  animationDuration={1000}
                >
                  <Cell fill="#10B981" />
                  <Cell fill="#EF4444" />
                </Pie>
                <RechartsTooltip 
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Total']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border-light)', background: 'var(--color-surface)', padding: '10px' }}
                  itemStyle={{ color: 'var(--color-text)', fontWeight: 600 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }}></div> Pemasukan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }}></div> Pengeluaran
            </div>
          </div>
        </div>

        {/* Top 5 Customers Bar Chart */}
        <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-light)', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} style={{ color: '#3B82F6' }} /> Top 5 Pelanggan
          </h3>
          <div style={{ width: '100%' }}>
            {topCustomers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                {topCustomers.map((c, index) => (
                  <div key={index}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)' }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }}>{c.name}</span>
                      <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>{c.orderCount} Pesanan</span>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: 'var(--color-bg)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${(c.orderCount / topCustomers[0].orderCount) * 100}%`, height: '100%', background: COLORS[(index + 2) % COLORS.length], borderRadius: '6px', transition: 'width 1s ease-out' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: '0.9rem', padding: '2rem 0' }}>
                Belum ada data pelanggan di periode ini.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPro;
