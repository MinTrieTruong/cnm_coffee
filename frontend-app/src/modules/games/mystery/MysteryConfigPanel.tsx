import type { ConfigPanelProps } from "../registry";
import { BackgroundBox, ColorBox } from "../ConfigFields";

export type MysteryConfig = { backgroundUrl: string | null; boxColor: string; ribbonColor: string; colorful: boolean; boxCount: number };
export const MYSTERY_DEFAULT_CONFIG: MysteryConfig = { backgroundUrl: null, boxColor: "#7C3AED", ribbonColor: "#F2C230", colorful: true, boxCount: 6 };
/** Số hộp cho phép — trùng backend handlers/mystery.ts */
export const BOX_COUNTS = [3, 4, 6, 8, 9];

/** Khối cấu hình riêng của hộp quà bí mật: ảnh nền, màu hộp (hoặc nhiều màu), màu ruy băng, số hộp */
export function MysteryConfigPanel({ config, onChange, disabled }: ConfigPanelProps) {
  const c = { ...MYSTERY_DEFAULT_CONFIG, ...(config as Partial<MysteryConfig>) };
  const set = (patch: Partial<MysteryConfig>) => onChange({ ...c, ...patch });
  return (
    <>
      <BackgroundBox label="Background trang chơi" value={c.backgroundUrl} disabled={disabled} onChange={(v) => set({ backgroundUrl: v })} />
      <div className="gm-cfg-item">
        <div className="gm-cfg-label">Màu hộp</div>
        <label className="o-row" style={{ gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={c.colorful} disabled={disabled} onChange={(e) => set({ colorful: e.target.checked })} />
          Mỗi hộp một màu
        </label>
      </div>
      {!c.colorful && <ColorBox label="Màu hộp" value={c.boxColor} disabled={disabled} onChange={(v) => set({ boxColor: v })} />}
      <ColorBox label="Màu ruy băng" value={c.ribbonColor} disabled={disabled} onChange={(v) => set({ ribbonColor: v })} />
      <div className="gm-cfg-item">
        <label className="gm-cfg-label" htmlFor="mb-count">Số hộp bày ra</label>
        <select id="mb-count" className="o-input" value={c.boxCount} disabled={disabled} onChange={(e) => set({ boxCount: Number(e.target.value) })} style={{ width: 120 }}>
          {BOX_COUNTS.map((n) => (
            <option key={n} value={n}>{n} hộp</option>
          ))}
        </select>
      </div>
    </>
  );
}
