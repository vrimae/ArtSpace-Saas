import * as XLSX from 'xlsx';
import { formatCurrency } from './format';

// ── Helpers ──
const autoSizeCols = (data: any[], headers: string[]) => {
  return headers.map(key => {
    let maxLength = key.length;
    data.forEach(row => {
      const val = row[key];
      if (val !== null && val !== undefined) {
        const strVal = String(val);
        if (strVal.length > maxLength) maxLength = strVal.length;
      }
    });
    return { wch: Math.min(maxLength + 4, 50) };
  });
};


// ═══════════════════════════════════════════════════════════
// Simple CSV export
// ═══════════════════════════════════════════════════════════
export const exportToCSV = (filename: string, data: any[]) => {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(obj =>
    Object.values(obj).map(val => `"${val}"`).join(',')
  ).join('\n');
  const csvContent = `${headers}\n${rows}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
};

// ═══════════════════════════════════════════════════════════
// Simple export (for Inventory page)
// ═══════════════════════════════════════════════════════════
export const exportToExcel = (filename: string, data: any[]) => {
  if (data.length === 0) return;
  const formattedData = data.map(row => {
    const newRow: any = { ...row };
    if (newRow.unitPrice) newRow.unitPrice = formatCurrency(newRow.unitPrice);
    if (newRow.totalPrice) newRow.totalPrice = formatCurrency(newRow.totalPrice);
    return newRow;
  });
  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const keys = Object.keys(formattedData[0]);
  worksheet['!cols'] = autoSizeCols(formattedData, keys);
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

// ═══════════════════════════════════════════════════════════
// Advanced multi-sheet export (for Finance page)
// ═══════════════════════════════════════════════════════════
export const exportToExcelAdvanced = (
  filename: string,
  transactions: any[],
  products: { id: string; name: string; price: number; category: string }[]
) => {
  if (transactions.length === 0) return;

  const workbook = XLSX.utils.book_new();

  // ── Parse shared data ──
  const salesTx = transactions.filter(t => t.tipe === 'income');

  // Menu sales parsing
  const menuSales: Record<string, { qty: number; revenue: number; category: string }> = {};
  for (const tx of salesTx) {
    const desc = tx.description || '';
    for (const product of products) {
      const escaped = product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}(?:\\s*\\([^)]*\\))*\\s*\\((\\d+)x\\)`, 'g');
      let match;
      while ((match = regex.exec(desc)) !== null) {
        const qty = parseInt(match[1]) || 1;
        if (!menuSales[product.name]) menuSales[product.name] = { qty: 0, revenue: 0, category: product.category };
        menuSales[product.name].qty += qty;
        menuSales[product.name].revenue += qty * product.price;
      }
    }
  }
  const menuRanking = Object.entries(menuSales).sort((a, b) => b[1].qty - a[1].qty);
  const totalSold = menuRanking.reduce((s, [, v]) => s + v.qty, 0);

  // Customer parsing
  const customers: Record<string, { orders: number; spent: number; favMenus: Record<string, number>; lastVisit: string }> = {};
  for (const tx of salesTx) {
    const name = tx['nama pelanggan'] || '-';
    if (name === '-') continue;
    if (!customers[name]) customers[name] = { orders: 0, spent: 0, favMenus: {}, lastVisit: tx.date };
    customers[name].orders += 1;
    customers[name].spent += tx.amount;
    if (tx.date > customers[name].lastVisit) customers[name].lastVisit = tx.date;
    for (const p of products) {
      if ((tx.description || '').includes(p.name)) {
        customers[name].favMenus[p.name] = (customers[name].favMenus[p.name] || 0) + 1;
      }
    }
  }
  const custRanking = Object.entries(customers).sort((a, b) => b[1].orders - a[1].orders);

  // ═══════════════════════════════════════════════════
  // SHEET 1: Riwayat Transaksi
  // ═══════════════════════════════════════════════════
  const ws1Data = transactions.map((t, idx) => ({
    'No': idx + 1,
    'Tanggal': t.date,
    'Tipe': t.tipe === 'income' ? 'Pemasukan' : 'Pengeluaran',
    'Metode Pembayaran': t['metode pembayaran'] || '-',
    'Kategori': t.category,
    'Deskripsi': t.description,
    'Nama Pelanggan': t['nama pelanggan'] || '-',
    'Kategori Menu': t['category menu'] || '-',
    'Jumlah (Rp)': formatCurrency(t.amount),
  }));
  
  const ws1 = XLSX.utils.json_to_sheet(ws1Data);
  ws1['!cols'] = autoSizeCols(ws1Data, Object.keys(ws1Data[0]));
  XLSX.utils.book_append_sheet(workbook, ws1, "Riwayat Transaksi");

  // ═══════════════════════════════════════════════════
  // SHEET 2: Analisis Menu
  // ═══════════════════════════════════════════════════
  const menuRows = menuRanking.map(([name, data], idx) => {
    const catLabel = data.category === 'water_based' ? 'Water Based' : data.category === 'milk_based' ? 'Milk Based' : 'Lainnya';
    const pct = totalSold > 0 ? ((data.qty / totalSold) * 100).toFixed(1) + '%' : '0%';
    return [idx + 1, name, catLabel, data.qty, formatCurrency(data.revenue), pct];
  });
  
  menuRows.push(['', 'TOTAL', '', totalSold, formatCurrency(menuRanking.reduce((s, [, v]) => s + v.revenue, 0)), '100%']);
  
  // Data for Pie Chart (Category Sales)
  const catSales: Record<string, { qty: number; revenue: number }> = {};
  menuRanking.forEach(([, data]) => {
    const catLabel = data.category === 'water_based' ? 'Water Based' : data.category === 'milk_based' ? 'Milk Based' : 'Lainnya';
    if (!catSales[catLabel]) catSales[catLabel] = { qty: 0, revenue: 0 };
    catSales[catLabel].qty += data.qty;
    catSales[catLabel].revenue += data.revenue;
  });

  const catRows = Object.entries(catSales).sort((a, b) => b[1].qty - a[1].qty).map(([cat, data]) => {
    const pct = totalSold > 0 ? ((data.qty / totalSold) * 100).toFixed(1) + '%' : '0%';
    return [cat, data.qty, formatCurrency(data.revenue), pct];
  });

  const ws2Data = [
    ['📊 ANALISIS PENJUALAN MENU'],
    ['(Pilih tabel ini di Excel lalu Insert -> Chart -> Bar Chart)'],
    [],
    ['Peringkat', 'Nama Menu', 'Kategori', 'Jumlah Terjual', 'Pendapatan (Rp)', 'Persentase'],
    ...menuRows,
    [], [],
    ['🥧 DISTRIBUSI PER KATEGORI'],
    ['(Pilih tabel ini di Excel lalu Insert -> Chart -> Pie Chart)'],
    [],
    ['Kategori', 'Jumlah Terjual', 'Pendapatan (Rp)', 'Persentase'],
    ...catRows
  ];
  
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  ws2['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, ws2, "Analisis Menu");

  // ═══════════════════════════════════════════════════
  // SHEET 3: Analisis Pelanggan
  // ═══════════════════════════════════════════════════
  const custRows = custRanking.map(([name, data], idx) => {
    const fav = Object.entries(data.favMenus).sort((a, b) => b[1] - a[1])[0];
    const avg = data.orders > 0 ? Math.round(data.spent / data.orders) : 0;
    return [idx + 1, name, data.orders, formatCurrency(data.spent), formatCurrency(avg), fav ? `${fav[0]} (${fav[1]}x)` : '-', data.lastVisit];
  });

  const topSpendersRows = [...custRanking].sort((a, b) => b[1].spent - a[1].spent).slice(0, 10).map(([name, data], idx) => {
    return [idx + 1, name, formatCurrency(data.spent), data.orders];
  });

  const ws3Data = [
    ['👥 ANALISIS PELANGGAN'],
    [`Total pelanggan unik: ${custRanking.length}`],
    [],
    ['Peringkat', 'Nama Pelanggan', 'Total Pesanan', 'Total Belanja (Rp)', 'Rata-rata (Rp)', 'Menu Favorit', 'Kunjungan Terakhir'],
    ...custRows,
    [], [],
    ['💰 TOP PELANGGAN (TOTAL BELANJA)'],
    ['(Pilih tabel ini di Excel lalu Insert -> Chart -> Bar Chart)'],
    [],
    ['Peringkat', 'Nama Pelanggan', 'Total Belanja (Rp)', 'Jumlah Pesanan'],
    ...topSpendersRows
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
  ws3['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, ws3, "Analisis Pelanggan");

  // ═══════════════════════════════════════════════════
  // SHEET 4: Ringkasan Keuangan
  // ═══════════════════════════════════════════════════
  const totalIncome = transactions.filter(t => t.tipe === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.tipe === 'expense').reduce((s, t) => s + t.amount, 0);
  const profit = totalIncome - totalExpense;
  const margin = totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(1) + '%' : '0%';

  const dailyData: Record<string, { income: number; expense: number }> = {};
  transactions.forEach(t => {
    if (!dailyData[t.date]) dailyData[t.date] = { income: 0, expense: 0 };
    if (t.tipe === 'income') dailyData[t.date].income += t.amount;
    else dailyData[t.date].expense += t.amount;
  });

  const dailyRows = Object.entries(dailyData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => {
      const dailyProfit = data.income - data.expense;
      return [date, formatCurrency(data.income), formatCurrency(data.expense), formatCurrency(dailyProfit)];
    });

  const paymentStats = { 'Tunai': 0, 'Non-Tunai': 0 };
  transactions.forEach(t => {
    if (t.tipe === 'income' && t['metode pembayaran']) {
      if (t['metode pembayaran'] === 'Tunai') paymentStats['Tunai'] += t.amount;
      if (t['metode pembayaran'] === 'Non-Tunai') paymentStats['Non-Tunai'] += t.amount;
    }
  });

  const ws4Data = [
    ['💰 RINGKASAN KEUANGAN'],
    [],
    ['Total Pemasukan (Rp)', formatCurrency(totalIncome)],
    ['Total Pengeluaran (Rp)', formatCurrency(totalExpense)],
    ['Laba Bersih (Rp)', formatCurrency(profit)],
    ['Margin Keuntungan', margin],
    [], [],
    ['💳 METODE PEMBAYARAN (PENDAPATAN)'],
    ['(Pilih tabel ini di Excel lalu Insert -> Chart -> Pie Chart)'],
    [],
    ['Metode', 'Total Pendapatan (Rp)'],
    ['Tunai', formatCurrency(paymentStats['Tunai'])],
    ['Non-Tunai', formatCurrency(paymentStats['Non-Tunai'])],
    [], [],
    ['📅 DATA HARIAN (PEMASUKAN VS PENGELUARAN)'],
    ['(Pilih tabel ini di Excel lalu Insert -> Chart -> Line Chart)'],
    [],
    ['Tanggal', 'Pemasukan (Rp)', 'Pengeluaran (Rp)', 'Laba Harian (Rp)'],
    ...dailyRows
  ];

  const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
  ws4['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, ws4, "Ringkasan Keuangan");

  // ═══════════════════════════════════════════════════
  // Generate and download
  // ═══════════════════════════════════════════════════
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
