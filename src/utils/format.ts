import { format as dateFnsFormat, isValid, parseISO } from 'date-fns';

export const formatCurrency = (amount?: number) => {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  // Gunakan spasi ASCII standar agar aman di semua WebView Android, Safari iOS, WhatsApp, dan printer struk
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
};

export const safeParseDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? new Date() : dateVal;

  let str = String(dateVal).trim();
  if (!str) return new Date();

  // Normalisasi string tanggal murni yang tidak sengaja berakhiran 'Z' (misal '2026-11-26Z')
  if (/^\d{4}-\d{2}-\d{2}Z$/i.test(str)) {
    str = str.slice(0, 10);
  }

  // Normalisasi SQL timestamp ('YYYY-MM-DD HH:mm:ss') ke ISO 8601 ('YYYY-MM-DDTHH:mm:ss') agar kompatibel di Apple Safari/WebKit
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }

  // 1. Gunakan date-fns parseISO (kebal bug Safari iOS/macOS)
  let d = parseISO(str);
  if (isValid(d) && !isNaN(d.getTime())) return d;

  // 2. Native Date constructor
  d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // 3. Fallback iOS Safari lama: ubah ke YYYY/MM/DD HH:mm:ss
  const cleanLocal = str.substring(0, 19).replace('T', ' ').replace(/-/g, '/');
  d = new Date(cleanLocal);
  if (!isNaN(d.getTime())) return d;

  return new Date();
};

export const safeFormatDate = (dateVal: any, formatStr: string, options?: any): string => {
  try {
    const d = safeParseDate(dateVal);
    if (!isValid(d) || isNaN(d.getTime())) return '-';
    return dateFnsFormat(d, formatStr, options);
  } catch {
    return '-';
  }
};
