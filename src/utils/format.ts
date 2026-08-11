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

  // iOS Safari older versions choke on milliseconds in ISO strings
  let cleanIso = str.replace(/\.\d+/, ''); 
  d = new Date(cleanIso);
  if (!isNaN(d.getTime())) return d;
  
  // Replace SQL style spaces between date and time with 'T'
  if (str.includes(' ') && !str.includes('T')) {
    d = new Date(str.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback: strip T and timezone, replace hyphens with slashes for bulletproof local parsing
  let cleanLocal = cleanIso.replace('T', ' ').replace(/Z|[+-]\d{2}:\d{2}$/g, '');
  d = new Date(cleanLocal.replace(/-/g, '/'));
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
