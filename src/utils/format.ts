import { format as dateFnsFormat, isValid } from 'date-fns';

export const formatCurrency = (amount?: number) => {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
};

export const safeParseDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? new Date() : dateVal;
  
  let str = String(dateVal).trim();
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // iOS Safari specific fallbacks:
  // 1. Replace SQL style spaces between date and time with 'T' (e.g., 2026-08-06 14:00:00 -> 2026-08-06T14:00:00)
  if (str.includes(' ') && !str.includes('T')) {
    d = new Date(str.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Replace hyphens with slashes (iOS WebKit always parses YYYY/MM/DD reliably)
  d = new Date(str.replace(/-/g, '/').replace('T', ' '));
  if (!isNaN(d.getTime())) return d;

  return new Date(); // Fallback agar rendering React di iOS tidak pernah mengalami crash / blank
};

export const safeFormatDate = (dateVal: any, formatStr: string, options?: any): string => {
  try {
    const d = safeParseDate(dateVal);
    if (!isValid(d) || isNaN(d.getTime())) return '-';
    return dateFnsFormat(d, formatStr, options);
  } catch (err) {
    return '-';
  }
};
