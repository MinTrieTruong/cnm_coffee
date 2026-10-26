import { useRef } from "react";
import { Camera, X } from "lucide-react";
import { compressImage } from "../lib/delivery";

/** Chụp / chọn 1 ảnh bằng chứng, trả về data URL đã nén */
export function PhotoPicker({ value, onChange, label = "Ảnh bằng chứng" }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange(await compressImage(file));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không đọc được ảnh");
    }
  }
  return (
    <div style={{ fontSize: "0.85rem" }}>
      {label}
      <br />
      {value ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <img src={value} alt={label} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
          <button type="button" className="secondary-btn" style={{ padding: "0.2rem 0.4rem" }} onClick={() => onChange(null)} aria-label="Xoá ảnh"><X size={14} /></button>
        </span>
      ) : (
        <button type="button" className="secondary-btn" style={{ padding: "0.4rem 0.7rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }} onClick={() => input.current?.click()}>
          <Camera size={14} /> Chụp ảnh
        </button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
