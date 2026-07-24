import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Transaction, InventoryItem } from '../types';

export const createChatSession = async (
  apiKey: string,
  transactions: Transaction[],
  inventory: InventoryItem[],
  existingHistory: {role: 'user' | 'model', text: string}[] = [],
  userName: string = 'Admin'
) => {
  if (!apiKey) {
    throw new Error('API Key tidak ditemukan. Silakan atur di menu Setelan.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTransactions = transactions.filter(t => new Date(t.date) >= today);

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const todayIncome = todayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const todayExpense = todayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const todayProfit = todayIncome - todayExpense;


  const lowStockItems = inventory.filter(i => i.quantity < 10).map(i => `${i.name} (Sisa: ${i.quantity} ${i.unit})`).join(', ');
  
  // 1. Data Bulanan (Monthly Aggregation)
  const monthlyData: Record<string, { income: number, expense: number }> = {};
  transactions.forEach(t => {
    const d = new Date(t.date);
    if (!isNaN(d.getTime())) {
      const monthYear = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(d);
      if (!monthlyData[monthYear]) monthlyData[monthYear] = { income: 0, expense: 0 };
      if (t.type === 'income') monthlyData[monthYear].income += t.amount;
      if (t.type === 'expense') monthlyData[monthYear].expense += t.amount;
    }
  });
  const monthlyStr = Object.entries(monthlyData).map(([month, data]) => 
    `- ${month}: Masuk Rp${data.income.toLocaleString('id-ID')}, Keluar Rp${data.expense.toLocaleString('id-ID')}, Laba Rp${(data.income - data.expense).toLocaleString('id-ID')}`
  ).join('\n') || 'Belum ada data bulanan.';

  // 2. Data Harian (Daily Aggregation - Last 30 Days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0,0,0,0);
  
  const recentTransactions = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);
  const dailyData: Record<string, { income: number, expense: number, txs: Transaction[] }> = {};
  
  recentTransactions.forEach(t => {
    const d = new Date(t.date);
    if (!isNaN(d.getTime())) {
      const dateStr = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(d);
      if (!dailyData[dateStr]) dailyData[dateStr] = { income: 0, expense: 0, txs: [] };
      if (t.type === 'income') dailyData[dateStr].income += t.amount;
      if (t.type === 'expense') dailyData[dateStr].expense += t.amount;
      dailyData[dateStr].txs.push(t);
    }
  });
  
  const dailyStr = Object.entries(dailyData).slice(0, 30).map(([date, data]) => {
    // Helper inline to get top items
    const pMap: Record<string, number> = {};
    data.txs.filter(x => x.type === 'income').forEach(x => {
      const parts = x.description.split(' - ');
      if (parts.length > 1) {
        const itemsStr = parts.slice(1).join(' - ');
        let match;
        const regex = /(.*?)\s*\((\d+)x\)(?:,\s*|$)/g;
        while ((match = regex.exec(itemsStr)) !== null) {
          let name = match[1].replace(/\s*\(\+[^)]+\)/g, '').replace(/\s*\(\?[^)]+\)/g, '').trim();
          const qty = parseInt(match[2], 10);
          if (!isNaN(qty) && name) pMap[name] = (pMap[name] || 0) + qty;
        }
      }
    });
    const topItems = Object.entries(pMap).sort((a,b) => b[1]-a[1]).slice(0,3).map(x => `${x[0]} (${x[1]})`).join(', ');
    return `- ${date}: Masuk Rp${data.income.toLocaleString('id-ID')}, Keluar Rp${data.expense.toLocaleString('id-ID')}, Laba Rp${(data.income - data.expense).toLocaleString('id-ID')}. Top Produk: ${topItems || '-'}`;
  }).join('\n') || 'Belum ada data harian.';

  // 3. Raw Context (Last 100)
  const allTransactionsStr = transactions
    .slice(0, 100)
    .map(t => {
      const d = new Date(t.date);
      const dateStr = !isNaN(d.getTime()) ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(d) : 'Tanggal Invalid';
      return `[${dateStr}] ${t.type === 'income' ? 'Masuk' : 'Keluar'} Rp${t.amount.toLocaleString('id-ID')} - ${t.description}`;
    })
    .join('\n');

  const systemInstruction = `
Anda adalah analis bisnis ahli (Vrimae AI Assistant) untuk sebuah sistem kasir modern. 
Tugas Anda adalah berdiskusi dengan pemilik toko (pengguna) mengenai strategi bisnis, pemasaran, dan evaluasi penjualan secara akurat dan matematis.
PENTING: Nama pengguna Anda adalah "${userName}". Anda WAJIB menyapanya dan memanggilnya dengan nama "${userName}". JANGAN PERNAH LAGI memanggilnya dengan sebutan "Admin", "Bapak/Ibu", atau sebutan kaku lainnya. Selalu gunakan nama "${userName}".

[DATA KESELURUHAN (ALL-TIME)]
- Total Pendapatan: Rp ${totalIncome.toLocaleString('id-ID')}
- Total Pengeluaran: Rp ${totalExpense.toLocaleString('id-ID')}
- Keuntungan Bersih: Rp ${netProfit.toLocaleString('id-ID')}

[DATA HARI INI (${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())})]
- Pendapatan Hari Ini: Rp ${todayIncome.toLocaleString('id-ID')}
- Pengeluaran Hari Ini: Rp ${todayExpense.toLocaleString('id-ID')}
- Keuntungan Hari Ini: Rp ${todayProfit.toLocaleString('id-ID')}

[REKAP BULANAN]
${monthlyStr}

[REKAP HARIAN (30 HARI TERAKHIR)]
${dailyStr}

[INVENTORI - STOK MENIPIS (< 10)]
${lowStockItems || 'Semua stok aman.'}

[100 TRANSAKSI TERBARU (Konteks Saat Ini)]
${allTransactionsStr || 'Belum ada transaksi.'}

Gaya bicara Anda:
1. Profesional namun santai dan suportif (gunakan bahasa Indonesia).
2. Jika pengguna menanyakan tentang performa penjualan di tanggal atau bulan tertentu, analisislah [REKAP BULANAN] atau [REKAP HARIAN] di atas.
3. Jawaban Anda HARUS AKURAT secara matematis sesuai data ringkasan di atas. Jangan menebak angka.
4. Jangan terlalu bertele-tele, langsung pada poin, insight, atau saran taktis.
5. Gunakan Markdown (seperti **bold** dan bullet points) agar mudah dibaca.
`;

  // Fetch available models dynamically to prevent 404 errors on new keys
  let selectedModel = "gemini-1.5-flash";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (data.models && Array.isArray(data.models)) {
      const validModels = data.models.filter((m: any) => 
        m.supportedGenerationMethods?.includes('generateContent') && 
        m.name.includes('gemini')
      );
      
      if (validModels.length > 0) {
        // Prioritaskan model flash yang ringan dan cepat
        const flashModel = validModels.find((m: any) => m.name.includes('flash'));
        if (flashModel) {
          selectedModel = flashModel.name.replace('models/', '');
        } else {
          selectedModel = validModels[0].name.replace('models/', '');
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch models list, using fallback", err);
  }

  const formattedHistory = existingHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  const model = genAI.getGenerativeModel({ 
    model: selectedModel,
    systemInstruction: systemInstruction,
  });

  return model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: "Siap? Ingat instruksi dan jadilah analis Vrimae AI yang cerdas!" }],
      },
      {
        role: "model",
        parts: [{ text: `Halo ${userName}! Saya adalah Vrimae AI Assistant. Saya telah menganalisa seluruh laporan bulanan, harian, dan tren penjualan Anda dengan sangat akurat. Apa yang ingin kita bahas hari ini?` }],
      },
      ...formattedHistory
    ],
  });
};
