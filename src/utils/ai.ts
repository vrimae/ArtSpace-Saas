import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { FunctionDeclaration } from '@google/generative-ai';
import type { Transaction, InventoryItem } from '../types';
import { getTransactions, getInventory, getProducts } from './storage';

// 1. DEFINISI TOOLS / FUNCTION CALLING YANG AMAN & KETAT (READ-ONLY)
const aiTools: { functionDeclarations: FunctionDeclaration[] }[] = [
  {
    functionDeclarations: [
      {
        name: 'get_summary',
        description: 'Mendapatkan ringkasan pembukuan aktual dari database: total pemasukan/penjualan, total pengeluaran, laba bersih (profit), dan jumlah transaksi pada rentang tanggal tertentu.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: { type: SchemaType.STRING, description: 'Tanggal mulai pencarian format YYYY-MM-DD (contoh: 2026-08-01)' },
            end_date: { type: SchemaType.STRING, description: 'Tanggal akhir pencarian format YYYY-MM-DD (contoh: 2026-08-03)' },
          },
          required: ['start_date', 'end_date']
        }
      },
      {
        name: 'get_product_sales',
        description: 'Menganalisa rincian penjualan produk/menu tertentu (jumlah terjual, omzet kontribusinya, tren harian ramai/sepi, perbandingan dengan periode sebelumnya, dan status stok bahan penunjang) untuk menjawab alasan mengapa menu laku/sepi.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            product_name: { type: SchemaType.STRING, description: 'Nama menu atau kata kunci produk yang dicari' },
            start_date: { type: SchemaType.STRING, description: 'Tanggal mulai pencarian format YYYY-MM-DD' },
            end_date: { type: SchemaType.STRING, description: 'Tanggal akhir pencarian format YYYY-MM-DD' }
          },
          required: ['product_name', 'start_date', 'end_date']
        }
      },
      {
        name: 'get_top_products',
        description: 'Mendapatkan daftar menu paling laku (terlaris) berdasarkan volume terjual dan omet rupiah pada periode tertentu.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: { type: SchemaType.STRING, description: 'Tanggal mulai pencarian format YYYY-MM-DD' },
            end_date: { type: SchemaType.STRING, description: 'Tanggal akhir pencarian format YYYY-MM-DD' },
            limit: { type: SchemaType.NUMBER, description: 'Jumlah maksimal produk teratas (default 5)' }
          },
          required: ['start_date', 'end_date']
        }
      },
      {
        name: 'get_lowest_products',
        description: 'Mendapatkan daftar menu yang paling kurang laku atau bahkan 0 (nol) penjualan pada rentang periode tertentu.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: { type: SchemaType.STRING, description: 'Tanggal mulai pencarian format YYYY-MM-DD' },
            end_date: { type: SchemaType.STRING, description: 'Tanggal akhir pencarian format YYYY-MM-DD' },
            limit: { type: SchemaType.NUMBER, description: 'Jumlah maksimal produk terbawah (default 5)' }
          },
          required: ['start_date', 'end_date']
        }
      },
      {
        name: 'get_stock_history',
        description: 'Mengecek kondisi aktual stok inventori/gudang dan resep bahan saat ini, apakah pernah atau sedang mengalami kehabisan stok (0) yang menyebabkan pesanan kasir terhambat.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            item_name: { type: SchemaType.STRING, description: 'Nama bahan inventori atau nama produk menu (opsional: bila kosong maka sistem otomatis menampilkan daftar bahan yang menipis atau kosong)' }
          }
        }
      },
      {
        name: 'get_transactions',
        description: 'Mengambil daftar riwayat bukti transaksi detail (keterangan item pesanan, jam, metode bayar, nama pelanggan) dari database.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: { type: SchemaType.STRING, description: 'Tanggal mulai pencarian format YYYY-MM-DD' },
            end_date: { type: SchemaType.STRING, description: 'Tanggal akhir pencarian format YYYY-MM-DD' },
            type: { type: SchemaType.STRING, description: 'Jenis filter transaksi: all (semua), income (pemasukan), atau expense (pengeluaran)' },
            limit: { type: SchemaType.NUMBER, description: 'Maksimal jumlah rincian baris transaksi (default 10)' }
          },
          required: ['start_date', 'end_date']
        }
      }
    ]
  }
];

// Helper: Verifikasi apakah tanggal berada dalam rentang start_date dan end_date
const isInRange = (dateStr: string, start?: string, end?: string) => {
  if (!start && !end) return true;
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return false;
  const startTime = start ? new Date(`${start}T00:00:00`).getTime() : 0;
  const endTime = end ? new Date(`${end}T23:59:59.999`).getTime() : Infinity;
  return d >= startTime && d <= endTime;
};

// Helper: Parsing rincian item menu & kuantitas dari deskripsi pesanan kasir
const parseItemsFromTx = (description: string): { name: string; qty: number }[] => {
  const items: { name: string; qty: number }[] = [];
  let cleaned = description.replace(/^\[.*?\]\s*/, '').replace(/\[WA:.*?\]/g, '').trim();
  if (cleaned.startsWith('Pesanan:')) {
    const dashIdx = cleaned.indexOf(' - ');
    if (dashIdx !== -1) {
      cleaned = cleaned.substring(dashIdx + 3).trim();
    }
  }
  
  const parts = cleaned.split(/(?:\)\s*,\s*)|(?:\)$)/);
  for (const part of parts) {
    if (!part.trim()) continue;
    const match = /(.*?)\s*\((\d+)x$/.exec(part.trim());
    if (match) {
      let name = match[1].replace(/\s*\(\+[^)]+\)/g, '').replace(/\s*\(\?[^)]+\)/g, '').trim();
      const qty = parseInt(match[2], 10);
      if (name && !isNaN(qty)) {
        items.push({ name, qty });
      }
    } else if (part.trim() && !part.includes('-')) {
      items.push({ name: part.trim(), qty: 1 });
    }
  }
  return items;
};

// 2. MESIN PENGECEK DATABASE SECARA REAL-TIME, TEPAT, DAN AKURAT
const executeAiTool = async (toolName: string, args: any): Promise<any> => {
  // Ambil data real-time langsung dari storage agar hasil tidak salah tebak
  const [txs, inv, prods] = await Promise.all([
    getTransactions(),
    getInventory(),
    getProducts()
  ]);

  if (toolName === 'get_summary') {
    const filtered = txs.filter(t => isInRange(t.date, args.start_date, args.end_date));
    const income = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const profit = income - expense;
    
    return {
      rentang_tanggal: `${args.start_date || 'Awal'} sampai ${args.end_date || 'Hari Ini'}`,
      total_pemasukan_rp: income,
      total_pengeluaran_rp: expense,
      laba_bersih_rp: profit,
      jumlah_transaksi_tercatat: filtered.length,
      status_data: "Angka terverifikasi 100% akurat langsung dari database pembukuan."
    };
  }

  if (toolName === 'get_product_sales') {
    const keyword = (args.product_name || '').toLowerCase().trim();
    const currentTxs = txs.filter(t => t.type === 'income' && isInRange(t.date, args.start_date, args.end_date));
    
    let totalQty = 0;
    let estimatedRevenue = 0;
    const dailyCounts: Record<string, number> = {};

    const matchedProd = prods.find(p => p.name.toLowerCase().includes(keyword));
    const unitPrice = matchedProd ? Number(matchedProd.price) : 0;

    currentTxs.forEach(t => {
      const parsed = parseItemsFromTx(t.description);
      parsed.forEach(item => {
        if (item.name.toLowerCase().includes(keyword)) {
          totalQty += item.qty;
          const dayStr = new Intl.DateTimeFormat('id-ID', { weekday: 'long', dateStyle: 'short' }).format(new Date(t.date));
          dailyCounts[dayStr] = (dailyCounts[dayStr] || 0) + item.qty;
          estimatedRevenue += (unitPrice > 0 ? unitPrice * item.qty : t.amount);
        }
      });
    });

    // Cek perbandingan dengan durasi periode sebelumnya (untuk Root-Cause Reasoning)
    let prevQty = 0;
    if (args.start_date && args.end_date) {
      const startD = new Date(args.start_date).getTime();
      const endD = new Date(args.end_date).getTime();
      const diffMs = endD - startD;
      const prevEndD = new Date(startD - 1);
      const prevStartD = new Date(prevEndD.getTime() - diffMs);
      
      const prevStartStr = prevStartD.toISOString().split('T')[0];
      const prevEndStr = prevEndD.toISOString().split('T')[0];
      
      const prevTxs = txs.filter(t => t.type === 'income' && isInRange(t.date, prevStartStr, prevEndStr));
      prevTxs.forEach(t => {
        parseItemsFromTx(t.description).forEach(item => {
          if (item.name.toLowerCase().includes(keyword)) {
            prevQty += item.qty;
          }
        });
      });
    }

    // Cek histori stok & resep penunjang produk ini ( Root-Cause Reasoning )
    let stockReport: any[] = [];
    if (matchedProd && matchedProd.recipes && matchedProd.recipes.length > 0) {
      stockReport = matchedProd.recipes.map(r => {
        const invItem = inv.find(i => i.id === r.inventoryId || (i.name && r.name && i.name.toLowerCase() === r.name.toLowerCase()));
        if (invItem) {
          return {
            bahan: invItem.name,
            sisa_stok_gudang: `${invItem.quantity} ${invItem.unit || ''}`,
            kondisi: invItem.quantity === 0 ? "KOSONG / HABIS (Memicu penjualan produk ini terhenti!)" : (invItem.quantity < 10 ? "MENIPIS / KRITIS" : "AMAN")
          };
        }
        return { bahan: r.name || 'Bahan', kondisi: 'Tidak ditemukan di inventori' };
      });
    } else {
      // Cek langsung nama menu di gudang bahan jika tidak menggunakan resep BOM
      const directInv = inv.find(i => i.name.toLowerCase().includes(keyword));
      if (directInv) {
        stockReport.push({
          bahan: directInv.name,
          sisa_stok_gudang: `${directInv.quantity} ${directInv.unit || ''}`,
          kondisi: directInv.quantity === 0 ? "HABIS TOTAL" : "Tersedia"
        });
      }
    }

    return {
      nama_produk_dicari: matchedProd ? matchedProd.name : args.product_name,
      total_porsi_terjual: totalQty,
      perkiraan_omset_rp: estimatedRevenue,
      penjualan_periode_sebelumnya: prevQty,
      perubahan_tren: prevQty > 0 ? `${Math.round(((totalQty - prevQty) / prevQty) * 100)}% dibanding periode lalu` : "Belum ada pembanding periode sebelumnya",
      distribusi_penjualan_harian: dailyCounts,
      kondisi_stok_bahan_penunjang: stockReport.length > 0 ? stockReport : "Menu ini tidak memiliki keterikatan bahan dengan inventori gudang."
    };
  }

  if (toolName === 'get_top_products' || toolName === 'get_lowest_products') {
    const limit = args.limit || 5;
    const currentTxs = txs.filter(t => t.type === 'income' && isInRange(t.date, args.start_date, args.end_date));
    
    const salesMap: Record<string, { name: string; qty: number; rev: number }> = {};
    
    // Inisialisasi dari semua menu terdaftar (agar bisa deteksi produk bernilai 0 penjualan)
    prods.forEach(p => {
      salesMap[p.name.toLowerCase()] = { name: p.name, qty: 0, rev: 0 };
    });

    currentTxs.forEach(t => {
      parseItemsFromTx(t.description).forEach(item => {
        const key = item.name.toLowerCase();
        const matchedProd = prods.find(p => p.name.toLowerCase() === key);
        const price = matchedProd ? Number(matchedProd.price) : (item.qty > 0 ? t.amount / item.qty : 0);
        
        if (!salesMap[key]) {
          salesMap[key] = { name: item.name, qty: 0, rev: 0 };
        }
        salesMap[key].qty += item.qty;
        salesMap[key].rev += (price * item.qty);
      });
    });

    const sorted = Object.values(salesMap).sort((a, b) => 
      toolName === 'get_top_products' ? b.qty - a.qty : a.qty - b.qty
    );

    return {
      rentang_tanggal: `${args.start_date} sampai ${args.end_date}`,
      tipe_laporan: toolName === 'get_top_products' ? `Top ${limit} Produk Terlaris` : `Top ${limit} Produk Kurang Laku / Nol Penjualan`,
      daftar_produk: sorted.slice(0, limit).map(p => ({
        nama_menu: p.name,
        jumlah_terjual: `${p.qty} porsi/item`,
        total_kontribusi_omzet_rp: p.rev
      }))
    };
  }

  if (toolName === 'get_stock_history') {
    const keyword = (args.item_name || '').toLowerCase().trim();
    if (keyword) {
      // Cari di inventori atau menu resep
      const invMatches = inv.filter(i => i.name.toLowerCase().includes(keyword));
      const prodMatches = prods.filter(p => p.name.toLowerCase().includes(keyword));
      
      const results: any[] = [];
      invMatches.forEach(i => {
        results.push({
          jenis: "Bahan Inventori Gudang",
          nama_barang: i.name,
          sisa_stok: `${i.quantity} ${i.unit || 'pcs'}`,
          status: i.quantity === 0 ? "KOSONG / HABIS TOTAL" : (i.quantity < 10 ? "Menipis / Butuh Restock" : "Aman")
        });
      });

      prodMatches.forEach(p => {
        const bahanResep = (p.recipes || []).map(r => {
          const itemGudang = inv.find(iv => iv.id === r.inventoryId);
          return {
            bahan_resep: r.name || itemGudang?.name || 'Tidak diketahui',
            stok_tersedia_gudang: itemGudang ? `${itemGudang.quantity} ${itemGudang.unit || ''}` : 'Tidak ditemukan di gudang',
            kondisi: itemGudang?.quantity === 0 ? "KOSONG (Memicu stok menu ini terhalang di kasir!)" : "Tersedia"
          };
        });
        results.push({
          jenis: "Menu Kasir (BOM Resep)",
          nama_menu: p.name,
          harga_jual_rp: Number(p.price),
          ketergantungan_bahan_inventori: bahanResep
        });
      });

      return { hasil_pencarian_stok: results.length > 0 ? results : "Barang atau bahan dengan nama tersebut tidak ditemukan di database gudang." };
    } else {
      // Tampilkan barang kritis / kosong
      const critical = inv.filter(i => i.quantity < 15).map(i => ({
        nama_barang: i.name,
        sisa_stok: `${i.quantity} ${i.unit || 'pcs'}`,
        status: i.quantity === 0 ? "HABIS TOTAL" : "Kritis / Menipis"
      }));
      return {
        catatan_gudang: "Daftar bahan inventori yang sedang kosong atau menipis",
        item_kritis: critical.length > 0 ? critical : "Semua bahan di inventori stoknya melimpah dan aman (di atas 15 unit)."
      };
    }
  }

  if (toolName === 'get_transactions') {
    const limit = args.limit || 10;
    let filtered = txs.filter(t => isInRange(t.date, args.start_date, args.end_date));
    if (args.type && args.type !== 'all') {
      filtered = filtered.filter(t => t.type === args.type);
    }
    
    return {
      rentang_tanggal: `${args.start_date} sampai ${args.end_date}`,
      total_diterima: filtered.length,
      rincian_transaksi_terbaru: filtered.slice(0, limit).map(t => ({
        tanggal_jam: new Date(t.date).toLocaleString('id-ID'),
        tipe: t.type === 'income' ? 'Penjualan / Pemasukan' : 'Pengeluaran / Kulakan',
        nominal_rp: t.amount,
        keterangan_pesanan: t.description,
        kategori: t.category
      }))
    };
  }

  return { error: "Tool tidak dikenal." };
};

// 3. PEMBUKA SESI CHAT DENGAN TOOLS & SYSTEM PROMPT NATURAL
export const createChatSession = async (
  apiKey: string,
  _initialTransactions: Transaction[],
  _initialInventory: InventoryItem[],
  existingHistory: {role: 'user' | 'model', text: string}[] = [],
  userName: string = 'Admin'
) => {
  if (!apiKey) {
    throw new Error('API Key tidak ditemukan. Silakan atur di menu Setelan.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const todayDate = new Date();
  const todayStr = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(todayDate);
  const isoToday = todayDate.toISOString().split('T')[0];

  const systemInstruction = `
Anda adalah analis bisnis profesional sekaligus sahabat kepercayaan milik pengusaha (Vrimae AI Assistant) di aplikasi kasir ini.
Nama pemilik toko/usaha yang sedang berdialog dengan Anda adalah "${userName}". Anda WAJIB memanggilnya dengan sebutan akrab dan sopan menggunakan nama "${userName}". Gunakan bahasa Indonesia sehari-hari yang ramah, santai-profesional, akrab seperti berbicara langsung dengan pemilik kafe/toko di dunia nyata. HINDARI bahasa robotik, kaku, atau terjemahan mesin.

=== 1. WAKTU DAN TANGGAL SISTEM SAAT INI ===
Hari ini adalah: ${todayStr} (Tanggal Sistem YYYY-MM-DD: ${isoToday}).
Jadikan tanggal sistem hari ini (${isoToday}) sebagai titik acuan pasti untuk mengartikan kata "hari ini", "kemarin", "minggu ini", "minggu lalu", atau "bulan ini".
Contoh: Bila hari ini 4 Agustus 2026 dan user tanya "minggu ini", berarti 7 hari ke belakang (2026-07-29 sampai 2026-08-04). Bila tanya "bulan ini", berarti 2026-08-01 sampai 2026-08-31.

=== 2. ATURAN TOOL USE & KEAKURATAN DATA (NO HALLUCINATION) ===
- SETIAP KALI pengguna menanyakan nominal pemasukan, pengeluaran, omset, stok bahan, produk laris/sepi, atau rincian transaksi, ANDA WAJIB MEMANGGIL TOOLS YANG TERSEDIA (get_summary, get_product_sales, get_top_products, get_lowest_products, get_stock_history, get_transactions).
- JANGAN PERNAH MENEBAK atau MENGARANG ANGKA (Hallucination). Seluruh angka rupiah, kuantitas item, dan kondisi stok yang Anda sebutkan WAJIB 100% akurat bersumber dari hasil balasan tool yang Anda panggil!

=== 3. LOGIKA SABAB-AKIBAT & ANALISIS "KENAPA" (ROOT-CAUSE REASONING) ===
- Saat pengguna menanyakan alasan ("Kenapa produk A laris manis?", "Kenapa penjualan minggu ini turun?", "Kenapa menu Kopi Susu sepi?"), Anda WAJIB memanggil beberapa tool sekaligus untuk melakukan investigasi menyeluruh sebelum menjawab:
  * Cek kondisi histori stok (lewat get_stock_history): Apakah sempat terjadi kehabisan bahan di gudang yang membuat kasir tidak bisa memproses penjualan menu tersebut?
  * Cek perbandingan penjualan & tren hari (lewat get_product_sales / get_summary): Bandingkan angka penjualan periode ini dengan periode sebelumnya. Cek hari apa yang ramai atau mendadak sepi.
- Hubungkan kesimpulan Anda dengan DATA KONKRET sebagai bukti pendukung.
  Contoh jawaban ideal: "Penjualan Kopi Susu minggu ini memang tergerus sekitar 20%, dari sebelumnya 50 porsi turun jadi 40 porsi, ${userName}. Kalau saya cek di database gudang, penyebab utamanya karena bahan 'Susu Murni' tercatat sempat kosong total di inventori kita, sehingga orderan pelanggan di hari Selasa dan Rabu terpaksa tersendat."
- JUJUR BILA DATA TIDAK CUKUP: Bila angka di database stabil, tidak ada kendala stok, dan memang tidak ada pencatatan faktor luar (misal promo/cuaca), berkatalah secara jujur bahwa dari sisi pembukuan kasir semua normal dan belum ada cukup data database untuk menyulir alasan faktor eksternal. Jangan berbohong atau berasumsi tanpa fakta!

=== 4. PERCAKAPAN NATURAL TANPA ISTILAH TEKNIS ===
- JANGAN PERNAH memakai istilah teknis IT/kode di percakapan user, seperti: *query, SQL, function calling, tool use, database, API, endpoint, parameter, table, atau JSON*.
- Pakailah istilah wajar untuk pemilik warung/bisnis: *catatan pembukuan, laporan kasir, gudang inventori, daftar resep, bukti kas*.
- INGAT KONTEKS PERCAKAPAN: Bila pengguna melabuh dari chat sebelumnya (misal barusan membahas omset minggu ini, lalu berucap "kalau minggu lalu gimana?"), langsung tangkap maksudnya dan panggil tool untuk periode minggu lalu.
- Bila pertanyaan pengguna sungguh ambigu atau kekurangan informasi mutlak ("berapa omzet hari itu?" atau "produk yang itu aman?"), mintalah klarifikasi singkat dengan ramah, tanpa menebak-nebak liar.

=== 5. GUARDRAILS READ-ONLY (HANYA BACA) ===
- Anda ditugaskan sebagai konsultan & analis akurat (Read-only). Bila pengguna menyuruh Anda merombak harga, nambah stok, atau menghapus bukti penjualan lewat ruang obrolan AI, jelaskan dengan lembut bahwa demi menjaga keamanan dan otentisitas kas toko, Anda tidak diberi kewenangan mengubah data secara otomatis dari sini. Silakan arahkan ${userName} untuk merombaknya dengan mudah di halaman menu Kasir, Produk, atau Inventori.

Jadilah penasihat bisnis termumpuni, ramah, kritis, jujur, dan membantu meledakkan omset usaha ${userName}!
`;

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
    tools: aiTools,
  });

  const internalChat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: "Siap? Ingat semua aturan tool calling akurat, analisa root-cause jujur, bahasa santai sehari-hari, dan batasan read-only!" }],
      },
      {
        role: "model",
        parts: [{ text: `Halo ${userName}! Saya bersyukur bisa menemanimu berbisnis hari ini. Saya sudah terhubung dengan seluruh catatan kasir dan inventori gudang kita secara langsung. Apa yang ingin kita bahas atau evaluasi hari ini?` }],
      },
      ...formattedHistory
    ],
  });

  // Proxy wrapper agar sepenuhnya kompatibel dengan komponen AiAssistant.tsx
  return {
    sendMessage: async (userText: string) => {
      let result = await internalChat.sendMessage(userText);
      let response = await result.response;
      let functionCalls = response.functionCalls();
      let loopCount = 0;

      // Loop eksekusi tool calling lokal sampai AI merasa cukup mendapatkan data database
      while (functionCalls && functionCalls.length > 0 && loopCount < 5) {
        loopCount++;
        const toolResults = [];
        for (const call of functionCalls) {
          console.log(`[AI Analisis - Memanggil Tool] ${call.name}`, call.args);
          try {
            const resData = await executeAiTool(call.name, call.args);
            toolResults.push({
              functionResponse: {
                name: call.name,
                response: resData
              }
            });
          } catch (err: any) {
            toolResults.push({
              functionResponse: {
                name: call.name,
                response: { error: 'Gagal membaca pembukuan: ' + err.message }
              }
            });
          }
        }

        result = await internalChat.sendMessage(toolResults);
        response = await result.response;
        functionCalls = response.functionCalls();
      }

      return {
        response: {
          text: () => response.text()
        }
      };
    }
  };
};
