import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** Lưu ảnh từ data URL (data:image/...;base64,...). Trả về path tương đối /uploads/... */
export async function saveDataUrlImage(dataUrl: string): Promise<string> {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) {
    throw new Error("Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP (data URL).");
  }
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 2_500_000) {
    throw new Error("Ảnh quá lớn (tối đa ~2,5MB).");
  }
  // Kiểm chữ ký đầu file — không tin MIME khai báo (SVG/HTML đội lốt image/png)
  const ext = imageKind(buf);
  if (!ext) {
    throw new Error("Tệp không phải ảnh PNG, JPEG, WebP hoặc GIF.");
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

/**
 * Ảnh riêng tư (ảnh khuôn mặt lúc đăng ký FaceID): lưu ngoài thư mục /uploads công khai,
 * chỉ đọc qua API có kiểm quyền. Trả về tên tệp (không phải URL).
 */
const PRIVATE_FACE_DIR = path.join(process.cwd(), "private-uploads", "face");

export async function savePrivateFacePhoto(dataUrl: string): Promise<string> {
  const m = /^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) throw new Error("Ảnh khuôn mặt không hợp lệ.");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > 1_500_000) throw new Error("Ảnh khuôn mặt quá lớn.");
  const ext = imageKind(buf);
  if (!ext || ext === "gif") throw new Error("Ảnh khuôn mặt không hợp lệ.");
  await mkdir(PRIVATE_FACE_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(PRIVATE_FACE_DIR, name), buf);
  return name;
}

/** Đọc ảnh khuôn mặt riêng tư (tên tệp do savePrivateFacePhoto trả về); null nếu không có */
export async function readPrivateFacePhoto(name: string): Promise<{ buf: Buffer; type: string } | null> {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return null;
  try {
    const buf = await readFile(path.join(PRIVATE_FACE_DIR, name));
    const ext = name.split(".").pop();
    return { buf, type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
  } catch {
    return null;
  }
}

export async function deletePrivateFacePhoto(name: string | null | undefined) {
  if (!name || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return;
  await unlink(path.join(PRIVATE_FACE_DIR, name)).catch(() => undefined);
}

/** Loại ảnh theo magic bytes (null nếu không phải ảnh được hỗ trợ) */
function imageKind(b: Buffer): "png" | "jpg" | "webp" | "gif" | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString("ascii", 0, 6))) return "gif";
  return null;
}
