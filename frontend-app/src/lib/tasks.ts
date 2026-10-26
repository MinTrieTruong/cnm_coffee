/** Giao việc trong ngày — kiểu dữ liệu & tiện ích dùng chung (API: backend-node/src/routes/tasks.ts) */

export type TaskAssignee = {
  id: number;
  staffId: number;
  status: "TODO" | "DONE";
  doneAt: string | null;
  note: string | null;
  photoUrl: string | null;
  redoNote: string | null;
  staff: { id: number; fullName: string; role: string };
};

export type WorkTask = {
  id: number;
  workDate: string;
  title: string;
  description: string | null;
  area: string | null;
  dueMin: number | null;
  priority: "NORMAL" | "HIGH";
  requirePhoto: boolean;
  createdBy: { id: number; fullName: string };
  assignees: TaskAssignee[];
};

export type Assignable = { id: number; fullName: string; role: string; shifts: { shiftCode: string; startMin: number; endMin: number }[] };

const pad = (n: number) => String(n).padStart(2, "0");
export const minToTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const timeToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const shiftDay = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const dayLabel = (ymd: string) => {
  const t = todayYmd();
  if (ymd === t) return "Hôm nay";
  if (ymd === shiftDay(t, -1)) return "Hôm qua";
  if (ymd === shiftDay(t, 1)) return "Ngày mai";
  const [y, m, d] = ymd.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Quá hạn: còn người chưa xong và đã qua giờ hạn của hôm nay (hoặc ngày đã qua) */
export function isOverdue(t: WorkTask, now = new Date()) {
  if (t.assignees.every((a) => a.status === "DONE")) return false;
  const today = todayYmd();
  if (t.workDate < today) return true;
  if (t.workDate > today || t.dueMin == null) return false;
  return now.getHours() * 60 + now.getMinutes() > t.dueMin;
}

export const doneCount = (t: WorkTask) => t.assignees.filter((a) => a.status === "DONE").length;

/** Gợi ý tên việc thường gặp ở quán */
export const TASK_PRESETS = [
  "Vệ sinh khu vực",
  "Lau bàn ghế",
  "Vệ sinh nhà vệ sinh",
  "Đổ rác",
  "Lau kính, cửa",
  "Vệ sinh quầy bar",
  "Kiểm kê quầy bar",
  "Chuẩn bị nguyên liệu",
  "Tưới cây",
];

/** Thu nhỏ ảnh chụp (≤ 1280px, JPEG) trước khi gửi để không vượt giới hạn tải lên */
export function compressImage(file: File, max = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh."));
    };
    img.src = url;
  });
}
