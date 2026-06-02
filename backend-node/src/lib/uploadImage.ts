import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** Lưu ảnh từ data URL (data:image/...;base64,...). Trả về path tương đối /uploads/... */
export async function saveDataUrlImage(dataUrl: string): Promise<string> {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) {
    throw new Error("Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP (data URL).");
  }
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 2_500_000) {
    throw new Error("Ảnh quá lớn (tối đa ~2,5MB).");
  }
  const ext =
    mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
