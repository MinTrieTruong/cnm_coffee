import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Printer, Save, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Breadcrumb, Button, Field, Modal, errMsg, formatVnd } from "../../components/erp";
import { useRecordNav, useResource } from "../shared";
import { GAME_UI } from "./registry";
import { PrizeTable, emptyPrize, prizeValue, totalWeight, weightNum } from "./PrizeTable";
import { WinnerList } from "./WinnerList";
import { PRIZE_KIND_LABEL, type CampaignDetail, type GameOptions, type GameType, type PrizeDraft } from "./types";

export const GAMES_BASE = "/app/crm/games";

/** datetime-local ↔ ISO theo giờ máy */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type General = {
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  allStores: boolean;
  storeIds: number[];
  minOrderValue: string;
  maxPlaysPerDay: string;
  allowPointExchange: boolean;
  pointsPerTicket: string;
  claimDays: string;
  config: Record<string, unknown>;
};

function defaultGeneral(type: GameType): General {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86_400_000);
  end.setHours(23, 59, 0, 0);
  return {
    name: "", description: "", startAt: toLocalInput(now.toISOString()), endAt: toLocalInput(end.toISOString()),
    isActive: false, allStores: true, storeIds: [], minOrderValue: "50000", maxPlaysPerDay: "3",
    allowPointExchange: false, pointsPerTicket: "5000", claimDays: "7", config: { ...GAME_UI[type].defaultConfig },
  };
}

const digits = (s: string) => s.replace(/\D/g, "");
const money = (s: string) => (s ? Number(digits(s)).toLocaleString("vi-VN") : "");

/** Trang chi tiết chiến dịch mini game — khung chung; khối cấu hình riêng lấy từ GAME_UI[gameType] */
export function GameCampaignDetail({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const [params] = useSearchParams();
  const go = useRecordNav(GAMES_BASE);
  const owner = isOwnerRole(getStaffInfo()?.role);
  const detail = useResource<CampaignDetail | null>(isNew ? null : `/api/admin/games/campaigns/${recordId}`, null);
  const opts = useResource<GameOptions | null>("/api/admin/games/options", null);
  const type = (detail.data?.gameType ?? (params.get("type") as GameType | null) ?? "WHEEL") as GameType;
  const ui = GAME_UI[type];

  const [g, setG] = useState<General>(() => defaultGeneral(type));
  const [prizes, setPrizes] = useState<PrizeDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  // Nạp dữ liệu chiến dịch vào form
  useEffect(() => {
    const c = detail.data;
    if (!c) return;
    setG({
      name: c.name, description: c.description ?? "", startAt: toLocalInput(c.startAt), endAt: toLocalInput(c.endAt),
      isActive: c.isActive, allStores: c.allStores, storeIds: c.stores.map((s) => s.storeId),
      minOrderValue: String(c.minOrderValue), maxPlaysPerDay: String(c.maxPlaysPerDay), allowPointExchange: c.allowPointExchange,
      pointsPerTicket: String(c.pointsPerTicket), claimDays: String(c.claimDays),
      config: { ...GAME_UI[c.gameType].defaultConfig, ...(c.config ?? {}) },
    });
    setPrizes(c.prizes.map((p) => ({
      id: p.id, key: `p${p.id}`, kind: p.kind, productId: p.productId, giftItemId: p.giftItemId, voucherId: p.voucherId, points: p.points,
      label: p.label, imageUrl: p.imageUrl, weight: String(p.weight), quantity: p.quantity == null ? "" : String(p.quantity),
      dailyLimit: p.dailyLimit == null ? "" : String(p.dailyLimit), color: p.color, wonCount: p.wonCount,
    })));
  }, [detail.data]);

  // Chiến dịch mới: sẵn 1 ô "Chúc may mắn lần sau"
  useEffect(() => {
    if (isNew) setPrizes([emptyPrize({ kind: "NONE", label: "Chúc bạn may mắn lần sau", weight: "100", color: "#E7E5E4" })]);
  }, [isNew]);

  const editable = isNew || !!detail.data?.editable;
  const set = <K extends keyof General>(k: K, v: General[K]) => setG((x) => ({ ...x, [k]: v }));
  const total = totalWeight(prizes);
  const weightOk = Math.abs(total - 100) < 0.01;

  const cost = useMemo(() => {
    const rows = prizes.map((p) => ({ p, each: prizeValue(p, opts.data), times: (weightNum(p) / 100) * 1000 }));
    return { rows, sum: rows.reduce((s, r) => s + r.each * r.times, 0) };
  }, [prizes, opts.data]);

  async function save() {
    setErr(null);
    setInfo(null);
    if (!weightOk) return setErr(`Tổng tỉ lệ đang là ${total}% — phải bằng 100%.`);
    setSaving(true);
    const body = {
      gameType: type,
      name: g.name, description: g.description || null,
      startAt: new Date(g.startAt).toISOString(), endAt: new Date(g.endAt).toISOString(),
      isActive: g.isActive, allStores: g.allStores, storeIds: g.storeIds,
      config: g.config,
      minOrderValue: Number(digits(g.minOrderValue) || 0), maxPlaysPerDay: Number(g.maxPlaysPerDay || 0),
      allowPointExchange: g.allowPointExchange, pointsPerTicket: Number(digits(g.pointsPerTicket) || 0), claimDays: Number(g.claimDays || 0),
      prizes: prizes.map((p) => ({
        id: p.id, kind: p.kind, productId: p.productId, giftItemId: p.giftItemId, voucherId: p.voucherId, points: p.points,
        label: p.label, imageUrl: p.imageUrl, weight: weightNum(p), color: p.color,
        quantity: p.quantity === "" ? null : Number(p.quantity), dailyLimit: p.dailyLimit === "" ? null : Number(p.dailyLimit),
      })),
    };
    try {
      if (isNew) {
        const c = await staffApi<{ id: number }>("/api/admin/games/campaigns", { method: "POST", body: JSON.stringify(body) });
        go.open(c.id);
      } else {
        await staffApi(`/api/admin/games/campaigns/${recordId}`, { method: "PUT", body: JSON.stringify(body) });
        await detail.reload();
        setInfo("Đã cập nhật chiến dịch.");
      }
    } catch (e) {
      setErr(errMsg(e, "Không lưu được"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!detail.data) return;
    if (detail.data.playCount > 0) {
      setErr("Chiến dịch đã có lượt quay — chỉ có thể chuyển trạng thái sang Tắt, không xóa được.");
      return;
    }
    if (!window.confirm(`Xóa chiến dịch "${detail.data.name}"? Thao tác không hoàn tác được.`)) return;
    try {
      await staffApi(`/api/admin/games/campaigns/${recordId}`, { method: "DELETE" });
      go.list();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (!isNew && detail.loading && !detail.data) return <div className="o-muted" style={{ padding: 24 }}>Đang tải…</div>;
  if (!isNew && !detail.data) return <Alert>{detail.error ?? "Không tìm thấy chiến dịch."}</Alert>;
  if (!ui.ready) return <Alert tone="info">{ui.label} sắp ra mắt.</Alert>;

  const ConfigPanel = ui.ConfigPanel;
  const Preview = ui.Preview;
  const stores = opts.data?.stores ?? [];

  return (
    <div className="gm-page">
      <div className="o-cp" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
        <div className="o-cp-left">
          <Breadcrumb items={[{ label: "Mini game", to: GAMES_BASE }, { label: isNew ? `${ui.label} mới` : g.name || "Chiến dịch" }]} />
        </div>
        <div className="o-cp-right">
          {!isNew && <Button icon={Printer} onClick={() => setPrinting(true)}>In mã QR</Button>}
        </div>
      </div>

      {err && <Alert>{err}</Alert>}
      {info && <Alert tone="info">{info}</Alert>}
      {!editable && <Alert tone="info">Chiến dịch cả chuỗi do Chủ chuỗi quản lý — bạn chỉ xem được.</Alert>}

      {/* ── Khối 1: cấu hình chung ── */}
      <section className="o-card gm-block">
        <div className="gm-section-head">
          <h3>Cấu hình chiến dịch <Badge tone="primary">{ui.label}</Badge></h3>
          {detail.data && <span className="o-muted">{detail.data.playCount.toLocaleString("vi-VN")} lượt chơi</span>}
        </div>
        <fieldset disabled={!editable} className="gm-fieldset">
          <div className="gm-form-grid">
            <Field label="Tên chiến dịch" required full><input className="o-input" value={g.name} onChange={(e) => set("name", e.target.value)} maxLength={150} placeholder="VD: Vòng quay tháng 11" /></Field>
            <Field label="Mô tả" full><textarea className="o-input" rows={2} value={g.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} placeholder="Hiển thị cho khách trên trang chơi" /></Field>
            <Field label="Bắt đầu" required><input type="datetime-local" className="o-input" value={g.startAt} onChange={(e) => set("startAt", e.target.value)} /></Field>
            <Field label="Kết thúc" required><input type="datetime-local" className="o-input" value={g.endAt} onChange={(e) => set("endAt", e.target.value)} /></Field>
            <Field label="Chi nhánh áp dụng" full>
              {owner ? (
                <div className="o-stack" style={{ gap: 6 }}>
                  <div className="o-row">
                    <label className="o-row" style={{ gap: 4 }}><input type="radio" checked={g.allStores} onChange={() => set("allStores", true)} /> Cả chuỗi</label>
                    <label className="o-row" style={{ gap: 4 }}><input type="radio" checked={!g.allStores} onChange={() => set("allStores", false)} /> Chọn chi nhánh</label>
                  </div>
                  {!g.allStores && (
                    <div className="o-row">
                      {stores.map((s) => (
                        <label key={s.id} className="o-row" style={{ gap: 4 }}>
                          <input type="checkbox" checked={g.storeIds.includes(s.id)} onChange={(e) => set("storeIds", e.target.checked ? [...g.storeIds, s.id] : g.storeIds.filter((x) => x !== s.id))} />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span>{detail.data?.allStores ? "Cả chuỗi" : detail.data?.stores.map((s) => s.store.name).join(", ") || "Chi nhánh của bạn"}</span>
              )}
            </Field>
            <Field label="Đơn tối thiểu để nhận 1 lượt (đ)"><input className="o-input" inputMode="numeric" value={money(g.minOrderValue)} onChange={(e) => set("minOrderValue", digits(e.target.value))} /></Field>
            <Field label="Số lượt tối đa / khách / ngày"><input className="o-input" inputMode="numeric" value={g.maxPlaysPerDay} onChange={(e) => set("maxPlaysPerDay", digits(e.target.value))} /></Field>
            <Field label="Cho đổi điểm lấy lượt">
              <div className="o-row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <input type="checkbox" checked={g.allowPointExchange} onChange={(e) => set("allowPointExchange", e.target.checked)} aria-label="Cho đổi điểm lấy lượt" />
                {g.allowPointExchange && (
                  <>
                    <input className="o-input" inputMode="numeric" style={{ maxWidth: 140 }} value={money(g.pointsPerTicket)} onChange={(e) => set("pointsPerTicket", digits(e.target.value))} aria-label="Số điểm mỗi lượt" />
                    <span className="o-muted">điểm / lượt</span>
                  </>
                )}
              </div>
            </Field>
            <Field label="Hạn nhận quà hiện vật (ngày)"><input className="o-input" inputMode="numeric" value={g.claimDays} onChange={(e) => set("claimDays", digits(e.target.value))} /></Field>
          </div>

          <div className="gm-cfg-row">
            {ConfigPanel && <ConfigPanel config={g.config} onChange={(c) => set("config", c)} disabled={!editable} />}
            <div className="gm-cfg-item">
              <div className="gm-cfg-label">Trạng thái</div>
              <div className="gm-seg" role="radiogroup" aria-label="Trạng thái">
                <button type="button" role="radio" aria-checked={g.isActive} className={g.isActive ? "on" : ""} onClick={() => set("isActive", true)}>Bật</button>
                <button type="button" role="radio" aria-checked={!g.isActive} className={!g.isActive ? "off" : ""} onClick={() => set("isActive", false)}>Tắt</button>
              </div>
            </div>
          </div>
        </fieldset>
      </section>

      {/* ── Khối 2: bảng giải thưởng ── */}
      <section className="o-card gm-block">
        <div className="gm-section-head"><h3>Giải thưởng</h3><span className="o-muted">{prizes.length} ô</span></div>
        <PrizeTable prizes={prizes} onChange={setPrizes} options={opts.data} onOptionsChanged={() => void opts.reload()} disabled={!editable} />

        <div className="gm-preview-row">
          {Preview && (
            <div className="gm-preview">
              <div className="gm-cfg-label">Xem trước</div>
              <Preview config={g.config} prizes={prizes} />
            </div>
          )}
          <div className="gm-cost">
            <div className="gm-cfg-label">Ước tính chi phí cho 1.000 lượt chơi</div>
            <table className="o-list">
              <thead><tr><th>Phần thưởng</th><th className="num">Số lần trúng</th><th className="num">Giá trị / lần</th><th className="num">Thành tiền</th></tr></thead>
              <tbody>
                {cost.rows.filter((r) => r.p.kind !== "NONE").map((r) => (
                  <tr key={r.p.key}>
                    <td className="wrap">{r.p.label || PRIZE_KIND_LABEL[r.p.kind]}</td>
                    <td className="num">{Math.round(r.times).toLocaleString("vi-VN")}</td>
                    <td className="num">{formatVnd(r.each)}</td>
                    <td className="num">{formatVnd(Math.round(r.each * r.times))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>Tổng</td><td className="num"><strong>{formatVnd(Math.round(cost.sum))}</strong></td></tr></tfoot>
            </table>
            <div className="o-muted gm-sub">Tính theo tỉ lệ, chưa trừ giới hạn số lượng; voucher tính đủ giá trị giảm, 1 điểm = 1đ. Trung bình {formatVnd(Math.round(cost.sum / 1000))} / lượt.</div>
          </div>
        </div>

        {editable && (
          <div className="gm-actions">
            <Button variant="primary" icon={Save} onClick={() => void save()} disabled={saving || !weightOk}>{saving ? "Đang lưu…" : isNew ? "Tạo chiến dịch" : "Cập nhật"}</Button>
            {!isNew && (
              <Button variant="danger" icon={Trash2} onClick={() => void remove()} title={detail.data?.playCount ? "Đã có lượt quay — chỉ có thể Tắt" : undefined}>
                Xóa chiến dịch này
              </Button>
            )}
          </div>
        )}
      </section>

      {/* ── Khối 3: danh sách trúng thưởng ── */}
      {!isNew && detail.data && (
        <section className="o-card gm-block">
          <WinnerList campaignId={detail.data.id} />
        </section>
      )}

      {printing && detail.data && (
        <PrintQrModal
          campaign={detail.data}
          stores={detail.data.allStores ? stores : detail.data.stores.map((s) => s.store)}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}

/** In QR dẫn tới trang chơi theo chi nhánh, khổ A5/A6 để dán quầy */
function PrintQrModal({ campaign, stores, onClose }: { campaign: CampaignDetail; stores: { id: number; name: string }[]; onClose: () => void }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? 0);
  const [paper, setPaper] = useState<"A5" | "A6">("A6");
  const url = `${window.location.origin}/game/${campaign.id}${storeId ? `?store=${storeId}` : ""}`;
  const [img, setImg] = useState("");
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 600, margin: 1, errorCorrectionLevel: "M" }).then(setImg);
  }, [url]);
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  function print() {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const big = paper === "A5";
    w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>QR ${esc(campaign.name)}</title>
<style>@page{size:${paper} portrait;margin:10mm}*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#1c1917}
body{display:flex;justify-content:center}.card{width:100%;text-align:center;border:2px solid #92400e;border-radius:12px;padding:${big ? 18 : 10}mm ${big ? 12 : 8}mm}
h1{font-size:${big ? 26 : 18}pt;margin-bottom:${big ? 4 : 2}mm}.sub{font-size:${big ? 13 : 10}pt;color:#57534e;margin-bottom:${big ? 8 : 5}mm}
img{width:${big ? 95 : 70}mm;height:${big ? 95 : 70}mm}.how{font-size:${big ? 12 : 9}pt;margin-top:${big ? 6 : 4}mm;line-height:1.5}.store{margin-top:3mm;font-size:${big ? 11 : 8.5}pt;color:#78716c}</style></head>
<body><div class="card"><h1>${esc(campaign.name)}</h1><div class="sub">Quét mã để tham gia ${esc(GAME_UI[campaign.gameType].label.toLowerCase())}</div>
<img src="${img}" alt="QR"/><div class="how">Mỗi đơn từ ${campaign.minOrderValue.toLocaleString("vi-VN")}đ được 1 lượt chơi<br/>Đăng nhập bằng số điện thoại để nhận quà</div>
<div class="store">${esc(storeName)}</div></div><script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }

  return (
    <Modal title="In mã QR" onClose={onClose} footer={<><Button variant="primary" icon={Printer} onClick={print} disabled={!img}>In</Button><Button onClick={onClose}>Đóng</Button></>}>
      <div className="gm-form-grid">
        <Field label="Chi nhánh">
          <select className="o-input" value={storeId} onChange={(e) => setStoreId(Number(e.target.value))}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Khổ giấy">
          <select className="o-input" value={paper} onChange={(e) => setPaper(e.target.value as "A5" | "A6")}>
            <option value="A6">A6 (dán quầy)</option>
            <option value="A5">A5</option>
          </select>
        </Field>
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        {img && <img src={img} alt="QR" style={{ width: 200, height: 200 }} />}
        <div className="o-muted" style={{ wordBreak: "break-all" }}>{url}</div>
      </div>
    </Modal>
  );
}
