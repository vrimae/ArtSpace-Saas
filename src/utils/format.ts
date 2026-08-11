import { format as dateFnsFormat, isValid, parseISO } from 'date-fns';

export const formatCurrency = (amount?: number) => {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
};

export const safeParseDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? new Date() : dateVal;
  
  let str = String(dateVal).trim();
  
  // 1. Use date-fns parseISO (bulletproof across all browsers, ignores Safari bugs)
  let d = parseISO(str);
  if (isValid(d) && !isNaN(d.getTime())) return d;

  // 2. Native Date constructor
  d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // 3. Handle SQL format (YYYY-MM-DD HH:mm:ss) by injecting 'T'
  if (str.includes(' ') && !str.includes('T')) {
    d = new Date(str.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Ultimate iOS Safari fallback: strip timezone/milliseconds and use YYYY/MM/DD HH:mm:ss
  let cleanLocal = str.substring(0, 19).replace('T', ' ').replace(/-/g, '/');
  d = new Date(cleanLocal);
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
