/**
 * Độ nét ảnh (phương sai Laplacian trên ảnh xám thu về rộng ≤ 1000px) — đo ngay trên trình duyệt, không cần AI.
 * Hoá đơn in chụp rõ ~1.000–4.000; mờ nhẹ ~10–50; nhoè hẳn < 5. Ngưỡng dùng ở backend lib/invoiceOcr/validate.ts.
 */
export const SHARP_BLURRY = 60;

export async function measureSharpness(dataUrl: string): Promise<number> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = Math.min(1000, img.naturalWidth);
  const H = Math.max(3, Math.round((img.naturalHeight * W) / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Number.NaN;
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const l = g[i - 1] + g[i + 1] + g[i - W] + g[i + W] - 4 * g[i];
      s += l;
      s2 += l * l;
      n++;
    }
  }
  return n ? Math.round(s2 / n - (s / n) ** 2) : Number.NaN;
}
