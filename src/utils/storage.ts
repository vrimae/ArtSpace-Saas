import type { Transaction, InventoryItem, Product, ExtraItem, ActivityLog } from '../types';
import { supabase } from '../lib/supabase';
import { compressImage } from './cropImage';

const handleApiError = (context: string, error: any) => {
  console.error(`${context}`, error);
  if (error && (error.code === 'PGRST301' || error.code === '42501' || error.message?.toLowerCase().includes('jwt') || error.message?.toLowerCase().includes('banned') || error.message?.toLowerCase().includes('security') || error.message?.toLowerCase().includes('invalid'))) {
    window.dispatchEvent(new CustomEvent('auth_expired_error', { detail: error.message }));
  }
};

// ================= CACHED USER (WITH HIGH-PERFORMANCE TTL) =================
let cachedUser: any = null;
let lastCacheTime = 0;
let userPromise: Promise<any> | null = null;
const CACHE_TTL = 45 * 1000; // 45 seconds TTL to eliminate repeated network delay (anti-lag)

export const getUser = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedUser && (now - lastCacheTime < CACHE_TTL)) {
    return cachedUser;
  }
  if (userPromise) return userPromise;

  userPromise = supabase.auth.getUser().then(({ data: { user } }) => {
    cachedUser = user;
    lastCacheTime = Date.now();
    userPromise = null;
    return user;
  }).catch(() => {
    userPromise = null;
    return cachedUser || null;
  });
  return userPromise;
};

// Clear cache on auth state change
supabase.auth.onAuthStateChange(() => {
  cachedUser = null;
  lastCacheTime = 0;
  userPromise = null;
});

const checkActiveUser = async () => {
  // Gunakan cached user jika masih dalam window TTL 45 detik agar sistem ringan & anti-lag
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

// Kept for backwards compatibility just in case
export const checkProAccess = checkAnalyticsAccess;

export const checkIsActiveSubscription = async (): Promise<boolean> => {
  // Selalu aktif agar Kasir (POS) tidak pernah terblokir atau ke mode hanya-lihat
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
  
  // Trigger cleanup for logs older than 1 month asynchronously
  supabase.rpc('delete_old_logs').then(({ error }) => {
    if (error) console.error('Failed to cleanup old logs:', error);
  });

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
export const getFinancialSummary = async (): Promise<{ total_income: number, total_expense: number, balance: number, month_income: number, today_income: number }> => {
  const user = await getUser();
  if (!user) return { total_income: 0, total_expense: 0, balance: 0, month_income: 0, today_income: 0 };
  const { data, error } = await supabase.rpc('get_financial_summary', { p_user_id: user.id });
  if (error || !data || data.length === 0) {
    console.error('getFinancialSummary error:', error);
    return { total_income: 0, total_expense: 0, balance: 0, month_income: 0, today_income: 0 };
  }
  return {
    total_income: Number(data[0].total_income || 0),
    total_expense: Number(data[0].total_expense || 0),
    balance: Number(data[0].balance || 0),
    month_income: Number(data[0].month_income || 0),
    today_income: Number(data[0].today_income || 0),
  };
};

export const encodeTransactionDescription = (t: Partial<Transaction>) => {
  let prefix = '';
  if (t.poStatus) {
    prefix += `[PO|${t.poStatus}|${t.poPickupDate || ''}|${t.customerName || ''}|${t.customerPhone || ''}|${t.poTotalAmount || ''}|${t.poDpAmount || ''}] `;
  }
  return prefix + (t.description || '');
};

export const decodeTransactionDescription = (rowDesc: string) => {
  let desc = rowDesc || '';
  let poStatus, poPickupDate, customerName, customerPhone, poTotalAmount, poDpAmount;
  
  const poMatch = desc.match(/^\[PO\|(.*?)\|(.*?)\|(.*?)\|(.*?)(?:\|(.*?)\|(.*?))?\]\s/);
  if (poMatch) {
    poStatus = poMatch[1] as 'pending' | 'selesai';
    poPickupDate = poMatch[2];
    customerName = poMatch[3];
    customerPhone = poMatch[4];
    poTotalAmount = poMatch[5] ? Number(poMatch[5]) : undefined;
    poDpAmount = poMatch[6] ? Number(poMatch[6]) : undefined;
    desc = desc.replace(poMatch[0], '');
  }
  
  return { description: desc, poStatus, poPickupDate, customerName, customerPhone, poTotalAmount, poDpAmount };
};

export const getTransactions = async (limitCount = 100, offset = 0): Promise<Transaction[]> => {
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limitCount - 1);
  if (error) { console.error('getTransactions error:', error); return []; }
  return (data || []).map(row => {
    let dateStr = row.date || row.created_at || new Date().toISOString();
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
      dateStr += 'Z';
    }
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
      poDpAmount: decoded.poDpAmount
    };
  });
};

export const addTransaction = async (t: Omit<Transaction, 'id'> & { id?: string }, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) throw new Error("Sesi telah berakhir. Silakan login kembali.");
  
  const { data, error } = await supabase.from('transactions').insert([{
    type: t.type,
    amount: t.amount,
    category: t.category,
    description: encodeTransactionDescription(t),
    date: t.date,
    user_id: user.id
  }]).select('id');
  
  if (error) {
    handleApiError('Gagal menambah transaksi', error);
    throw new Error(error.message);
  }
  
  // ⚡ NON-BLOCKING ASYNC LOGGING
  setTimeout(() => {
    const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(t.amount);
    logActivity('ADD_TRANSACTION', `Menambahkan ${t.type === 'income' ? 'pemasukan' : 'pengeluaran'} baru: ${t.category} sebesar ${formattedAmount} (${t.description})`, actorName, reason);
  }, 10);
  
  return data;
};

export const updateTransaction = async (id: string, t: Partial<Transaction>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const { data: tx } = await supabase.from('transactions').select('category, description').eq('id', id).single();
  
  const payload: any = {};
  if (t.type !== undefined) payload.type = t.type;
  if (t.amount !== undefined) payload.amount = t.amount;
  if (t.category !== undefined) payload.category = t.category;
  if (t.date !== undefined) payload.date = t.date;
  
  if (t.description !== undefined || t.poStatus !== undefined) {
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
  if (error) { handleApiError('', error); throw error; }
  const finalCategory = t.category || tx?.category || 'Tidak diketahui';
  const finalDesc = t.description || tx?.description || '';
  logActivity('UPDATE_TRANSACTION', `Memperbarui transaksi: ${finalCategory} ${finalDesc ? `(${finalDesc})` : ''}`.trim(), actorName, reason);
};

export const deleteTransaction = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const { data: tx } = await supabase.from('transactions').select('category, description').eq('id', id).single();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) { handleApiError('', error); throw error; }
  logActivity('DELETE_TRANSACTION', `Menghapus transaksi: ${tx?.category || 'Tidak diketahui'} ${tx?.description ? `(${tx.description})` : ''}`.trim(), actorName, reason);
};

// ================= INVENTORY =================
export const getInventory = async (): Promise<InventoryItem[]> => {
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('getInventory error:', error); return []; }
  
  return (data || []).map(row => {
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
};

export const addInventory = async (item: Omit<InventoryItem, 'id'> & { id?: string }, actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const encodedName = item.unit ? `${item.name}|||${item.unit}` : item.name;
  const { error } = await supabase.from('inventory').insert([{
    name: encodedName,
    category: item.category,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    date: item.date,
    user_id: user.id,
  }]);
  if (error) { handleApiError('', error); throw error; }
  
  const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.totalPrice);
  logActivity('ADD_INVENTORY', `Menambahkan stok inventori: ${item.name} sebanyak ${item.quantity}${item.unit ? ' '+item.unit : ''} (Total: ${formattedAmount})`, actorName, reason);
};

export const updateInventory = async (id: string, item: Partial<InventoryItem>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const payload: any = {};
  if (item.name !== undefined || item.unit !== undefined) {
    // We need both name and unit to encode it properly.
    // However, if only one is provided in update, we'd need the current one.
    // We'll rely on the caller sending both if they want to update them, or handle it carefully.
    // For simplicity, we assume updateInventory is always called with the full item from the UI
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
  if (error) { handleApiError('', error); throw error; }
  const finalName = item.name || inv?.name?.split('|||')[0] || 'Tidak diketahui';
  logActivity('UPDATE_INVENTORY', `Memperbarui data inventori: ${finalName}`, actorName, reason);
};

export const deleteInventory = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const { data: inv } = await supabase.from('inventory').select('name').eq('id', id).single();
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) { handleApiError('', error); throw error; }
  const deletedName = inv?.name?.split('|||')[0] || 'Tidak diketahui';
  logActivity('DELETE_INVENTORY', `Menghapus data inventori: ${deletedName}`, actorName, reason);
};

// ================= PRODUCTS =================
export const getProducts = async (): Promise<Product[]> => {
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('getProducts error:', error); return []; }
  
  const recipesMap = (user.user_metadata?.product_recipes || {}) as Record<string, any[]>;
  return (data || []).map(row => {
    let img = row.image;
    // Auto-clean Optimizer: Jika terdapat gambar berukuran besar di database (>80KB),
    // lakukan kompresi latar belakang secara otomatis agar loading web selalu cepat & bebas lag!
    if (img && typeof img === 'string' && img.startsWith('data:image/') && img.length > 80000) {
      setTimeout(async () => {
        try {
          const cleaned = await compressImage(img, 450, 0.75);
          if (cleaned && cleaned.length < img.length) {
            await supabase.from('products').update({ image: cleaned }).eq('id', row.id);
          }
        } catch (e) { /* silent fail for background optimization */ }
      }, 500);
    }

    return { 
      id: row.id, 
      name: row.name, 
      price: Number(row.price), 
      image: img, 
      category: row.category || 'Umum',
      recipes: recipesMap[row.id] || []
    };
  });
};

export const addProduct = async (p: Omit<Product, 'id'>, actorName?: string, reason?: string): Promise<{ error: any }> => {
  const user = await checkActiveUser();
  if (!user) return { error: 'User not authenticated' };

  let newId: string | null = null;
  // Try with category first
  const { data: inserted, error } = await supabase.from('products').insert([{
    name: p.name,
    price: p.price,
    image: p.image,
    category: p.category || 'Umum',
    user_id: user.id,
  }]).select('id');

  if (error) {
    // If category column doesn't exist, try without it
    if (error.code === '42703' || error.message?.includes('category')) {
      const { data: inserted2, error: error2 } = await supabase.from('products').insert([{
        name: p.name,
        price: p.price,
        image: p.image,
        user_id: user.id,
      }]).select('id');
      if (error2) { console.error('addProduct error:', error2); return { error: error2 }; }
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
  }

  return { error: null };
};

export const deleteProduct = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const { data: prod } = await supabase.from('products').select('name').eq('id', id).single();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { handleApiError('', error); throw error; }
  logActivity('DELETE_PRODUCT', `Menghapus menu: ${prod?.name || 'Tidak diketahui'}`, actorName, reason);

  const currentRecipes = { ...(user.user_metadata?.product_recipes || {}) };
  if (currentRecipes[id]) {
    delete currentRecipes[id];
    await supabase.auth.updateUser({ data: { product_recipes: currentRecipes } });
  }
};

export const updateProduct = async (id: string, p: Partial<Product>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const payload: any = {};
  if (p.name !== undefined) payload.name = p.name;
  if (p.price !== undefined) payload.price = p.price;
  if (p.image !== undefined) payload.image = p.image;
  if (p.category !== undefined) payload.category = p.category;
  const { data: prod } = await supabase.from('products').select('name').eq('id', id).single();
  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) { handleApiError('', error); throw error; }
  logActivity('UPDATE_PRODUCT', `Memperbarui menu: ${p.name || prod?.name || 'Tidak diketahui'}`, actorName, reason);

  if (p.recipes !== undefined) {
    const currentRecipes = { ...(user.user_metadata?.product_recipes || {}) };
    currentRecipes[id] = p.recipes;
    await supabase.auth.updateUser({ data: { product_recipes: currentRecipes } });
  }
};

export const initStorage = () => {
  // No-op for cloud DB
};

// ================= CATEGORIES =================
export const getCategories = async (): Promise<string[]> => {
  const user = await getUser();
  if (!user) return [];
  if (user.user_metadata?.product_categories) {
    return user.user_metadata.product_categories;
  }
  return ['Umum'];
};

export const getAddOns = async (): Promise<any[]> => {
  const user = await getUser();
  if (!user) return [];
  if (user.user_metadata?.addons) {
    return user.user_metadata.addons;
  }
  return [];
};

export const saveAddOns = async (addons: any[], actorName?: string, reason?: string) => {
  const user = await checkActiveUser();
  if (!user) return;
  const { error } = await supabase.auth.updateUser({
    data: { addons }
  });
  if (error) { handleApiError('', error); throw error; }
  logActivity('UPDATE_ADDONS', `Memperbarui daftar opsi / Add-ons (${addons.length} item)`, actorName, reason);
};

export const saveCategories = async (categories: string[], actorName?: string, reason?: string) => {
  const user = await getUser();
  if (!user) return;
  const { error } = await supabase.auth.updateUser({
    data: { product_categories: categories }
  });
  if (error) { handleApiError('', error); throw error; }
  // Invalidate cached user since metadata changed
  cachedUser = null;
  logActivity('UPDATE_CATEGORIES', `Memperbarui kategori menu (${categories.length} kategori)`, actorName, reason);
};

export const renameCategoryInItems = async (oldName: string, newName: string) => {
  const user = await getUser();
  if (!user) return;
  
  // Run both updates in parallel
  await Promise.all([
    supabase.from('products').update({ category: newName }).eq('user_id', user.id).eq('category', oldName),
    supabase.from('inventory').update({ category: newName }).eq('user_id', user.id).eq('category', oldName),
  ]);
};

// ================= RECIPES =================
export const deductInventory = async (cartItems: { quantity: number; extras?: ExtraItem[]; product?: Product }[]) => {
  const user = await getUser();
  if (!user) return;
  
  const recipesMap = (user.user_metadata?.product_recipes || {}) as Record<string, { inventoryId: string; quantity: number }[]>;
  const inventoryUsage: Record<string, number> = {};

  for (const item of cartItems) {
    // 1. Deduct from product recipes / BOM linked to inventory
    const productRecipes = item.product?.recipes || (item.product?.id ? recipesMap[item.product.id] : undefined);
    if (productRecipes && Array.isArray(productRecipes)) {
      for (const recipe of productRecipes) {
        if (!inventoryUsage[recipe.inventoryId]) inventoryUsage[recipe.inventoryId] = 0;
        inventoryUsage[recipe.inventoryId] += (Number(recipe.quantity) * item.quantity);
      }
    }

    // 2. Deduct from order-specific extras selected during checkout
    if (item.extras && Array.isArray(item.extras)) {
      for (const extra of item.extras) {
        if (!inventoryUsage[extra.inventoryId]) inventoryUsage[extra.inventoryId] = 0;
        inventoryUsage[extra.inventoryId] += (Number(extra.quantity) * item.quantity);
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
    // Batch all updates in parallel instead of sequential
    await Promise.all(
      currentInventory.map(inv => {
        const used = inventoryUsage[inv.id];
        if (used) {
          const newQty = Math.max(0, Number(inv.quantity) - used);
          return supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
        }
        return Promise.resolve();
      })
    );
  }
};



