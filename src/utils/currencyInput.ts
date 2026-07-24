export const formatCurrencyInput = (value: string | number) => {
  const numStr = String(value).replace(/[^0-9]/g, '');
  if (!numStr) return '';
  return parseInt(numStr, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};
