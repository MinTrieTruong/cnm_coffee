import { useEffect, useState, type CSSProperties } from "react";
import { PartyPopper, RotateCcw, Save } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, Field, FormGroup, FormGroups, errMsg } from "../../components/erp";
import { DEFAULT_THEME, NEUTRAL, PRESETS, contrast, paletteVars, type ColorMode, type SiteTheme } from "../../lib/siteTheme";
import { OCCASIONS, activeOccasion, effectiveTheme, nextOccasionDate, occasionById, ymd } from "../../lib/occasions";
import { OccasionArt } from "../../components/site/Festive";
import { useResource } from "../shared";

const HEX = /^#[0-9a-f]{6}$/i;

/** Ô chọn màu: bảng màu hệ thống + ô gõ mã #rrggbb */
function ColorInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="o-row" style={{ flexWrap: "nowrap" }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Chọn màu" style={{ width: 44, height: 36, padding: 2, border: "1px solid var(--o-border)", borderRadius: 4, background: "none", cursor: "pointer" }} />
      <input
        id={id}
        className="o-input"
        value={text}
        maxLength={7}
        style={{ width: 110, fontFamily: "monospace" }}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          if (HEX.test(v)) onChange(v.toLowerCase());
        }}
      />
    </div>
  );
}

/** Mức tương phản kèm nhãn đạt / chưa đạt (WCAG AA chữ thường 4.5:1) */
function Ratio({ a, b, label }: { a: string; b: string; label: string }) {
  const r = contrast(a, b);
  return (
    <span className="o-row" style={{ gap: 6 }}>
      <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: 3, background: b, color: a, fontSize: 12, fontWeight: 700, lineHeight: "22px", textAlign: "center", border: "1px solid var(--o-border)" }}>A</span>
      {label}: {r.toFixed(1)}:1 {r >= 4.5 ? <Badge tone="success">Đạt</Badge> : <Badge tone="warning">Thấp</Badge>}
    </span>
  );
}

/** Bản xem trước thu nhỏ trang khách — dùng đúng hàm tính màu của trang khách */
function Preview({ theme, mode }: { theme: SiteTheme; mode: ColorMode }) {
  const v = paletteVars(effectiveTheme(theme), mode);
  const n = NEUTRAL[mode];
  // Xem trước luôn hiện chủ đề lễ đã chọn, kể cả khi ngày tự tắt đã qua (để chủ chuỗi thấy trước khi chỉnh ngày)
  const oc = activeOccasion(theme.occasion ? { ...theme, occasion: { ...theme.occasion, until: null } } : theme);
  const box: CSSProperties = { borderRadius: 6, overflow: "hidden", border: "1px solid var(--o-border)", background: n.paper, color: n.ink, fontFamily: "'Be Vietnam Pro', system-ui, sans-serif" };
  const display: CSSProperties = { fontFamily: "Oswald, 'Arial Narrow', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" };
  return (
    <div style={box} aria-label={mode === "dark" ? "Xem trước giao diện tối" : "Xem trước giao diện sáng"}>
      <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...display, fontSize: 15 }}>TD Coffee</span>
        <span style={{ ...display, fontSize: 14, color: v["--c-primary"] }}>0389 730 362</span>
      </div>
      <div style={{ background: v["--c-primary"], color: v["--c-on-primary"], padding: "7px 12px", display: "flex", gap: 14, ...display, fontSize: 12, fontWeight: 500 }}>
        <span style={{ borderBottom: `3px solid ${v["--c-accent"]}` }}>Thực đơn</span>
        <span>Khuyến mãi</span>
        <span>Liên hệ</span>
      </div>
      {oc && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 10px", background: `color-mix(in srgb, ${v["--c-accent"]} 22%, ${n.surface})`, borderBottom: `2px solid ${v["--c-primary"]}` }}>
          <OccasionArt id={oc.id} height={32} />
          <span style={{ ...display, fontSize: 12, color: v["--c-primary"] }}>{oc.greeting}</span>
        </div>
      )}
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "72px 1fr", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", aspectRatio: "1", borderRadius: 4, background: mode === "dark" ? "#212b2b" : "#e9e1d3" }}>
          <span style={{ position: "absolute", top: 6, left: 4, transform: "rotate(-4deg)", background: v["--c-accent"], color: v["--c-on-accent"], border: `1.5px dashed ${v["--c-primary"]}`, padding: "1px 4px", fontSize: 9, ...display }}>Giảm 15%</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Cà phê đen đá</div>
          <div style={{ ...display, fontWeight: 600, fontSize: 18, color: v["--c-primary"] }}>21.250đ</div>
          <span style={{ display: "inline-block", marginTop: 6, padding: "6px 12px", borderRadius: 4, background: v["--c-primary"], color: v["--c-on-primary"], ...display, fontSize: 11, fontWeight: 600 }}>Mua ngay</span>
        </div>
      </div>
      <div style={{ background: v["--c-footer"], color: "#efe7d8", padding: "8px 12px", fontSize: 11 }}>Chân trang · Chính sách · Liên hệ</div>
    </div>
  );
}

/** Website › Giao diện: màu trang khách (chủ chuỗi) */
export function SiteThemeSettings() {
  const info = useResource<{ theme: SiteTheme } | null>("/api/site-info", null);
  const [f, setF] = useState<SiteTheme>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  useEffect(() => {
    if (info.data?.theme) setF(info.data.theme);
  }, [info.data]);
  const set = (patch: Partial<SiteTheme>) => setF((x) => ({ ...x, ...patch }));
  const lightPrimary = paletteVars(f, "light")["--c-primary"];
  const adjusted = lightPrimary !== f.primary.toLowerCase();
  const today = ymd(new Date());
  const oc = f.occasion ?? null;
  const ocInfo = occasionById(oc?.id);
  const ocExpired = !!oc?.until && oc.until < today;
  const setOccasion = (patch: Partial<NonNullable<SiteTheme["occasion"]>>) => setF((x) => (x.occasion ? { ...x, occasion: { ...x.occasion, ...patch } } : x));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await staffApi("/api/admin/site-theme", { method: "PATCH", body: JSON.stringify(f) });
      setMsg({ tone: "info", text: "Đã lưu — khách thấy màu mới khi tải lại trang." });
    } catch (e) {
      setMsg({ tone: "danger", text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="o-stack" style={{ gap: 16, maxWidth: 1100 }}>
      <div className="o-row" style={{ justifyContent: "space-between" }}>
        <h1 className="o-h1" style={{ margin: 0 }}>Giao diện trang khách</h1>
        <div className="o-row">
          <Button icon={RotateCcw} onClick={() => setF(DEFAULT_THEME)}>Về mặc định</Button>
          <Button variant="primary" icon={Save} onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</Button>
        </div>
      </div>
      {info.error && <Alert>{info.error}</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }} className="o-theme-grid">
        <FormGroups>
          <FormGroup title="Chủ đề dịp lễ">
            <div className="o-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Gần tới dịp lễ thì bật chủ đề: trang khách đổi sang màu lễ, hiện dải lời chúc có hình trang trí dưới thanh điều hướng và hiệu ứng rơi. Hết ngày tự tắt, trang về lại màu thường bên dưới.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
              {OCCASIONS.map((o) => {
                const on = oc?.id === o.id;
                const next = nextOccasionDate(o);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => set({ occasion: on ? null : { id: o.id, until: next?.until ?? null, effects: oc?.effects ?? true } })}
                    aria-pressed={on}
                    style={{ textAlign: "left", padding: 10, borderRadius: 6, cursor: "pointer", background: "var(--o-surface, #fff)", border: on ? `2px solid ${o.primary}` : "1px solid var(--o-border)" }}
                  >
                    <span style={{ display: "flex", justifyContent: "center", borderRadius: 4, marginBottom: 8, background: `color-mix(in srgb, ${o.accent} 22%, #fffdf8)`, borderBottom: `3px solid ${o.primary}` }}>
                      <OccasionArt id={o.id} height={60} />
                    </span>
                    <span className="o-row" style={{ justifyContent: "space-between", gap: 6, flexWrap: "nowrap" }}>
                      <strong style={{ fontSize: 13 }}>{o.name}</strong>
                      {on && <Badge tone="success">Đang chọn</Badge>}
                    </span>
                    <span className="o-muted" style={{ display: "block", fontSize: 12 }}>{o.note}</span>
                    {next && (
                      <span style={{ display: "block", fontSize: 12, marginTop: 4, fontWeight: 600, color: next.days <= 30 ? "var(--o-success, #2f6b2f)" : undefined }}>
                        {next.days > 0 ? `Còn ${next.days} ngày` : next.days === 0 ? "Hôm nay" : "Đang trong dịp lễ"} · {new Date(next.date).toLocaleDateString("vi-VN")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {oc && ocInfo && (
              <div className="o-stack" style={{ gap: 10, marginTop: 12 }}>
                <Field label="Tự tắt sau ngày" htmlFor="th-until">
                  <div className="o-row">
                    <input id="th-until" type="date" className="o-input" style={{ width: 170 }} value={oc.until ?? ""} min={today} onChange={(e) => setOccasion({ until: e.target.value || null })} />
                    {oc.until && <Button onClick={() => setOccasion({ until: null })}>Không tự tắt</Button>}
                  </div>
                  <div className="o-hint">{oc.until ? `Khách thấy chủ đề ${ocInfo.name} tới hết ngày ${new Date(oc.until).toLocaleDateString("vi-VN")}.` : "Chủ đề hiện tới khi bạn tắt tay."}</div>
                </Field>
                {ocExpired && <Alert tone="warning">Ngày tự tắt đã qua — khách đang thấy màu thường. Chọn ngày mới nếu muốn bật lại.</Alert>}
                <label className="o-row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={oc.effects} onChange={(e) => setOccasion({ effects: e.target.checked })} />
                  Hiệu ứng rơi (cánh mai, cánh hoa, sao, tuyết) — tự ẩn trên máy khách bật giảm chuyển động
                </label>
                <div>
                  <Button icon={PartyPopper} onClick={() => set({ occasion: null })}>Tắt chủ đề lễ</Button>
                </div>
              </div>
            )}
          </FormGroup>
          <FormGroup title="Bộ màu gợi ý">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {PRESETS.map((p) => {
                const on = f.primary === p.primary && f.accent === p.accent;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set({ preset: p.id, primary: p.primary, accent: p.accent })}
                    aria-pressed={on}
                    style={{ textAlign: "left", padding: 10, borderRadius: 6, cursor: "pointer", background: "var(--o-surface, #fff)", border: on ? `2px solid ${p.primary}` : "1px solid var(--o-border)" }}
                  >
                    <span style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                      <span style={{ flex: 3, background: p.primary }} />
                      <span style={{ flex: 1, background: p.accent }} />
                      <span style={{ flex: 1, background: "#f4efe6" }} />
                    </span>
                    <strong style={{ display: "block", fontSize: 13 }}>{p.name}</strong>
                    <span className="o-muted" style={{ fontSize: 12 }}>{p.note}</span>
                  </button>
                );
              })}
            </div>
          </FormGroup>
          <FormGroup title="Tự chọn màu">
            <Field label="Màu chủ đạo" htmlFor="th-primary">
              <ColorInput id="th-primary" value={f.primary} onChange={(v) => set({ primary: v, preset: "custom" })} />
              <div className="o-hint">Thanh điều hướng, nút, giá tiền, liên kết.</div>
            </Field>
            <Field label="Màu nhấn" htmlFor="th-accent">
              <ColorInput id="th-accent" value={f.accent} onChange={(v) => set({ accent: v, preset: "custom" })} />
              <div className="o-hint">Tem giảm giá, gạch chân mục đang mở, nút đăng ký nhận tin.</div>
            </Field>
            <div className="o-stack" style={{ gap: 6, fontSize: 13 }}>
              <Ratio a={f.primary} b={NEUTRAL.light.paper} label="Màu chủ đạo trên nền giấy" />
              <Ratio a="#1d2423" b={f.accent} label="Chữ trên tem màu nhấn" />
              {adjusted && <span className="o-muted">Màu chủ đạo hơi nhạt so với nền — trang khách tự làm đậm thành {lightPrimary} để chữ dễ đọc.</span>}
            </div>
          </FormGroup>
          <FormGroup title="Sáng / tối">
            <Field label="Mặc định khi khách mở web">
              <select className="o-input" value={f.defaultMode} onChange={(e) => set({ defaultMode: e.target.value as SiteTheme["defaultMode"] })}>
                <option value="light">Sáng</option>
                <option value="dark">Tối</option>
                <option value="auto">Theo cài đặt máy của khách</option>
              </select>
            </Field>
            <Field label="Cho khách tự đổi">
              <label className="o-row" style={{ gap: 6 }}>
                <input type="checkbox" checked={f.allowToggle} onChange={(e) => set({ allowToggle: e.target.checked })} />
                Hiện nút sáng/tối trên thanh điều hướng và chân trang
              </label>
            </Field>
          </FormGroup>
        </FormGroups>

        <div className="o-stack" style={{ gap: 12, position: "sticky", top: 12 }}>
          <strong>Xem trước</strong>
          <Preview theme={f} mode="light" />
          <Preview theme={f} mode="dark" />
          <span className="o-muted" style={{ fontSize: 12 }}>Ở giao diện tối, màu chủ đạo được làm sáng lên để đủ tương phản trên nền tối.</span>
        </div>
      </div>
    </div>
  );
}
