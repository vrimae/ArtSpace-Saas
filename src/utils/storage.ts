import type { Transaction, InventoryItem, Product, ExtraItem, ActivityLog } from '../types';
import { supabase } from '../lib/supabase';
import { compressImage } from './cropImage';

const handleApiError = (context: string, error: any) => {
  console.error(`${context}`, error);
  if (
    error &&
    (error.code === 'PGRST301' ||
      error.code === '42501' ||
      error.message?.toLowerCase().includes('jwt') ||
      error.message?.toLowerCase().includes('banned') ||
      error.message?.toLowerCase().includes('security') ||
      error.message?.toLowerCase().includes('invalid'))
  ) {
    window.dispatchEvent(new CustomEvent('auth_expired_error', { detail: error.message }));
  }
};

// ================= SMART IN-MEMORY SWR CACHE LAYER =================
// Menghilangkan lag saat berpindah halaman (Kasir <-> Dashboard <-> Keuangan <-> Inventori)
// dengan tetap 100% menjamin akurasi data karena setiap perubahan (tambah/edit/hapus)
// langsung mengosongkan cache terkait pada milidetik yang sama.
interface CacheEntry<T> {
  userId: string;
  data: T;
  timestamp: number;
}

let cachedUser: any = null;
let lastUserCacheTime = 0;
let userPromise: Promise<any> | null = null;

let productsCache: CacheEntry<Product[]> | null = null;
let productsInflight: Promise<Product[]> | null = null;

let inventoryCache: CacheEntry<InventoryItem[]> | null = null;
let inventoryInflight: Promise<InventoryItem[]> | null = null;

let summaryCache: CacheEntry<{ total_income: number; total_expense: number; balance: number; month_income: number; today_income: number }> | null = null;
let summaryInflight: Promise<any> | null = null;

const transactionsPageCache = new Map<string, CacheEntry<Transaction[]>>();
const transactionsInflight = new Map<string, Promise<Transaction[]>>();

// Mencegah kompresi gambar produk dijalankan berulang-ulang dan memacetkan CPU di iPad/HP
const processedProductImages = new Set<string>();
let imageOptimizationQueueRunning = false;
const imageOptimizationQueue: { id: string; img: string }[] = [];

const USER_TTL = 45 * 1000;
const PRODUCTS_TTL = 60 * 1000;
const INVENTORY_TTL = 45 * 1000;
const SUMMARY_TTL = 30 * 1000;
const TX_TTL = 20 * 1000;

export const invalidateProductsCache = () => {
  productsCache = null;
  productsInflight = null;
};

export const invalidateInventoryCache = () => {
  inventoryCache = null;
  inventoryInflight = null;
};

export const invalidateTransactionsCache = () => {
  transactionsPageCache.clear();
  transactionsInflight.clear();
  summaryCache = null;
  summaryInflight = null;
};

export const invalidateUserCache = () => {
  cachedUser = null;
  lastUserCacheTime = 0;
  userPromise = null;
};

export const invalidateAllDataCaches = () => {
  invalidateUserCache();
  invalidateProductsCache();
  invalidateInventoryCache();
  invalidateTransactionsCache();
};

export const getUser = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedUser && now - lastUserCacheTime < USER_TTL) {
    return cachedUser;
  }
  if (!forceRefresh && userPromise) return userPromise;

  userPromise = supabase.auth
    .getUser()
    .then(({ data: { user } }) => {
      cachedUser = user;
      lastUserCacheTime = Date.now();
      userPromise = null;
      return user;
    })
    .catch(() => {
      userPromise = null;
      return cachedUser || null;
    });
  return userPromise;
};

// Bersihkan seluruh cache memori saat akun berubah / logout / update profil
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
    invalidateAllDataCaches();
  } else {
    invalidateUserCache();
    invalidateProductsCache(); // resep & kategori disimpan di user_metadata
  }
});

const checkActiveUser = async () => {
  const user = await getUser(false);
  if (!user) {
    window.dispatchEvent(new CustomEvent('auth_expired_error', { detail: 'Maaf akun anda telah expired' }));
    throw new Error('Sesi tidak valid atau akun dinonaktifkan');
  }
  return user;
};

// ================= PROFILES =================
export const checkAnalyticsAccess = async (): Promise<boolean> => {
  const user = await checkActiveUser();
  if (!user) return false;
  if (user.email === 'bimdarmawa2@gmail.com' || user.email === 'vrimae23@gmail.com') return true;

  if (user.user_metadata?.analytics_ends_at) {
    const expiryDate = new Date(user.user_metadata.analytics_ends_at);
    if (expiryDate > new Date()) {
      return true;
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return false;
  }
  return data.is_pro === true;
};

export const checkAiAccess = async (): Promise<boolean> => {
  const user = await checkActiveUser();
  if (!user) return false;
  if (user.email === 'bimdarmawa2@gmail.com' || user.email === 'vrimae23@gmail.com') return true;

  if (user.user_metadata?.ai_ends_at) {
    const expiryDate = new Date(user.user_metadata.ai_ends_at);
    if (expiryDate > new Date()) {
      return true;
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return false;
  }
  return data.is_pro === true;
};

export const checkProAccess = checkAnalyticsAccess;

export const checkIsActiveSubscription = async (): Promise<boolean> => {
  return true;
};

// ================= ACTIVITY LOGS =================
export const logActivity = async (action: string, description: string, actorName?: string, reason?: string) => {
  const payload: any = { action, description };
  if (actorName) payload.actor_name = actorName;
  if (reason) payload.reason = reason;
  const user = await getUser();
  if (user) {
    payload.user_id = user.id;
  }
  const { error } = await supabase.from('activity_logs').insert([payload]);
  if (error) console.error('Failed to log activity:', error);
};

export const getActivityLogs = async (limitCount = 50, offset = 0): Promise<ActivityLog[]> => {
  const user = await checkActiveUser();
  if (!user) return [];

  if (offset === 0) {
    supabase.rpc('delete_old_logs').then(({ error }) => {
      if (error) console.error('Failed to cleanup old logs:', error);
    });
  }

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limitCount - 1);

  if (error) {
    console.error('Failed to fetch activity logs:', error);
    return [];
  }
  return data || [];
};

// ================= TRANSACTIONS =================
export const getFinancialSummary = async (forceRefresh = false): Promise<{ total_income: number; total_expense: number; balance: number; month_income: number; today_income: number }> => {
  const user = await getUser();
  if (!user) return { total_income: 0, total_expense: 0, balance: 0, month_income: 0, today_income: 0 };

  const now = Date.now();
  if (!forceRefresh && summaryCache && summaryCache.userId === user.id && now - summaryCache.timestamp < SUMMARY_TTL) {
    return summaryCache.data;
  }
  if (!forceRefresh && summaryInflight) return summaryInflight;

  summaryInflight = Promise.resolve(supabase.rpc('get_financial_summary', { p_user_id: user.id }))
    .then(({ data, error }) => {
      summaryInflight = null;
      if (error || !data || data.length === 0) {
        console.error('getFinancialSummary error:', error);
        return { total_income: 0, total_expense: 0, balance: 0, month_income: 0, today_income: 0 };
      }
      const result = {
        total_income: Number(data[0].total_income || 0),
        total_expense: Number(data[0].total_expense || 0),
        balance: Number(data[0].balance || 0),
        month_income: Number(data[0].month_income || 0),
        today_income: Number(data[0].today_income || 0),
      };
      summaryCache = { userId: user.id, data: result, timestamp: Date.now() };
      return result;
    })
    .catch((err: any) => {
      summaryInflight = null;
      console.error('getFinancialSummary exception:', err);
      return { total_income: 0, total_expense: 0, balance: 0, month_income: 0, today_income: 0 };
    });

  return summaryInflight;
};

export const encodeTransactionDescription = (t: Partial<Transaction>) => {
  let prefix = '';
  if (t.poStatus) {
    prefix += `[PO|${t.poStatus}|${t.poPickupDate || ''}|${t.customerName || ''}|${t.customerPhone || ''}|${t.poTotalAmount ?? ''}|${t.poDpAmount ?? ''}] `;
  }
  // Bersihkan tag [PO|...] ganda apabila ada dari riwayat edit lama
  const cleanBody = (t.description || '').replace(/^(?:\[PO\|[^\]]*\]\s*)+/i, '');
  return prefix + cleanBody;
};

export const decodeTransactionDescription = (rowDesc: string) => {
  let desc = rowDesc || '';
  let poStatus: 'pending' | 'selesai' | 'batal' | undefined;
  let poPickupDate: string | undefined;
  let customerName: string | undefined;
  let customerPhone: string | undefined;
  let poTotalAmount: number | undefined;
  let poDpAmount: number | undefined;

  const poMatch = desc.match(/^\[PO\|(.*?)\|(.*?)\|(.*?)\|(.*?)(?:\|(.*?)\|(.*?))?\]\s*/);
  if (poMatch) {
    poStatus = poMatch[1] as 'pending' | 'selesai' | 'batal';
    poPickupDate = poMatch[2] || undefined;
    customerName = poMatch[3] || undefined;
    customerPhone = poMatch[4] || undefined;
    poTotalAmount = poMatch[5] !== undefined && poMatch[5] !== '' ? Number(poMatch[5]) : undefined;
    poDpAmount = poMatch[6] !== undefined && poMatch[6] !== '' ? Number(poMatch[6]) : undefined;
    desc = desc.replace(poMatch[0], '');
    // Bersihkan sisa tag [PO|...] duplikat di bagian dalam jika pernah diedit sebelumnya
    desc = desc.replace(/^(?:\[PO\|[^\]]*\]\s*)+/i, '');
  }

  return { description: desc, poStatus, poPickupDate, customerName, customerPhone, poTotalAmount, poDpAmount };
};

const normalizeTransactionDate = (rawDate: any, fallbackDate: any): string => {
  let dateStr = String(rawDate || fallbackDate || new Date().toISOString()).trim();
  if (!dateStr) return new Date().toISOString();

  // Jika hanya tanggal 'YYYY-MM-DD' (dari input pengeluaran/inventori), jangan tambahkan 'Z' karena 'YYYY-MM-DDZ' tidak valid di Safari!
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Konversi spasi SQL 'YYYY-MM-DD HH:mm:ss' menjadi ISO 'YYYY-MM-DDTHH:mm:ss' agar kompatibel di iOS/macOS Safari
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateStr)) {
    dateStr = dateStr.replace(' ', 'T');
  }

  if (dateStr.includes('T') && !dateStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(dateStr)) {
    dateStr += 'Z';
  }
  return dateStr;
};

export const getTransactions = async (limitCount = 100, offset = 0, forceRefresh = false): Promise<Transaction[]> => {
  const user = await getUser();
  if (!user) return [];

  const cacheKey = `${user.id}_${limitCount}_${offset}`;
  const now = Date.now();

  if (offset === 0 && !forceRefresh) {
    const hit = transactionsPageCache.get(cacheKey);
    if (hit && hit.userId === user.id && now - hit.timestamp < TX_TTL) {
      return hit.data;
    }
    const pending = transactionsInflight.get(cacheKey);
    if (pending) return pending;
  }

  const fetchPromise = Promise.resolve(
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limitCount - 1)
  )
    .then(({ data, error }) => {
      transactionsInflight.delete(cacheKey);
      if (error) {
        console.error('getTransactions error:', error);
        return [];
      }
      const mapped: Transaction[] = (data || []).map((row) => {
        const dateStr = normalizeTransactionDate(row.date, row.created_at);
        const decoded = decodeTransactionDescription(row.description);
        return {
          id: row.id,
          type: row.type,
          amount: Number(row.amount),
          category: row.category,
          description: decoded.description,
          date: dateStr,
          poStatus: decoded.poStatus,
          poPickupDate: decoded.poPickupDate,
          customerName: decoded.customerName,
          customerPhone: decoded.customerPhone,
          poTotalAmount: decoded.poTotalAmount,
          poDpAmount: decoded.poDpAmount,
        };
      });

      if (offset === 0) {
        transactionsPageCache.set(cacheKey, { userId: user.id, data: mapped, timestamp: Date.now() });
      }
      return mapped;
    })
    .catch((err: any) => {
      transactionsInflight.delete(cacheKey);
      console.error('getTransactions exception:', err);
      return [];
    });

  if (offset === 0) {
    transactionsInflight.set(cacheKey, fetchPromise);
  }
  return fetchPromise;
};

export const addTransaction = async (t: Omit<Transaction, 'id'> & { id?: string }, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) throw new Error('Sesi telah berakhir. Silakan login kembali.');

  const { data, error } = await supabase
    .from('transactions')
    .insert([
      {
        type: t.type,
        amount: t.amount,
        category: t.category,
        description: encodeTransactionDescription(t),
        date: t.date,
        user_id: user.id,
      },
    ])
    .select('id');

  if (error) {
    handleApiError('Gagal menambah transaksi', error);
    throw new Error(error.message);
  }

  invalidateTransactionsCache();

  setTimeout(() => {
    const formattedAmount = 'Rp ' + Math.round(t.amount || 0).toLocaleString('id-ID');
    logActivity(
      'ADD_TRANSACTION',
      `Menambahkan ${t.type === 'income' ? 'pemasukan' : 'pengeluaran'} baru: ${t.category} sebesar ${formattedAmount} (${t.description})`,
      actorName,
      reason
    );
  }, 10);

  return data;
};

export const updateTransaction = async (id: string, t: Partial<Transaction>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const { data: tx } = await supabase.from('transactions').select('category, description').eq('id', id).single();

  const payload: any = {};
  if (t.type !== undefined) payload.type = t.type;
  if (t.amount !== undefined) payload.amount = t.amount;
  if (t.category !== undefined) payload.category = t.category;
  if (t.date !== undefined) payload.date = t.date;

  if (
    t.description !== undefined ||
    t.poStatus !== undefined ||
    t.poPickupDate !== undefined ||
    t.customerName !== undefined ||
    t.customerPhone !== undefined ||
    t.poTotalAmount !== undefined ||
    t.poDpAmount !== undefined
  ) {
    const decodedTx = decodeTransactionDescription(tx?.description || '');
    const mergedTx = {
      description: t.description !== undefined ? t.description : decodedTx.description,
      poStatus: t.poStatus !== undefined ? t.poStatus : decodedTx.poStatus,
      poPickupDate: t.poPickupDate !== undefined ? t.poPickupDate : decodedTx.poPickupDate,
      customerName: t.customerName !== undefined ? t.customerName : decodedTx.customerName,
      customerPhone: t.customerPhone !== undefined ? t.customerPhone : decodedTx.customerPhone,
      poTotalAmount: t.poTotalAmount !== undefined ? t.poTotalAmount : decodedTx.poTotalAmount,
      poDpAmount: t.poDpAmount !== undefined ? t.poDpAmount : decodedTx.poDpAmount,
    };
    payload.description = encodeTransactionDescription(mergedTx);
  }

  const { error } = await supabase.from('transactions').update(payload).eq('id', id);
  if (error) {
    handleApiError('', error);
    throw error;
  }

  invalidateTransactionsCache();

  const finalCategory = t.category || tx?.category || 'Tidak diketahui';
  const finalDesc = t.description || tx?.description || '';
  logActivity('UPDATE_TRANSACTION', `Memperbarui transaksi: ${finalCategory} ${finalDesc ? `(${finalDesc})` : ''}`.trim(), actorName, reason);
};

export const deleteTransaction = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const { data: tx } = await supabase.from('transactions').select('category, description').eq('id', id).single();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) {
    handleApiError('', error);
    throw error;
  }

  invalidateTransactionsCache();

  logActivity('DELETE_TRANSACTION', `Menghapus transaksi: ${tx?.category || 'Tidak diketahui'} ${tx?.description ? `(${tx.description})` : ''}`.trim(), actorName, reason);
};

// ================= INVENTORY =================
export const getInventory = async (forceRefresh = false): Promise<InventoryItem[]> => {
  const user = await getUser();
  if (!user) return [];

  const now = Date.now();
  if (!forceRefresh && inventoryCache && inventoryCache.userId === user.id && now - inventoryCache.timestamp < INVENTORY_TTL) {
    return inventoryCache.data;
  }
  if (!forceRefresh && inventoryInflight) return inventoryInflight;

  inventoryInflight = Promise.resolve(
    supabase
      .from('inventory')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
  )
    .then(({ data, error }) => {
      inventoryInflight = null;
      if (error) {
        console.error('getInventory error:', error);
        return [];
      }
      const mapped: InventoryItem[] = (data || []).map((row) => {
        const [actualName, unitStr] = (row.name || '').split('|||');
        return {
          id: row.id,
          name: actualName || row.name,
          unit: unitStr || '',
          category: row.category,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          totalPrice: Number(row.total_price),
          date: row.date,
        };
      });
      inventoryCache = { userId: user.id, data: mapped, timestamp: Date.now() };
      return mapped;
    })
    .catch((err: any) => {
      inventoryInflight = null;
      console.error('getInventory exception:', err);
      return [];
    });

  return inventoryInflight;
};

export const addInventory = async (item: Omit<InventoryItem, 'id'> & { id?: string }, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const encodedName = item.unit ? `${item.name}|||${item.unit}` : item.name;
  const { error } = await supabase.from('inventory').insert([
    {
      name: encodedName,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      date: item.date,
      user_id: user.id,
    },
  ]);
  if (error) {
    handleApiError('', error);
    throw error;
  }

  invalidateInventoryCache();

  const formattedAmount = 'Rp ' + Math.round(item.totalPrice || 0).toLocaleString('id-ID');
  logActivity(
    'ADD_INVENTORY',
    `Menambahkan stok inventori: ${item.name} sebanyak ${item.quantity}${item.unit ? ' ' + item.unit : ''} (Total: ${formattedAmount})`,
    actorName,
    reason
  );
};

export const updateInventory = async (id: string, item: Partial<InventoryItem>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const payload: any = {};
  if (item.name !== undefined || item.unit !== undefined) {
    const finalName = item.name !== undefined ? item.name : undefined;
    if (finalName !== undefined) {
      payload.name = item.unit ? `${finalName}|||${item.unit}` : finalName;
    }
  }
  if (item.category !== undefined) payload.category = item.category;
  if (item.quantity !== undefined) payload.quantity = item.quantity;
  if (item.unitPrice !== undefined) payload.unit_price = item.unitPrice;
  if (item.totalPrice !== undefined) payload.total_price = item.totalPrice;
  if (item.date !== undefined) payload.date = item.date;

  const { data: inv } = await supabase.from('inventory').select('name').eq('id', id).single();
  const { error } = await supabase.from('inventory').update(payload).eq('id', id);
  if (error) {
    handleApiError('', error);
    throw error;
  }

  invalidateInventoryCache();

  const finalName = item.name || inv?.name?.split('|||')[0] || 'Tidak diketahui';
  logActivity('UPDATE_INVENTORY', `Memperbarui data inventori: ${finalName}`, actorName, reason);
};

export const deleteInventory = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const { data: inv } = await supabase.from('inventory').select('name').eq('id', id).single();
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) {
    handleApiError('', error);
    throw error;
  }

  invalidateInventoryCache();

  const deletedName = inv?.name?.split('|||')[0] || 'Tidak diketahui';
  logActivity('DELETE_INVENTORY', `Menghapus data inventori: ${deletedName}`, actorName, reason);
};

// ================= SEQUENTIAL IMAGE OPTIMIZER =================
const enqueueImageOptimization = (id: string, img: string) => {
  if (processedProductImages.has(id)) return;
  processedProductImages.add(id);
  imageOptimizationQueue.push({ id, img });

  if (!imageOptimizationQueueRunning) {
    imageOptimizationQueueRunning = true;
    const processNext = () => {
      const next = imageOptimizationQueue.shift();
      if (!next) {
        imageOptimizationQueueRunning = false;
        return;
      }
      setTimeout(async () => {
        try {
          const cleaned = await compressImage(next.img, 450, 0.75);
          if (cleaned && cleaned.length < next.img.length) {
            await supabase.from('products').update({ image: cleaned }).eq('id', next.id);
          }
        } catch {
          // silent background optimization
        } finally {
          processNext();
        }
      }, 800);
    };
    processNext();
  }
};

// ================= PRODUCTS =================
export const getProducts = async (forceRefresh = false): Promise<Product[]> => {
  const user = await getUser();
  if (!user) return [];

  const now = Date.now();
  if (!forceRefresh && productsCache && productsCache.userId === user.id && now - productsCache.timestamp < PRODUCTS_TTL) {
    return productsCache.data;
  }
  if (!forceRefresh && productsInflight) return productsInflight;

  productsInflight = Promise.resolve(
    supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
  )
    .then(({ data, error }) => {
      productsInflight = null;
      if (error) {
        console.error('getProducts error:', error);
        return [];
      }

      const recipesMap = (user.user_metadata?.product_recipes || {}) as Record<string, any[]>;
      const mapped: Product[] = (data || []).map((row) => {
        const img = row.image;
        if (img && typeof img === 'string' && img.startsWith('data:image/') && img.length > 85000) {
          enqueueImageOptimization(row.id, img);
        }

        return {
          id: row.id,
          name: row.name,
          price: Number(row.price),
          image: img,
          category: row.category || 'Umum',
          recipes: recipesMap[row.id] || [],
        };
      });

      productsCache = { userId: user.id, data: mapped, timestamp: Date.now() };
      return mapped;
    })
    .catch((err: any) => {
      productsInflight = null;
      console.error('getProducts exception:', err);
      return [];
    });

  return productsInflight;
};

export const addProduct = async (p: Omit<Product, 'id'>, actorName?: string, reason?: string): Promise<{ error: any }> => {
  const user = await checkActiveUser();
  if (!user) return { error: 'User not authenticated' };

  let newId: string | null = null;
  const { data: inserted, error } = await supabase
    .from('products')
    .insert([
      {
        name: p.name,
        price: p.price,
        image: p.image,
        category: p.category || 'Umum',
        user_id: user.id,
      },
    ])
    .select('id');

  if (error) {
    if (error.code === '42703' || error.message?.includes('category')) {
      const { data: inserted2, error: error2 } = await supabase
        .from('products')
        .insert([
          {
            name: p.name,
            price: p.price,
            image: p.image,
            user_id: user.id,
          },
        ])
        .select('id');
      if (error2) {
        console.error('addProduct error:', error2);
        return { error: error2 };
      }
      newId = inserted2?.[0]?.id || null;
      logActivity('ADD_PRODUCT', `Menambahkan menu baru: ${p.name} (Kategori: default)`, actorName, reason);
    } else {
      console.error('addProduct error:', error);
      return { error };
    }
  } else {
    newId = inserted?.[0]?.id || null;
    logActivity('ADD_PRODUCT', `Menambahkan menu baru: ${p.name} (Kategori: ${p.category})`, actorName, reason);
  }

  if (newId && p.recipes && p.recipes.length > 0) {
    const currentRecipes = { ...(user.user_metadata?.product_recipes || {}) };
    currentRecipes[newId] = p.recipes;
    await supabase.auth.updateUser({ data: { product_recipes: currentRecipes } });
    invalidateUserCache();
  }

  invalidateProductsCache();
  return { error: null };
};

export const deleteProduct = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const { data: prod } = await supabase.from('products').select('name').eq('id', id).single();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    handleApiError('', error);
    throw error;
  }
  logActivity('DELETE_PRODUCT', `Menghapus menu: ${prod?.name || 'Tidak diketahui'}`, actorName, reason);

  const currentRecipes = { ...(user.user_metadata?.product_recipes || {}) };
  if (currentRecipes[id]) {
    delete currentRecipes[id];
    await supabase.auth.updateUser({ data: { product_recipes: currentRecipes } });
    invalidateUserCache();
  }

  invalidateProductsCache();
};

export const updateProduct = async (id: string, p: Partial<Product>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const payload: any = {};
  if (p.name !== undefined) payload.name = p.name;
  if (p.price !== undefined) payload.price = p.price;
  if (p.image !== undefined) payload.image = p.image;
  if (p.category !== undefined) payload.category = p.category;
  const { data: prod } = await supabase.from('products').select('name').eq('id', id).single();
  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) {
    handleApiError('', error);
    throw error;
  }
  logActivity('UPDATE_PRODUCT', `Memperbarui menu: ${p.name || prod?.name || 'Tidak diketahui'}`, actorName, reason);

  if (p.recipes !== undefined) {
    const currentRecipes = { ...(user.user_metadata?.product_recipes || {}) };
    currentRecipes[id] = p.recipes;
    await supabase.auth.updateUser({ data: { product_recipes: currentRecipes } });
    invalidateUserCache();
  }

  invalidateProductsCache();
};

export const initStorage = () => {
  // No-op for cloud DB
};

// ================= CATEGORIES & ADD-ONS =================
export const getCategories = async (): Promise<string[]> => {
  const user = await getUser();
  if (!user) return [];
  let categories: string[] = Array.isArray(user.user_metadata?.product_categories)
    ? user.user_metadata.product_categories
    : [];

  // Auto-restore dari tabel 'products' (bukan 'items') apabila daftar kategori kosong
  if (categories.length === 0) {
    try {
      const { data: prods } = await supabase
        .from('products')
        .select('category')
        .eq('user_id', user.id);
      if (prods && prods.length > 0) {
        const usedCategories = Array.from(new Set(prods.map((item) => item.category).filter(Boolean)));
        if (usedCategories.length > 0) {
          categories = Array.from(new Set([...usedCategories, 'Umum']));
          await supabase.auth.updateUser({
            data: { product_categories: categories },
          });
          invalidateUserCache();
        }
      }
    } catch (e) {
      console.error('Failed to auto-restore categories', e);
    }
  }

  return categories.length > 0 ? categories : ['Umum'];
};

export const getAddOns = async (): Promise<any[]> => {
  const user = await getUser();
  if (!user) return [];
  if (Array.isArray(user.user_metadata?.addons)) {
    return user.user_metadata.addons;
  }
  return [];
};

export const saveAddOns = async (addons: any[], actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const { error } = await supabase.auth.updateUser({
    data: { addons },
  });
  if (error) {
    handleApiError('', error);
    throw error;
  }
  invalidateUserCache();
  logActivity('UPDATE_ADDONS', `Memperbarui daftar opsi / Add-ons (${addons.length} item)`, actorName, reason);
};

export const saveCategories = async (categories: string[], actorName?: string, reason?: string) => {
  const user = await getUser();
  if (!user) return;
  const { error } = await supabase.auth.updateUser({
    data: { product_categories: categories },
  });
  if (error) {
    handleApiError('', error);
    throw error;
  }
  invalidateUserCache();
  logActivity('UPDATE_CATEGORIES', `Memperbarui kategori menu (${categories.length} kategori)`, actorName, reason);
};

export const renameCategoryInItems = async (oldName: string, newName: string) => {
  const user = await getUser();
  if (!user) return;

  await Promise.all([
    supabase.from('products').update({ category: newName }).eq('user_id', user.id).eq('category', oldName),
    supabase.from('inventory').update({ category: newName }).eq('user_id', user.id).eq('category', oldName),
  ]);
  invalidateProductsCache();
  invalidateInventoryCache();
};

// ================= RECIPES =================
export const deductInventory = async (cartItems: { quantity: number; extras?: ExtraItem[]; product?: Product }[]) => {
  const user = await getUser();
  if (!user) return;

  const recipesMap = (user.user_metadata?.product_recipes || {}) as Record<string, { inventoryId: string; quantity: number }[]>;
  const inventoryUsage: Record<string, number> = {};

  for (const item of cartItems) {
    const productRecipes = item.product?.recipes || (item.product?.id ? recipesMap[item.product.id] : undefined);
    if (productRecipes && Array.isArray(productRecipes)) {
      for (const recipe of productRecipes) {
        if (!inventoryUsage[recipe.inventoryId]) inventoryUsage[recipe.inventoryId] = 0;
        inventoryUsage[recipe.inventoryId] += Number(recipe.quantity) * item.quantity;
      }
    }

    if (item.extras && Array.isArray(item.extras)) {
      for (const extra of item.extras) {
        if (!inventoryUsage[extra.inventoryId]) inventoryUsage[extra.inventoryId] = 0;
        inventoryUsage[extra.inventoryId] += Number(extra.quantity) * item.quantity;
      }
    }
  }

  const inventoryIds = Object.keys(inventoryUsage);
  if (inventoryIds.length === 0) return;

  const { data: currentInventory } = await supabase
    .from('inventory')
    .select('id, quantity')
    .in('id', inventoryIds)
    .eq('user_id', user.id);

  if (currentInventory && currentInventory.length > 0) {
    await Promise.all(
      currentInventory.map((inv) => {
        const used = inventoryUsage[inv.id];
        if (used) {
          const newQty = Math.max(0, Number(inv.quantity) - used);
          return supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
        }
        return Promise.resolve();
      })
    );
    invalidateInventoryCache();
  }
};
