import { lazy, type ComponentType } from 'react';

export const APP_CACHE_VERSION = 'vrimae-pos-v2.6.0';
const VERSION_STORAGE_KEY = 'vrimae_app_cache_version';
const CHUNK_RELOAD_GUARD_KEY = 'vrimae_chunk_reload_ts';

// Kunci penting yang TIDAK BOLEH dihapus agar sesi login & preferensi toko tetap aman
const isProtectedStorageKey = (key: string): boolean => {
  if (!key) return false;
  if (key.startsWith('sb-')) return true; // Token sesi resmi Supabase Auth
  if (key.includes('supabase')) return true;
  if (key === 'theme' || key === 'vrimae_theme') return true;
  if (key === VERSION_STORAGE_KEY) return true;
  if (key.startsWith('vrimae_ai_prompts_')) return true; // Kuota harian AI tetap akurat
  return false;
};

/**
 * Membersihkan CacheStorage browser & Service Worker usang (jika ada)
 * tanpa menyentuh Cookies, IndexedDB transaksi, atau sesi login Supabase.
 */
export const clearBrowserAssetCaches = async (): Promise<number> => {
  let clearedCount = 0;

  try {
    if ('caches' in window && window.caches) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames.map(async (name) => {
          await window.caches.delete(name);
          clearedCount++;
        })
      );
    }
  } catch (err) {
    console.warn('CacheStorage cleanup skipped:', err);
  }

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (reg) => {
          await reg.unregister();
          clearedCount++;
        })
      );
    }
  } catch (err) {
    console.warn('ServiceWorker cleanup skipped:', err);
  }

  return clearedCount;
};

/**
 * Membersihkan sampah sementara di localStorage/sessionStorage yang kadaluarsa
 * dengan tetap menjaga 100% sesi akun, tema, dan data bisnis.
 */
export const pruneStaleLocalStorage = (): number => {
  let removed = 0;
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || isProtectedStorageKey(key)) continue;

      // Bersihkan riwayat chat AI sementara yang sudah lebih dari 48 jam agar localStorage iOS/Safari (limit 5MB) tetap lega
      if (key.startsWith('vrimae_ai_chat_time_')) {
        const userId = key.replace('vrimae_ai_chat_time_', '');
        const savedTime = localStorage.getItem(key);
        if (savedTime) {
          const parsedTime = new Date(savedTime).getTime();
          if (isNaN(parsedTime) || now - parsedTime > 48 * 60 * 60 * 1000) {
            keysToRemove.push(key);
            keysToRemove.push(`vrimae_ai_chat_history_${userId}`);
          }
        }
      } else if (key.startsWith('temp_') || key.startsWith('cache_') || key.startsWith('debug_')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => {
      localStorage.removeItem(k);
      removed++;
    });
  } catch (err) {
    console.warn('LocalStorage prune skipped:', err);
  }
  return removed;
};

/**
 * Dijalankan otomatis saat aplikasi pertama dibuka.
 * Jika mendeteksi versi rilis baru, cache aset lama langsung dibersihkan otomatis.
 */
export const runStartupCacheMaintenance = async (onInvalidateMemory?: () => void): Promise<void> => {
  try {
    // Sinkronkan kunci tema lama & baru agar tidak terjadi kedipan warna (FOUC) di semua perangkat
    const savedTheme = localStorage.getItem('theme') || localStorage.getItem('vrimae_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      localStorage.setItem('theme', savedTheme);
      localStorage.setItem('vrimae_theme', savedTheme);
    }

    pruneStaleLocalStorage();

    const previousVersion = localStorage.getItem(VERSION_STORAGE_KEY);
    if (previousVersion !== APP_CACHE_VERSION) {
      await clearBrowserAssetCaches();
      if (onInvalidateMemory) onInvalidateMemory();
      localStorage.setItem(VERSION_STORAGE_KEY, APP_CACHE_VERSION);
    }
  } catch (err) {
    console.warn('Startup cache maintenance warning:', err);
  }
};

/**
 * Tombol "Bersihkan Cache Sistem" yang aman dipanggil kapan saja dari halaman Setelan.
 * TIDAK me-logout akun dan TIDAK menghapus transaksi/produk/inventori/pengaturan toko.
 */
export const clearSystemCacheSafely = async (onInvalidateMemory?: () => Promise<void> | void): Promise<void> => {
  if (onInvalidateMemory) {
    await onInvalidateMemory();
  }
  pruneStaleLocalStorage();

  try {
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
  } catch {
    // ignore
  }

  await clearBrowserAssetCaches();
  localStorage.setItem(VERSION_STORAGE_KEY, APP_CACHE_VERSION);
};

/**
 * Pembungkus React.lazy anti-crash untuk iOS Safari, Android Chrome, macOS, dan Windows.
 * Jika terjadi gagal muat modul akibat cache chunk versi lama setelah update server,
 * sistem otomatis menyegarkan cache dan memuat ulang halaman 1x tanpa layar error.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const component = await factory();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
      } catch {
        // ignore
      }
      return component;
    } catch (error: any) {
      const msg = String(error?.message || error || '').toLowerCase();
      const isChunkLoadError =
        msg.includes('failed to fetch dynamically imported module') ||
        msg.includes('importing a module script failed') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('chunkloaderror') ||
        msg.includes('loading chunk');

      if (isChunkLoadError) {
        try {
          const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || '0');
          const now = Date.now();
          // Cegah reload berulang jika internet benar-benar putus (minimal jeda 15 detik)
          if (now - lastReload > 15000) {
            sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
            await clearBrowserAssetCaches();
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        } catch {
          // Lanjut lempar ke ErrorBoundary jika sessionStorage diblokir mode privat ketat
        }
      }
      throw error;
    }
  });
}
