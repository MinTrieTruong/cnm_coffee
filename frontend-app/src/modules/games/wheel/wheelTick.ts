/** Tiếng "tích" khi vạch chia ô đi qua kim — tạo bằng Web Audio, không cần file âm thanh */

const MUTE_KEY = "gw-muted";
let ctx: AudioContext | null = null;
let last = 0;

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(v: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* trình duyệt chặn lưu trữ: chỉ bỏ qua */
  }
}

/** Gọi trong lúc bấm nút (cử chỉ người dùng) để trình duyệt cho phép phát âm thanh */
export function unlockTick() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Một tiếng tích ngắn; giới hạn tối đa ~1 tiếng/35ms để lúc quay nhanh không bị rè */
export function playTick() {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  if (now - last < 0.035) return;
  last = now;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1500 + Math.random() * 200, now);
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.03);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}
