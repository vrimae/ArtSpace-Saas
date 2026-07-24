import type { Transaction, InventoryItem, Product, ExtraItem, ActivityLog } from '../types';
import { supabase } from '../lib/supabase';

const handleApiError = (context: string, error: any) => {
  console.error(`${context}`, error);
  if (error && (error.code === 'PGRST301' || error.code === '42501' || error.message?.toLowerCase().includes('jwt') || error.message?.toLowerCase().includes('banned') || error.message?.toLowerCase().includes('security') || error.message?.toLowerCase().includes('invalid'))) {
    window.dispatchEvent(new CustomEvent('auth_expired_error', { detail: error.message }));
  }
};

// ================= CACHED USER =================
// Cache the user object to avoid repeated auth calls within the same session.
// The cache is invalidated on auth state changes (login/logout).
let cachedUser: any = null;
let userPromise: Promise<any> | null = null;

const getUser = async () => {
  if (cachedUser) return cachedUser;
  // Deduplicate concurrent calls
  if (userPromise) return userPromise;
  userPromise = supabase.auth.getUser().then(({ data: { user } }) => {
    cachedUser = user;
    userPromise = null;
    return user;
  }).catch(() => {
    userPromise = null;
    return null;
  });
  return userPromise;
};

// Clear cache on auth state change
supabase.auth.onAuthStateChange(() => {
  cachedUser = null;
  userPromise = null;
});

const checkActiveUser = async () => {
  // Always fetch fresh user data from Supabase (bypass cache)
  // so that admin changes via SQL Editor take effect immediately
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.dispatchEvent(new CustomEvent('auth_expired_error', { detail: 'Maaf akun anda telah expired' }));
    throw new Error('Sesi tidak valid atau akun dinonaktifkan');
  }
  
  // Update cache with fresh data
  cachedUser = user;
  
  return user;
};

// ================= PROFILES =================
export const checkAnalyticsAccess = async (): Promise<boolean> => {
  const user = await checkActiveUser();
  if (!user) return false;

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
  const [analytics, ai] = await Promise.all([
    checkAnalyticsAccess(),
    checkAiAccess()
  ]);
  return analytics || ai;
};

// ================= ACTIVITY LOGS =================
export const logActivity = async (action: string, description: string, actorName?: string, reason?: string) => {
  const payload: any = { action, description };
  if (actorName) payload.actor_name = actorName;
  if (reason) payload.reason = reason;
  const { data: { user } } = await supabase.auth.getUser();
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
    return {
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      category: row.category,
      description: row.description,
      date: dateStr,
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
    description: t.description,
    date: t.date,
    user_id: user.id
  }]).select();
  
  if (error) {
    handleApiError('Gagal menambah transaksi', error);
    throw new Error(error.message);
  }
  
  const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(t.amount);
  logActivity('ADD_TRANSACTION', `Menambahkan ${t.type === 'income' ? 'pemasukan' : 'pengeluaran'} baru: ${t.category} sebesar ${formattedAmount} (${t.description})`, actorName, reason);
  
  return data;
};

export const updateTransaction = async (id: string, t: Partial<Transaction>, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const payload: any = {};
  if (t.type !== undefined) payload.type = t.type;
  if (t.amount !== undefined) payload.amount = t.amount;
  if (t.category !== undefined) payload.category = t.category;
  if (t.description !== undefined) payload.description = t.description;
  if (t.date !== undefined) payload.date = t.date;
  const { data: tx } = await supabase.from('transactions').select('category, description').eq('id', id).single();
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
  
  return (data || []).map(row => ({ id: row.id, name: row.name, price: Number(row.price), image: row.image, category: row.category || 'water_based' }));
};

export const addProduct = async (p: Omit<Product, 'id'>, actorName?: string, reason?: string): Promise<{ error: any }> => {
  const user = await checkActiveUser();
  if (!user) return { error: 'User not authenticated' };

  // Try with category first
  const { error } = await supabase.from('products').insert([{
    name: p.name,
    price: p.price,
    image: p.image,
    category: p.category || 'water_based',
    user_id: user.id,
  }]);

  if (error) {
    // If category column doesn't exist, try without it
    if (error.code === '42703' || error.message?.includes('category')) {
      const { error: error2 } = await supabase.from('products').insert([{
        name: p.name,
        price: p.price,
        image: p.image,
        user_id: user.id,
      }]);
      if (error2) { console.error('addProduct error:', error2); return { error: error2 }; }
      logActivity('ADD_PRODUCT', `Menambahkan menu baru: ${p.name} (Kategori: default)`, actorName, reason);
      return { error: null };
    }
    console.error('addProduct error:', error);
    return { error };
  }
  logActivity('ADD_PRODUCT', `Menambahkan menu baru: ${p.name} (Kategori: ${p.category})`, actorName, reason);
  return { error: null };
};

export const deleteProduct = async (id: string, actorName?: string, reason?: string) => {
  const user = await checkActiveUser(); if (!user) return;
  const { data: prod } = await supabase.from('products').select('name').eq('id', id).single();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { handleApiError('', error); throw error; }
  logActivity('DELETE_PRODUCT', `Menghapus menu: ${prod?.name || 'Tidak diketahui'}`, actorName, reason);
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
  return [];
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
  logActivity('UPDATE_ADDONS', `Memperbarui daftar resep/Add-ons (${addons.length} item)`, actorName, reason);
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
export const deductInventory = async (cartItems: { quantity: number, extras: ExtraItem[] }[]) => {
  const user = await getUser();
  if (!user) return;
  
  // Aggregate required inventory items based on extras in the cart
  const inventoryUsage: Record<string, number> = {};
  for (const item of cartItems) {
    if (item.extras && Array.isArray(item.extras)) {
      for (const extra of item.extras) {
        if (!inventoryUsage[extra.inventoryId]) inventoryUsage[extra.inventoryId] = 0;
        inventoryUsage[extra.inventoryId] += (extra.quantity * item.quantity);
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
          const newQty = inv.quantity - used;
          return supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
        }
        return Promise.resolve();
      })
    );
  }
};



