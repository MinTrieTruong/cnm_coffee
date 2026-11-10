import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { staffUploadImage } from "../../lib/staffApi";
import { errMsg } from "../../components/erp";
import { readFileAsDataUrl } from "../shared";

/** Ô cấu hình dùng chung cho khối cấu hình riêng của các mini game */

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorBox({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="gm-cfg-item">
      <div className="gm-cfg-label">{label}</div>
      <div className="gm-color">
        <input type="color" value={HEX.test(value) ? value : "#000000"} disabled={disabled} onChange={(e) => { onChange(e.target.value.toUpperCase()); setDraft(e.target.value.toUpperCase()); }} aria-label={label} />
        <input
          className="o-input"
          value={draft}
          disabled={disabled}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(v.toUpperCase());
            if (HEX.test(v)) onChange(v.toUpperCase());
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  );
}

/** Ảnh nền đầu trang chơi: tải lên / bỏ ảnh */
export function BackgroundBox({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (url: string | null) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const bg = mediaUrl(value);
  return (
    <div className="gm-cfg-item">
      <div className="gm-cfg-label">{label}</div>
      <button
        type="button"
        className="gm-bg-box"
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
        style={bg ? { backgroundImage: `url("${bg}")` } : undefined}
        aria-label="Tải ảnh nền"
      >
        {!bg && (
          <span className="gm-bg-empty">
            <ImagePlus size={18} aria-hidden />
            {busy ? "Đang tải…" : "Tải ảnh"}
          </span>
        )}
      </button>
      {bg && !disabled && (
        <button type="button" className="gm-link-danger" onClick={() => onChange(null)}>
          <X size={12} aria-hidden /> Bỏ ảnh
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await staffUploadImage(await readFileAsDataUrl(f)));
          } catch (ex) {
            alert(errMsg(ex, "Lỗi tải ảnh"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
