import type { ConfigPanelProps } from "../registry";
import { BackgroundBox, ColorBox } from "../ConfigFields";

export type ScratchConfig = { backgroundUrl: string | null; coverColor: string; coverText: string; cardColor: string; revealPercent: number };
export const SCRATCH_DEFAULT_CONFIG: ScratchConfig = { backgroundUrl: null, coverColor: "#B8B2A7", coverText: "CÀO TẠI ĐÂY", cardColor: "#92400E", revealPercent: 50 };

/** Khối cấu hình riêng của thẻ cào: ảnh nền, màu thẻ, màu + chữ lớp phủ, cào bao nhiêu % thì lộ hết */
export function ScratchConfigPanel({ config, onChange, disabled }: ConfigPanelProps) {
  const c = { ...SCRATCH_DEFAULT_CONFIG, ...(config as Partial<ScratchConfig>) };
  const set = (patch: Partial<ScratchConfig>) => onChange({ ...c, ...patch });
  return (
    <>
      <BackgroundBox label="Background trang chơi" value={c.backgroundUrl} disabled={disabled} onChange={(v) => set({ backgroundUrl: v })} />
      <ColorBox label="Màu thẻ" value={c.cardColor} disabled={disabled} onChange={(v) => set({ cardColor: v })} />
      <ColorBox label="Màu lớp phủ" value={c.coverColor} disabled={disabled} onChange={(v) => set({ coverColor: v })} />
      <div className="gm-cfg-item">
        <label className="gm-cfg-label" htmlFor="sc-text">Chữ trên lớp phủ</label>
        <input id="sc-text" className="o-input" value={c.coverText} maxLength={30} disabled={disabled} onChange={(e) => set({ coverText: e.target.value })} style={{ width: 170 }} />
      </div>
      <div className="gm-cfg-item">
        <label className="gm-cfg-label" htmlFor="sc-pct">Cào bao nhiêu thì lộ hết</label>
        <div className="o-row" style={{ flexWrap: "nowrap", gap: 8 }}>
          <input id="sc-pct" type="range" min={20} max={90} step={5} value={c.revealPercent} disabled={disabled} onChange={(e) => set({ revealPercent: Number(e.target.value) })} />
          <strong style={{ minWidth: 38 }}>{c.revealPercent}%</strong>
        </div>
      </div>
    </>
  );
}
