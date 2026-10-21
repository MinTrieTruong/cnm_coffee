import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, Printer, Vault } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { compressImage } from "../../lib/delivery";
import { getStaffInfo, isAdminRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, Field, Modal, errMsg, fmtDateTime, formatVnd, type Tone } from "../../components/erp";

/* ═══════════════ Kiểu dữ liệu ═══════════════ */

export type Fund = "SAFE" | "DRAWER" | "BANK";
type Who = { id: number; fullName: string } | null;

export type CashEntry = {
  id: number;
  code: string;
  storeId: number;
  kind: "IN" | "OUT" | "TRANSFER" | "ADJUST";
  fromFund: Fund | null;
  toFund: Fund | null;
  shiftId: number | null;
  safeSessionId: number | null;
  category: string;
  amount: number;
  description: string | null;
  attachmentUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  rejectReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  createdById: number;
  createdBy: Who;
  approvedBy: Who;
  store?: { id: number; name: string };
  supplierBill?: { id: number; code: string; supplier: { name: string } } | null;
};

export type SafeSession = {
  id: number;
  reason: string;
  openedAt: string;
  openingBalance: number | null;
  closedAt: string | null;
  expectedBalance: number | null;
  countedBalance: number | null;
  difference: number | null;
  note: string | null;
  denominations: string | null;
  openedBy: Who;
  closedBy?: Who;
  entries?: CashEntry[];
  _count?: { entries: number };
  store?: { name: string };
};

export type MethodRow = { method: string; label: string; count: number; amount: number };

/* ═══════════════ Nhãn ═══════════════ */

export const FUND_LABEL: Record<Fund, string> = { SAFE: "Két sắt", DRAWER: "Ngăn kéo ca", BANK: "Ngân hàng" };

type Kind = CashEntry["kind"];
/** Khớp backend lib/cash.ts — system: chỉ hệ thống tạo; manager: chỉ quản lý */
export const CATEGORIES: Record<string, { label: string; kind: Kind; system?: boolean; manager?: boolean }> = {
  SUPPLIES: { label: "Vật dụng lặt vặt", kind: "OUT" },
  REPAIR: { label: "Sửa chữa, bảo trì", kind: "OUT" },
  UTILITIES: { label: "Điện, nước, internet", kind: "OUT" },
  CLEANING: { label: "Vệ sinh", kind: "OUT" },
  RENT: { label: "Mặt bằng", kind: "OUT", manager: true },
  MARKETING: { label: "Quảng cáo, khuyến mãi", kind: "OUT" },
  REFUND: { label: "Hoàn tiền khách", kind: "OUT" },
  OTHER_EXPENSE: { label: "Chi khác", kind: "OUT" },
  SUPPLIER_PAYMENT: { label: "Trả nhà cung cấp", kind: "OUT", system: true },
  OPENING_BALANCE: { label: "Số dư đầu kỳ", kind: "IN", manager: true },
  CAPITAL: { label: "Bổ sung quỹ", kind: "IN", manager: true },
  OTHER_INCOME: { label: "Thu khác", kind: "IN" },
  SHIFT_FLOAT: { label: "Lấy tiền đầu ca", kind: "TRANSFER", system: true },
  SHIFT_DEPOSIT: { label: "Nộp tiền cuối ca", kind: "TRANSFER", system: true },
  TOP_UP: { label: "Lấy thêm tiền lẻ từ két", kind: "TRANSFER" },
  DROP: { label: "Nộp bớt tiền vào két giữa ca", kind: "TRANSFER" },
  BANK_DEPOSIT: { label: "Nộp tiền vào ngân hàng", kind: "TRANSFER", manager: true },
  BANK_WITHDRAW: { label: "Rút tiền ngân hàng về két", kind: "TRANSFER", manager: true },
  SAFE_DIFF: { label: "Chênh lệch kiểm két", kind: "ADJUST", system: true },
};
export const TRANSFER_ROUTES: Record<string, { from: Fund; to: Fund }> = {
  SHIFT_FLOAT: { from: "SAFE", to: "DRAWER" },
  TOP_UP: { from: "SAFE", to: "DRAWER" },
  SHIFT_DEPOSIT: { from: "DRAWER", to: "SAFE" },
  DROP: { from: "DRAWER", to: "SAFE" },
  BANK_DEPOSIT: { from: "SAFE", to: "BANK" },
  BANK_WITHDRAW: { from: "BANK", to: "SAFE" },
};
export const catLabel = (c: string) => CATEGORIES[c]?.label ?? c;

export const KIND_LABEL: Record<Kind, string> = { IN: "Phiếu thu", OUT: "Phiếu chi", TRANSFER: "Chuyển quỹ", ADJUST: "Điều chỉnh" };

export const STATUS: Record<CashEntry["status"], { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã ghi sổ", tone: "success" },
  REJECTED: { label: "Từ chối", tone: "danger" },
  CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};

/** "Két sắt → Ngăn kéo ca" / "Ngân hàng →" … */
export function flowLabel(e: Pick<CashEntry, "fromFund" | "toFund">) {
  const f = e.fromFund ? FUND_LABEL[e.fromFund] : "Bên ngoài";
  const t = e.toFund ? FUND_LABEL[e.toFund] : "Bên ngoài";
  return `${f} → ${t}`;
}

/** Số tiền có dấu theo góc nhìn 1 quỹ: + vào quỹ, − ra khỏi quỹ */
export function signedFor(e: CashEntry, fund: Fund) {
  if (e.toFund === fund) return e.amount;
  if (e.fromFund === fund) return -e.amount;
  return 0;
}

export function Money({ value, signed }: { value: number; signed?: boolean }) {
  const color = signed ? (value > 0 ? "var(--o-success)" : value < 0 ? "var(--o-danger)" : undefined) : undefined;
  return <span style={color ? { color, fontWeight: 600 } : undefined}>{signed && value > 0 ? "+" : ""}{formatVnd(value)}</span>;
}

export const isManager = () => isAdminRole(getStaffInfo()?.role);

/* ═══════════════ Đếm tiền theo mệnh giá ═══════════════ */

export const DENOMINATIONS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];
export type Counts = Record<string, number>;
export const countTotal = (c: Counts) => DENOMINATIONS.reduce((s, d) => s + d * (c[String(d)] ?? 0), 0);

/**
 * Bảng đếm tiền: nhập số tờ từng mệnh giá (mặc định) hoặc chuyển sang nhập tổng.
 * onChange trả về tổng tiền và bảng đếm (null khi nhập tổng).
 */
export function CashCounter({ onChange }: { onChange: (total: number | null, counts: Counts | null) => void }) {
  const [mode, setMode] = useState<"denom" | "total">("denom");
  const [counts, setCounts] = useState<Counts>({});
  const [total, setTotal] = useState("");

  useEffect(() => {
    if (mode === "denom") onChange(countTotal(counts), counts);
    else onChange(total.trim() === "" ? null : Number(total.replace(/\D/g, "")), null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, counts, total]);

  return (
    <div className="o-stack" style={{ gap: 8 }}>
      <div className="o-row" style={{ gap: 6 }}>
        <Button size="sm" variant={mode === "denom" ? "primary" : "secondary"} onClick={() => setMode("denom")}>Đếm theo mệnh giá</Button>
        <Button size="sm" variant={mode === "total" ? "primary" : "secondary"} onClick={() => setMode("total")}>Nhập tổng</Button>
      </div>
      {mode === "denom" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
          {DENOMINATIONS.map((d) => (
            <label key={d} className="o-row" style={{ gap: 6, flexWrap: "nowrap", border: "1px solid var(--o-border, #e5e7eb)", borderRadius: 6, padding: "4px 8px" }}>
              <span style={{ minWidth: 64, fontVariantNumeric: "tabular-nums" }}>{(d / 1000).toLocaleString("vi-VN")}k ×</span>
              <input
                className="o-input"
                inputMode="numeric"
                style={{ width: "100%" }}
                value={counts[String(d)] ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ""));
                  setCounts((c) => ({ ...c, [String(d)]: Number.isFinite(n) ? n : 0 }));
                }}
                aria-label={`Số tờ ${d.toLocaleString("vi-VN")}đ`}
              />
            </label>
          ))}
        </div>
      ) : (
        <input className="o-input" inputMode="numeric" placeholder="Tổng tiền đếm được" value={total} onChange={(e) => setTotal(e.target.value)} />
      )}
      <div style={{ fontWeight: 700 }}>
        Tổng đếm được: {formatVnd(mode === "denom" ? countTotal(counts) : Number(total.replace(/\D/g, "")) || 0)}
      </div>
    </div>
  );
}

/** Hiển thị bảng mệnh giá đã đếm (JSON lưu trong DB) */
export function DenominationTable({ json }: { json: string | Counts | null }) {
  const counts: Counts | null = typeof json === "string" ? safeParse(json) : json;
  if (!counts || Object.keys(counts).length === 0) return null;
  return (
    <table className="o-list" style={{ width: "auto" }}>
      <tbody>
        {DENOMINATIONS.filter((d) => counts[String(d)]).map((d) => (
          <tr key={d}>
            <td>{d.toLocaleString("vi-VN")}đ</td>
            <td style={{ textAlign: "right" }}>× {counts[String(d)]}</td>
            <td style={{ textAlign: "right" }}>{formatVnd(d * counts[String(d)])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function safeParse(s: string): Counts | null {
  try {
    return JSON.parse(s) as Counts;
  } catch {
    return null;
  }
}

/* ═══════════════ Ảnh chứng từ ═══════════════ */

export function PhotoInput({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="o-row" style={{ alignItems: "center" }}>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onChange(await compressImage(f));
        }}
      />
      {value && <img src={value} alt="Chứng từ" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} />}
      <Button size="sm" icon={Camera} onClick={() => ref.current?.click()}>{value ? "Chụp lại" : "Chụp / chọn ảnh"}</Button>
      {value && <Button size="sm" variant="link" onClick={() => onChange(null)}>Bỏ ảnh</Button>}
    </div>
  );
}

/* ═══════════════ Trạng thái két (dùng chung POS + Tài chính) ═══════════════ */

/** balance = null: thu ngân (đếm mù) không xem số dư theo sổ */
export type SafeState = { balance: number | null; session: SafeSession | null; sessions: SafeSession[] };

export function useSafe() {
  const [safe, setSafe] = useState<SafeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    try {
      setSafe(await staffApi<SafeState>("/api/cash/safe"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  return { safe, error, reload };
}

/** Mở két — bắt buộc lý do */
export function SafeOpenDialog({ defaultReason = "", onClose, onDone }: { defaultReason?: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(defaultReason);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await staffApi("/api/cash/safe/open", { method: "POST", body: JSON.stringify({ reason }) });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Mở két"
      size="sm"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" icon={Vault} disabled={busy || !reason.trim()} onClick={() => void submit()}>Mở két</Button></>}
    >
      {err && <Alert>{err}</Alert>}
      <Field label="Lý do mở két" required full>
        <input className="o-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Lấy tiền đầu ca, đổi tiền lẻ, trả tiền đá…" autoFocus />
      </Field>
      <p className="o-muted" style={{ marginTop: 8 }}>Sau khi lấy / bỏ tiền xong phải <b>đóng két</b> và đếm lại tiền trong két.</p>
    </Modal>
  );
}

/**
 * Đếm tiền & đối chiếu, dùng chung cho đóng két / đóng ca.
 * - expected có giá trị (quản lý): thấy ngay thừa/thiếu bao nhiêu, lệch thì bắt buộc lý do.
 * - expected = null (thu ngân, đếm mù): không thấy số dự kiến; gửi lên mới biết khớp hay không.
 *   Không khớp → máy chủ chỉ báo "không khớp" → đếm lại, hoặc ghi lý do rồi gửi lại.
 */
function useCountCheck(expected: number | null) {
  const [counted, setCounted] = useState<number | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [note, setNote] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const blind = expected == null;
  const diff = counted == null || blind ? 0 : counted - expected;
  const needNote = blind ? mismatch : diff !== 0;
  const body = (totalKey: string) => (counts ? { denominations: counts, note } : { [totalKey]: counted, note });
  const onError = (msg: string) => {
    if (blind && /không khớp/i.test(msg)) setMismatch(true);
  };
  const view = (
    <>
      <CashCounter onChange={(t, c) => { setCounted(t); setCounts(c); }} />
      {counted != null && (
        <div style={{ marginTop: 10 }}>
          {!blind && diff === 0 && <Badge tone="success">Khớp sổ</Badge>}
          {!blind && diff !== 0 && <Alert tone="warning">{diff > 0 ? "Thừa" : "Thiếu"} {formatVnd(Math.abs(diff))} so với sổ — hệ thống sẽ ghi nhận theo số đếm thực tế.</Alert>}
          {needNote && (
            <Field label="Lý do chênh lệch" required full>
              <input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: thối nhầm cho khách bàn 5" />
            </Field>
          )}
        </div>
      )}
    </>
  );
  return { counted, body, onError, view, canSubmit: counted != null && (!needNote || !!note.trim()), blind };
}

/** Đóng két — đếm lại tiền trong két; lệch thì ghi lý do. expected = null → thu ngân đếm mù */
export function SafeCloseDialog({ expected, onClose, onDone }: { expected: number | null; onClose: () => void; onDone: () => void }) {
  const check = useCountCheck(expected);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await staffApi("/api/cash/safe/close", { method: "POST", body: JSON.stringify(check.body("countedBalance")) });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
      check.onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Đóng két — kiểm tiền trong két"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={busy || !check.canSubmit} onClick={() => void submit()}>Đóng két</Button></>}
    >
      {err && <Alert tone={check.blind ? "warning" : "danger"}>{err}</Alert>}
      {check.blind ? (
        <p style={{ marginTop: 0 }} className="o-muted">Đếm toàn bộ tiền trong két rồi nhập. Hệ thống không hiện số dư để đảm bảo đếm khách quan.</p>
      ) : (
        <p style={{ marginTop: 0 }}>Số dư két theo sổ: <b>{formatVnd(expected ?? 0)}</b></p>
      )}
      {check.view}
    </Modal>
  );
}

/* ═══════════════ Lập phiếu thu / chi / chuyển quỹ ═══════════════ */

type EntryType = "OUT" | "IN" | "TRANSFER";

/**
 * Hộp lập phiếu. Nếu phiếu đụng tới két mà két đang đóng → cho mở két ngay trong hộp.
 * preset: chọn sẵn loại / danh mục / quỹ (VD POS: "Chi lặt vặt" từ ngăn kéo).
 */
export function EntryDialog({
  preset,
  onClose,
  onDone,
}: {
  preset?: { type?: EntryType; category?: string; fund?: Fund };
  onClose: () => void;
  onDone: (entry: CashEntry) => void;
}) {
  const manager = isManager();
  const [type, setType] = useState<EntryType>(preset?.type ?? "OUT");
  const options = useMemo(
    () => Object.entries(CATEGORIES).filter(([, c]) => c.kind === type && !c.system && (manager || !c.manager)),
    [type, manager],
  );
  const [category, setCategory] = useState(preset?.category ?? options[0]?.[0] ?? "");
  const [fund, setFund] = useState<Fund>(preset?.fund ?? "DRAWER");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<number | null>(null);
  const { safe, reload: reloadSafe } = useSafe();
  const [openingSafe, setOpeningSafe] = useState(false);

  useEffect(() => {
    staffApi<{ pettyCashLimit: number }>("/api/cash/overview").then((o) => setLimit(o.pettyCashLimit)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!options.some(([id]) => id === category)) setCategory(options[0]?.[0] ?? "");
  }, [options, category]);

  const route = type === "TRANSFER" ? TRANSFER_ROUTES[category] : null;
  const touchesSafe = route ? (route.from === "SAFE" || route.to === "SAFE") && category !== "DROP" : fund === "SAFE";
  const safeClosed = touchesSafe && safe != null && !safe.session;
  const amt = Number(amount.replace(/\D/g, "")) || 0;
  const needsApproval = type === "OUT" && !manager && limit != null && amt > limit;
  const funds: Fund[] = manager ? ["DRAWER", "SAFE", "BANK"] : ["DRAWER", "SAFE"];

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const entry = await staffApi<CashEntry>("/api/cash/entries", {
        method: "POST",
        body: JSON.stringify({ type, category, amount: amt, fund: type === "TRANSFER" ? undefined : fund, description, photo }),
      });
      onDone(entry);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Lập phiếu"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy || safeClosed || !amt || !description.trim() || !category} onClick={() => void submit()}>
            {needsApproval ? "Gửi chờ duyệt" : "Lưu phiếu"}
          </Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-row" style={{ gap: 6, marginBottom: 10 }}>
        {(["OUT", "IN", "TRANSFER"] as EntryType[]).map((t) => (
          <Button key={t} size="sm" variant={type === t ? "primary" : "secondary"} onClick={() => setType(t)}>
            {t === "OUT" ? "Phiếu chi" : t === "IN" ? "Phiếu thu" : "Chuyển quỹ"}
          </Button>
        ))}
      </div>
      <div className="o-stack" style={{ gap: 10 }}>
        <Field label="Danh mục" required full>
          <select className="o-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {options.map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
        </Field>
        {type === "TRANSFER" ? (
          route && <Field label="Hướng chuyển" full><span>{FUND_LABEL[route.from]} → {FUND_LABEL[route.to]}</span></Field>
        ) : (
          <Field label={type === "OUT" ? "Chi từ quỹ" : "Thu vào quỹ"} required full>
            <select className="o-input" value={fund} onChange={(e) => setFund(e.target.value as Fund)}>
              {funds.map((f) => <option key={f} value={f}>{FUND_LABEL[f]}{f === "DRAWER" ? " (ca của bạn)" : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Số tiền" required full>
          <input className="o-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="VD: 35000" />
        </Field>
        <Field label="Nội dung" required full>
          <input className="o-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="VD: Mua 2 hột quẹt, 1 ổ điện" />
        </Field>
        {type !== "TRANSFER" && (
          <Field label={type === "OUT" && !manager ? "Ảnh hoá đơn (bắt buộc)" : "Ảnh chứng từ"} required={type === "OUT" && !manager} full>
            <PhotoInput value={photo} onChange={setPhoto} />
          </Field>
        )}
        {needsApproval && <Alert tone="info">Vượt hạn mức {formatVnd(limit!)} — phiếu sẽ chờ quản lý duyệt, chưa lấy tiền.</Alert>}
        {safeClosed && (
          <Alert tone="warning">
            Két đang đóng. <Button size="sm" variant="primary" icon={Vault} onClick={() => setOpeningSafe(true)}>Mở két</Button>
          </Alert>
        )}
      </div>
      {openingSafe && (
        <SafeOpenDialog
          defaultReason={catLabel(category)}
          onClose={() => setOpeningSafe(false)}
          onDone={() => { setOpeningSafe(false); void reloadSafe(); }}
        />
      )}
    </Modal>
  );
}

/* ═══════════════ Báo cáo ca ═══════════════ */

export type ShiftReport = {
  shift: {
    id: number;
    startTime: string;
    endTime: string | null;
    startingCash: number;
    note: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    staff: Who;
    reviewedBy: Who;
    store: { name: string; address: string | null };
  };
  byMethod: MethodRow[];
  /** Ca chưa đóng & người xem là thu ngân → ẩn tiền mặt (đếm mù) */
  blind?: boolean;
  totals: { orders: number; money: number | null; cash: number | null; bank: number; points: number; discounts: number; shippingFee: number; cancelledOrders: number };
  drawer: { startingCash: number; cashSales: number; cashSalesCount: number; cashIn: number; cashOut: number; expectedCash: number; actualCash?: number | null; difference?: number | null } | null;
  denominations: Counts | null;
  entries: CashEntry[];
};

function Line({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="o-row" style={{ justifyContent: "space-between", flexWrap: "nowrap", fontWeight: strong ? 700 : undefined, padding: "2px 0" }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/** Nội dung báo cáo ca — in được */
export function ShiftReportView({ r }: { r: ShiftReport }) {
  const d = r.drawer;
  return (
    <div className="cash-print o-stack" style={{ gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{r.shift.store.name} — Báo cáo ca #{r.shift.id}</div>
        <div className="o-muted">
          Thu ngân {r.shift.staff?.fullName} · {fmtDateTime(r.shift.startTime)} → {r.shift.endTime ? fmtDateTime(r.shift.endTime) : "đang mở"}
        </div>
      </div>

      <div>
        <div className="o-section-title" style={{ margin: "0 0 4px" }}>Doanh thu theo phương thức</div>
        {r.blind && <div className="o-muted">Tiền mặt được ẩn khi đếm mù — dưới đây chỉ là chuyển khoản / thẻ / online.</div>}
        {r.byMethod.length === 0 && !r.blind && <div className="o-muted">Chưa có giao dịch.</div>}
        {r.byMethod.map((m) => (
          <Line key={m.method} label={`${m.label} (${m.count})`} value={formatVnd(m.amount)} />
        ))}
        {r.totals.money != null && <Line label="Tổng tiền thu" value={formatVnd(r.totals.money)} strong />}
        {r.totals.cash != null && <Line label="— trong đó tiền mặt" value={formatVnd(r.totals.cash)} />}
        <Line label="— trong đó chuyển khoản / thẻ / online" value={formatVnd(r.totals.bank)} />
        {r.totals.shippingFee > 0 && <Line label="— gồm phí ship (thu hộ shipper)" value={formatVnd(r.totals.shippingFee)} />}
        <Line label={`Số đơn: ${r.totals.orders} · Giảm giá`} value={formatVnd(r.totals.discounts)} />
        {r.totals.cancelledOrders > 0 && <Line label="Đơn huỷ trong ca" value={r.totals.cancelledOrders} />}
      </div>

      <div>
        <div className="o-section-title" style={{ margin: "0 0 4px" }}>Tiền mặt trong ngăn kéo</div>
        {!d ? (
          <div className="o-muted">Đếm mù: tiền mặt bán hàng và tiền dự kiến được ẩn đến khi đóng ca. Đếm toàn bộ tiền trong ngăn kéo rồi nhập bên dưới.</div>
        ) : (
        <>
        <Line label="Tiền đầu ca (lấy từ két)" value={formatVnd(d.startingCash)} />
        <Line label={`+ Tiền mặt bán hàng (${d.cashSalesCount} đơn)`} value={formatVnd(d.cashSales)} />
        {d.cashIn > 0 && <Line label="+ Thu / lấy thêm vào ngăn kéo" value={formatVnd(d.cashIn)} />}
        {d.cashOut > 0 && <Line label="− Chi / nộp bớt từ ngăn kéo" value={formatVnd(d.cashOut)} />}
        <Line label="= Tiền mặt dự kiến" value={formatVnd(d.expectedCash)} strong />
        {d.actualCash != null && (
          <>
            <Line label="Tiền đếm thực tế (đã nộp két)" value={formatVnd(d.actualCash)} strong />
            <Line label="Chênh lệch" value={<Money value={d.difference ?? 0} signed />} strong />
            {r.shift.note && <div className="o-muted">Lý do: {r.shift.note}</div>}
          </>
        )}
        </>
        )}
        {r.denominations && <DenominationTable json={r.denominations} />}
      </div>

      {r.entries.length > 0 && (
        <div>
          <div className="o-section-title" style={{ margin: "0 0 4px" }}>Phiếu thu chi trong ca</div>
          {r.entries.map((e) => (
            <Line
              key={e.id}
              label={<>{e.code} · {catLabel(e.category)}{e.description ? ` — ${e.description}` : ""} {e.status !== "APPROVED" && <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>}</>}
              value={<Money value={signedFor(e, "DRAWER")} signed />}
            />
          ))}
        </div>
      )}

      {r.shift.reviewedAt && (
        <div className="o-muted">Quản lý {r.shift.reviewedBy?.fullName} đã xác nhận lúc {fmtDateTime(r.shift.reviewedAt)}{r.shift.reviewNote ? ` — ${r.shift.reviewNote}` : ""}</div>
      )}
    </div>
  );
}

/** In phần báo cáo đang mở (ẩn mọi thứ khác qua CSS @media print) */
export function PrintButton() {
  return <Button icon={Printer} onClick={() => window.print()}>In báo cáo</Button>;
}

/** Ảnh chứng từ phóng to */
export function Attachment({ url }: { url: string | null }) {
  if (!url) return <span className="o-muted">Không có ảnh</span>;
  const src = mediaUrl(url);
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt="Chứng từ" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 6 }} />
    </a>
  );
}

/* ═══════════════ Đóng ca (POS) ═══════════════ */

/**
 * Đóng ca: xem tổng hợp ca theo phương thức → đếm tiền ngăn kéo → lệch thì ghi lý do →
 * đóng ca (tiền đếm được tự nộp vào két) → hiện báo cáo để in.
 */
export function ShiftCloseDialog({ shiftId, onClose, onDone }: { shiftId: number; onClose: () => void; onDone: () => void }) {
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ShiftReport | null>(null);

  useEffect(() => {
    staffApi<ShiftReport>(`/api/cash/shifts/${shiftId}/report`).then(setReport).catch((e) => setErr(errMsg(e)));
  }, [shiftId]);

  // Quản lý thấy tiền dự kiến; thu ngân (drawer = null) đếm mù
  const check = useCountCheck(report?.drawer?.expectedCash ?? null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await staffApi("/api/shifts/close", { method: "POST", body: JSON.stringify(check.body("actualCash")) });
      setDone(await staffApi<ShiftReport>(`/api/cash/shifts/${shiftId}/report`));
    } catch (e) {
      setErr(errMsg(e));
      check.onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Modal title="Đã đóng ca" size="lg" onClose={onDone} footer={<><PrintButton /><Button variant="primary" onClick={onDone}>Xong</Button></>}>
        <Alert tone="info">Đã đóng ca và nộp {formatVnd(done.drawer?.actualCash ?? 0)} vào két.</Alert>
        <ShiftReportView r={done} />
      </Modal>
    );
  }

  return (
    <Modal
      title={`Đóng ca #${shiftId}`}
      size="lg"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={busy || !report || !check.canSubmit} onClick={() => void submit()}>Đóng ca & nộp két</Button></>}
    >
      {err && <Alert tone={check.blind ? "warning" : "danger"}>{err}</Alert>}
      {!report ? (
        <div className="o-muted">Đang tổng hợp ca…</div>
      ) : (
        <div className="o-stack" style={{ gap: 16 }}>
          <ShiftReportView r={report} />
          <div>
            <div className="o-section-title" style={{ margin: "0 0 6px" }}>Đếm tiền ngăn kéo</div>
            {check.view}
          </div>
        </div>
      )}
    </Modal>
  );
}
