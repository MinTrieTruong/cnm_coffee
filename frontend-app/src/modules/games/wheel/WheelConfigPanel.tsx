import type { ConfigPanelProps } from "../registry";
import { BackgroundBox, ColorBox } from "../ConfigFields";

export type WheelConfig = { backgroundUrl: string | null; wheelColor: string; borderColor: string };
export const WHEEL_DEFAULT_CONFIG: WheelConfig = { backgroundUrl: null, wheelColor: "#FFF7ED", borderColor: "#92400E" };

/** Khối cấu hình riêng của vòng quay: ảnh nền trước khi quay, màu nền, màu viền */
export function WheelConfigPanel({ config, onChange, disabled }: ConfigPanelProps) {
  const c = { ...WHEEL_DEFAULT_CONFIG, ...(config as Partial<WheelConfig>) };
  const set = (patch: Partial<WheelConfig>) => onChange({ ...c, ...patch });
  return (
    <>
      <BackgroundBox label="Background trước khi quay" value={c.backgroundUrl} disabled={disabled} onChange={(v) => set({ backgroundUrl: v })} />
      <ColorBox label="Màu nền vòng quay" value={c.wheelColor} disabled={disabled} onChange={(v) => set({ wheelColor: v })} />
      <ColorBox label="Màu viền vòng quay" value={c.borderColor} disabled={disabled} onChange={(v) => set({ borderColor: v })} />
    </>
  );
}
