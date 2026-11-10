import type { ConfigPanelProps } from "../registry";
import { BackgroundBox, ColorBox } from "../ConfigFields";

export type LixiConfig = { backgroundUrl: string | null; envelopeColor: string; accentColor: string; envelopeText: string; envelopeCount: number; greeting: string };
export const LIXI_DEFAULT_CONFIG: LixiConfig = {
  backgroundUrl: null, envelopeColor: "#C62828", accentColor: "#F2C230", envelopeText: "LỘC", envelopeCount: 9, greeting: "Chúc mừng năm mới",
};
/** Số bao cho phép — trùng backend handlers/seasonal.ts */
export const ENVELOPE_COUNTS = [4, 6, 8, 9, 12];

/** Khối cấu hình riêng của lì xì: ảnh nền, màu bao, màu nhũ, chữ con dấu, số bao, lời chúc */
export function LixiConfigPanel({ config, onChange, disabled }: ConfigPanelProps) {
  const c = { ...LIXI_DEFAULT_CONFIG, ...(config as Partial<LixiConfig>) };
  const set = (patch: Partial<LixiConfig>) => onChange({ ...c, ...patch });
  return (
    <>
      <BackgroundBox label="Background trang chơi" value={c.backgroundUrl} disabled={disabled} onChange={(v) => set({ backgroundUrl: v })} />
      <ColorBox label="Màu bao lì xì" value={c.envelopeColor} disabled={disabled} onChange={(v) => set({ envelopeColor: v })} />
      <ColorBox label="Màu nhũ (viền, con dấu)" value={c.accentColor} disabled={disabled} onChange={(v) => set({ accentColor: v })} />
      <div className="gm-cfg-item">
        <label className="gm-cfg-label" htmlFor="lx-text">Chữ trên con dấu</label>
        <input id="lx-text" className="o-input" value={c.envelopeText} maxLength={8} disabled={disabled} onChange={(e) => set({ envelopeText: e.target.value })} placeholder="LỘC" style={{ width: 120 }} />
      </div>
      <div className="gm-cfg-item">
        <label className="gm-cfg-label" htmlFor="lx-count">Số bao bày ra</label>
        <select id="lx-count" className="o-input" value={c.envelopeCount} disabled={disabled} onChange={(e) => set({ envelopeCount: Number(e.target.value) })} style={{ width: 120 }}>
          {ENVELOPE_COUNTS.map((n) => (
            <option key={n} value={n}>{n} bao</option>
          ))}
        </select>
      </div>
      <div className="gm-cfg-item">
        <label className="gm-cfg-label" htmlFor="lx-greet">Lời chúc trên thiệp</label>
        <input id="lx-greet" className="o-input" value={c.greeting} maxLength={60} disabled={disabled} onChange={(e) => set({ greeting: e.target.value })} style={{ width: 240 }} />
      </div>
    </>
  );
}
