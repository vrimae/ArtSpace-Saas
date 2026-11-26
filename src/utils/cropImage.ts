export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    if (url.startsWith('http://') || url.startsWith('https://')) {
      image.setAttribute('crossOrigin', 'anonymous');
    }
    image.src = url;
  });

export function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

// Melepaskan memori GPU Canvas segera setelah selesai (penting untuk batas memori 16MP di iOS/iPadOS Safari)
const releaseCanvas = (canvas: HTMLCanvasElement) => {
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore
  }
};

export default async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  rotation = 0
): Promise<string> {
  try {
    const image = await createImage(imageSrc);
    const MAX_SIZE = 500;
    let finalWidth = Math.max(1, Math.round(pixelCrop.width));
    let finalHeight = Math.max(1, Math.round(pixelCrop.height));

    if (finalWidth > MAX_SIZE || finalHeight > MAX_SIZE) {
      if (finalWidth > finalHeight) {
        finalHeight = Math.max(1, Math.round((finalHeight * MAX_SIZE) / finalWidth));
        finalWidth = MAX_SIZE;
      } else {
        finalWidth = Math.max(1, Math.round((finalWidth * MAX_SIZE) / finalHeight));
        finalHeight = MAX_SIZE;
      }
    }

    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return imageSrc;

    croppedCanvas.width = finalWidth;
    croppedCanvas.height = finalHeight;

    // Isi latar putih agar gambar PNG transparan tidak berubah menjadi hitam saat dikompres ke JPEG
    croppedCtx.fillStyle = '#FFFFFF';
    croppedCtx.fillRect(0, 0, finalWidth, finalHeight);

    // Jalur cepat hemat RAM (tanpa alokasi canvas perantara penuh untuk foto kamera 12MP/48MP iPhone & Android)
    if (!rotation || rotation % 360 === 0) {
      croppedCtx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        finalWidth,
        finalHeight
      );
      const out = croppedCanvas.toDataURL('image/jpeg', 0.75);
      releaseCanvas(croppedCanvas);
      return out;
    }

    // Jika ada rotasi, batasi ukuran canvas perantara di bawah batas piksel maksimum WebKit iOS (4096x4096)
    const MAX_SAFARI_DIM = 3840;
    const scale = Math.min(1, MAX_SAFARI_DIM / Math.max(image.width, image.height));
    const safeWidth = Math.max(1, Math.round(image.width * scale));
    const safeHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseCanvas(croppedCanvas);
      return imageSrc;
    }

    canvas.width = safeWidth;
    canvas.height = safeHeight;
    ctx.translate(safeWidth / 2, safeHeight / 2);
    ctx.rotate(getRadianAngle(rotation));
    ctx.translate(-safeWidth / 2, -safeHeight / 2);
    ctx.drawImage(image, 0, 0, safeWidth, safeHeight);

    croppedCtx.drawImage(
      canvas,
      pixelCrop.x * scale,
      pixelCrop.y * scale,
      pixelCrop.width * scale,
      pixelCrop.height * scale,
      0,
      0,
      finalWidth,
      finalHeight
    );

    const result = croppedCanvas.toDataURL('image/jpeg', 0.75);
    releaseCanvas(canvas);
    releaseCanvas(croppedCanvas);
    return result;
  } catch (err) {
    console.warn('Cropping error occurred, returning compressed original image source:', err);
    return await compressImage(imageSrc);
  }
}

export async function compressImage(imageSrc: string, maxSize = 450, quality = 0.75): Promise<string> {
  try {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageSrc;

    let { width, height } = image;
    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = Math.max(1, Math.round((height * maxSize) / width));
        width = maxSize;
      } else {
        width = Math.max(1, Math.round((width * maxSize) / height));
        height = maxSize;
      }
    }

    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const out = canvas.toDataURL('image/jpeg', quality);
    releaseCanvas(canvas);
    return out;
  } catch (err) {
    console.warn('Compression failed, returning raw image:', err);
    return imageSrc;
  }
}
