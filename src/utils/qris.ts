export function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  const hex = (crc & 0xFFFF).toString(16).toUpperCase();
  return hex.padStart(4, '0');
}

export function generateDynamicQRIS(staticQRIS: string, amount: number): string {
  if (!staticQRIS) return '';
  let base = staticQRIS.trim();

  // Remove the old CRC (last 4 characters)
  base = base.slice(0, -4);

  // Remove "6304" from the end if we just sliced the CRC
  if (base.endsWith('6304')) {
    base = base.slice(0, -4);
  } else {
    const idx = base.lastIndexOf('6304');
    if (idx !== -1) {
      base = base.slice(0, idx);
    }
  }

  // Strip any existing tag 54 (Transaction Amount) if staticQRIS already contained one
  base = base.replace(/54(\d{2})(.+?)(?=5802ID|59\d{2}|60\d{2}|62\d{2}|$)/, (full, lenStr, rest) => {
    const len = parseInt(lenStr, 10);
    if (!isNaN(len) && rest.length >= len) {
      return rest.slice(len);
    }
    return full;
  });

  const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
  const amountStr = safeAmount.toString();
  const amountLen = amountStr.length.toString().padStart(2, '0');
  const tag54 = `54${amountLen}${amountStr}`;

  // Replace Point of Initiation Method from Static (11) to Dynamic (12)
  base = base.replace('010211', '010212');

  const payload = base + tag54 + '6304';
  const crc = calculateCRC16(payload);

  return payload + crc;
}
