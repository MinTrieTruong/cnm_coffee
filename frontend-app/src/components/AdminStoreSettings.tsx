import { useState, useEffect, type FormEvent } from "react";
import { staffApi } from "../lib/staffApi";

/** Cấu hình chung cả chuỗi. Địa chỉ & GPS từng chi nhánh: Cấu hình › Chi nhánh. */
type StoreSettingsPayload = {
  vatRatePercent: number;
  pointPerVnd: number;
  pointValueVnd: number;
  cashRoundTo: number;
  pointEarnEveryVnd: number;
  pointEarnEach: number;
  faceMatchThreshold: number;
  pettyCashLimit: number;
  cancelWindowMinutes: number;
  supplierReturnDays: number;
  searchMinCustomers: number;
  searchMinPercent: number;
  searchWindowDays: number;
  googleLoginEnabled?: boolean;
  facebookLoginEnabled?: boolean;
  /** Ghi nhận hành vi khách trên web (trang "Hành vi khách") + số ngày lưu */
  behaviorTracking?: boolean;
  behaviorRetentionDays?: number;
  /** Backend đã có đủ biến môi trường cho từng nhà cung cấp */
  socialConfigured?: { GOOGLE: boolean; FACEBOOK: boolean };
};

export function AdminStoreSettings({
  settings,
  onSaved,
  onErr,
  readOnly,
}: {
  settings: StoreSettingsPayload;
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
  /** Quản lý chi nhánh chỉ xem — chỉ Chủ chuỗi được sửa */
  readOnly?: boolean;
}) {
  const [vat, setVat] = useState(String(settings.vatRatePercent ?? 10));
  const [earnEvery, setEarnEvery] = useState(String(settings.pointEarnEveryVnd ?? 1000));
  const [earnEach, setEarnEach] = useState(String(settings.pointEarnEach ?? 100));
  const [pval, setPval] = useState(String(settings.pointValueVnd ?? 1));
  const [round, setRound] = useState(String(settings.cashRoundTo ?? 1000));
  const [threshold, setThreshold] = useState(settings.faceMatchThreshold ?? 0.5);
  const [pettyLimit, setPettyLimit] = useState(String(settings.pettyCashLimit ?? 200000));
  const [cancelWin, setCancelWin] = useState(String(settings.cancelWindowMinutes ?? 5));
  const [returnDays, setReturnDays] = useState(String(settings.supplierReturnDays ?? 7));
  const [searchMin, setSearchMin] = useState(String(settings.searchMinCustomers ?? 3));
  const [searchPct, setSearchPct] = useState(String(settings.searchMinPercent ?? 2));
  const [searchDays, setSearchDays] = useState(String(settings.searchWindowDays ?? 30));
  const [googleOn, setGoogleOn] = useState(settings.googleLoginEnabled ?? true);
  const [facebookOn, setFacebookOn] = useState(settings.facebookLoginEnabled ?? true);
  const [trackOn, setTrackOn] = useState(settings.behaviorTracking ?? true);
  const [trackDays, setTrackDays] = useState(String(settings.behaviorRetentionDays ?? 90));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVat(String(settings.vatRatePercent ?? 10));
    setEarnEvery(String(settings.pointEarnEveryVnd ?? 1000));
    setEarnEach(String(settings.pointEarnEach ?? 100));
    setPval(String(settings.pointValueVnd ?? 1));
    setRound(String(settings.cashRoundTo ?? 1000));
    setThreshold(settings.faceMatchThreshold ?? 0.5);
    setPettyLimit(String(settings.pettyCashLimit ?? 200000));
    setCancelWin(String(settings.cancelWindowMinutes ?? 5));
    setReturnDays(String(settings.supplierReturnDays ?? 7));
    setSearchMin(String(settings.searchMinCustomers ?? 3));
    setSearchPct(String(settings.searchMinPercent ?? 2));
    setSearchDays(String(settings.searchWindowDays ?? 30));
    setGoogleOn(settings.googleLoginEnabled ?? true);
    setFacebookOn(settings.facebookLoginEnabled ?? true);
    setTrackOn(settings.behaviorTracking ?? true);
    setTrackDays(String(settings.behaviorRetentionDays ?? 90));
  }, [settings]);

  async function save(e: FormEvent) {
    e.preventDefault();
    onErr(null);
    setBusy(true);
    try {
      await staffApi("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          vatRatePercent: Number(vat),
          pointValueVnd: Number(pval),
          cashRoundTo: Number(round),
          pointEarnEveryVnd: Number(earnEvery),
          pointEarnEach: Number(earnEach),
          faceMatchThreshold: threshold,
          pettyCashLimit: Number(pettyLimit),
          cancelWindowMinutes: Number(cancelWin),
          supplierReturnDays: Number(returnDays),
          searchMinCustomers: Number(searchMin),
          searchMinPercent: Number(searchPct),
          searchWindowDays: Number(searchDays),
          googleLoginEnabled: googleOn,
          facebookLoginEnabled: facebookOn,
          behaviorTracking: trackOn,
          behaviorRetentionDays: Number(trackDays),
        }),
      });
      await onSaved();
      alert("Đã lưu cấu hình thành công!");
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ padding: "1.25rem", maxWidth: "1200px" }} onSubmit={(e) => void save(e)}>
      <h2 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.3rem", color: "var(--accent)" }}>Cài đặt chung cả chuỗi</h2>
      <p style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--muted)", fontSize: "0.9rem" }}>
        Áp dụng cho mọi chi nhánh. Địa chỉ, GPS và bán kính chấm công cài ở Cấu hình › Chi nhánh.
        {readOnly && " Chỉ Chủ chuỗi được sửa."}
      </p>

      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "1.25rem" }}>

          {/* General Box */}
          <div style={{ border: "1px solid var(--border)", padding: "1.25rem", borderRadius: "10px", background: "var(--surface2)" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>Tài chính & Tích điểm</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">VAT (%)</label>
                <input className="input" type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Làm tròn (VND)</label>
                <input className="input" type="number" value={round} onChange={(e) => setRound(e.target.value)} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Chi tiêu (VND)</label>
                <input className="input" type="number" value={earnEvery} onChange={(e) => setEarnEvery(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Cộng số điểm</label>
                <input className="input" type="number" value={earnEach} onChange={(e) => setEarnEach(e.target.value)} />
              </div>
            </div>

            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">1 điểm quy đổi (VND giảm trừ)</label>
              <input className="input" type="number" value={pval} onChange={(e) => setPval(e.target.value)} />
            </div>

            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">Hạn mức chi không cần duyệt (VND / phiếu)</label>
              <input className="input" type="number" value={pettyLimit} onChange={(e) => setPettyLimit(e.target.value)} />
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>Thu ngân tự chi từ két / ngăn kéo đến mức này; vượt mức phải chờ quản lý duyệt.</p>
            </div>

            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">Thời gian khách tự hủy đơn giao hàng (phút)</label>
              <input className="input" type="number" min={0} max={120} value={cancelWin} onChange={(e) => setCancelWin(e.target.value)} />
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>Tính từ lúc khách thanh toán, khi quán chưa nhận đơn. Hủy trong thời gian này được hoàn 100% số tiền thành điểm.</p>
            </div>

            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">Hạn trả hàng nhà cung cấp (ngày)</label>
              <input className="input" type="number" min={1} max={90} value={returnDays} onChange={(e) => setReturnDays(e.target.value)} />
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>Tính từ ngày nhận lô hàng. Quá hạn thì quản lý chi nhánh vẫn duyệt được nhưng phải ghi lý do.</p>
            </div>

            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">Gợi ý món từ tìm kiếm của khách</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <label style={{ fontSize: "0.85rem" }}>Tối thiểu (khách)<input className="input" type="number" min={1} value={searchMin} onChange={(e) => setSearchMin(e.target.value)} /></label>
                <label style={{ fontSize: "0.85rem" }}>Tỷ lệ tối thiểu (%)<input className="input" type="number" min={0} step={0.5} value={searchPct} onChange={(e) => setSearchPct(e.target.value)} /></label>
                <label style={{ fontSize: "0.85rem" }}>Trong (ngày)<input className="input" type="number" min={1} max={365} value={searchDays} onChange={(e) => setSearchDays(e.target.value)} /></label>
              </div>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>Từ khóa quán chưa có món được gợi ý khi đủ số khách khác nhau tìm không ra VÀ đạt tỷ lệ trên tổng số khách dùng ô tìm kiếm.</p>
            </div>
          </div>

          {/* Đăng nhập khách bằng mạng xã hội */}
          <div style={{ border: "1px solid var(--border)", padding: "1.25rem", borderRadius: "10px", background: "var(--surface2)" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>Đăng nhập khách hàng</h3>
            {([
              ["GOOGLE", "Đăng nhập bằng Google", googleOn, setGoogleOn, "GOOGLE_CLIENT_ID"],
              ["FACEBOOK", "Đăng nhập bằng Facebook", facebookOn, setFacebookOn, "App ID / App Secret của Facebook"],
            ] as const).map(([id, label, on, set, env]) => (
              <div key={id} className="field" style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 600 }}>
                  <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                  {label}
                </label>
                {settings.socialConfigured && !settings.socialConfigured[id] && (
                  <p style={{ margin: "0.3rem 0 0 1.9rem", fontSize: "0.8rem", color: "var(--danger, #b91c1c)" }}>
                    Máy chủ chưa cấu hình {env} — nút đang ẩn dù bật công tắc.
                  </p>
                )}
              </div>
            ))}
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>Tắt thì nút trên trang Đăng nhập / Đăng ký ẩn đi và máy chủ từ chối đăng nhập bằng phương thức đó. Hướng dẫn tạo app: docs/social-login-setup.md.</p>
          </div>

          {/* Hành vi khách trên web */}
          <div style={{ border: "1px solid var(--border)", padding: "1.25rem", borderRadius: "10px", background: "var(--surface2)" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>Hành vi khách trên web</h3>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 600 }}>
                <input type="checkbox" checked={trackOn} onChange={(e) => setTrackOn(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                Ghi nhận hành vi khách trên web
              </label>
            </div>
            <label style={{ fontSize: "0.85rem", display: "block", maxWidth: 220 }}>Lưu trong (ngày)<input className="input" type="number" min={7} max={365} value={trackDays} onChange={(e) => setTrackDays(e.target.value)} /></label>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>Ẩn danh: món được xem, thêm / bớt giỏ, thời gian xem từng màn hình — cho trang Bán hàng › Hành vi khách. Không lưu IP / vị trí; tự xoá sau số ngày trên. Tắt thì web khách ngừng gửi (số liệu cũ vẫn giữ tới hạn xoá).</p>
          </div>

          {/* AI Config Box */}
          <div style={{ border: "1px solid rgba(146,64,14,0.2)", padding: "1.25rem", borderRadius: "10px", background: "rgba(146,64,14,0.04)" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem", color: "var(--accent)" }}>Cấu hình AI Nhận diện khuôn mặt</h3>

            <div className="field">
              <label className="label">
                Độ nhạy (Ngưỡng khoảng cách - Threshold)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
                <input
                  type="range"
                  min="0.3"
                  max="0.8"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
                />
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)", minWidth: "40px", textAlign: "right" }}>
                  {threshold.toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                <span>0.3 (Khắt khe)</span>
                <span>0.5 (Chuẩn)</span>
                <span>0.8 (Dễ dãi)</span>
              </div>
              <p style={{ marginTop: "0.8rem", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                * Hệ thống so sánh ảnh hiện tại với ảnh gốc. Khoảng cách càng nhỏ càng khắt khe. Ngưỡng thấp (0.4) chống nhận diện nhầm tốt nhưng cần góc sáng chuẩn, ngưỡng cao (0.6) dễ nhận diện hơn.
              </p>
            </div>
          </div>

      </div>
      </fieldset>

      {!readOnly && (
        <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: "0.75rem 2rem", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.02em" }}
            disabled={busy}
          >
            {busy ? "Đang lưu..." : "Lưu Cài Đặt"}
          </button>
        </div>
      )}
    </form>
  );
}
