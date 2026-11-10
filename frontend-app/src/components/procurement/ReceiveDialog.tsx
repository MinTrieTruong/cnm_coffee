/**
 * Nhận hàng theo đơn mua (tách từ pages/ProcurementAdmin.tsx) + đọc hoá đơn nhà cung cấp bằng AI.
 *
 * Luồng cũ giữ nguyên: đếm số thực nhận / trả lại (lý do + ảnh) / hạn dùng / phần thiếu, chụp ảnh hoá đơn (bắt buộc),
 * POST /api/purchasing/orders/:id/receive.
 * Có AI (GET /api/ai/invoice-ocr/status): chụp 1–3 ảnh → "Đọc hoá đơn bằng AI" → form được ĐIỀN SẴN:
 *  - ô AI điền: viền tím + chấm AI (sửa ô → thành giá trị người nhập); cảnh báo: viền vàng; lệch đơn mua: nhãn đỏ
 *  - màn chia đôi: ảnh hoá đơn (phóng to / kéo / xoay, bấm dòng → tô sáng vùng dòng đó) | form
 *  - mỗi dòng có "Đã kiểm"; "Xác nhận nhập kho" chỉ bật khi mọi dòng cần kiểm đã tích
 *  - hộp xác nhận cuối: số dòng, tổng theo hoá đơn so với theo đơn mua, các lệch còn lại, ô AI điền chưa sửa
 * AI không bao giờ tự nhập kho. Ảnh mờ (đo độ nét bằng code) / AI lỗi → "Không đọc được, vui lòng nhập tay".
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, Check, Loader2, Minus, Plus, RotateCw, Sparkles, X, ZoomIn } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { REJECT_REASON } from "../../lib/supplierReturns";
import { compressImage } from "../../lib/delivery";
import { SHARP_BLURRY, measureSharpness } from "../../lib/imageSharpness";
import { mediaUrl } from "../../lib/api";
import { PhotoPicker } from "../PhotoPicker";
import "../../styles/receive.css";

type RecvLine = {
  qty: string; rejected: string; expiry: string; note: string;
  reason: string; photo: string | null;
  action: "BACKORDER" | "CANCEL"; backorder: string;
};
type PoLine = { itemId: number; name: string; unit: string | null; ordered: number; received: number; remaining: number; unitPrice: number };
export type ReceivePo = { id: number; code: string; supplier?: { name: string }; lines: PoLine[] };

type Flag = { code: string; level: "warn" | "error"; text: string };
type Box = { page: number; x: number; y: number; w: number; h: number };
type InvoiceInfo = {
  rawName: string; qtyInvoice: number; unitInvoice: string | null; qtyStock: number | null; factor: number | null; conversionNote: string | null;
  unitPrice: number | null; lineTotal: number | null; stockUnitPrice: number | null; lotNo: string | null; matchConfidence: number; box: Box | null;
};
type Draft = { itemId: number; receivedQty: number; expiryDate: string | null; note: string; aiFilled: { receivedQty: boolean; expiryDate: boolean; note: boolean }; invoice: InvoiceInfo | null; flags: Flag[] };
type Unmatched = InvoiceInfo & { index: number; reason: string };
type ReadResult = {
  extractionId: number; readable: boolean; reason: string | null; legibility: number; latencyMs: number; imageUrls: string[];
  header: { invoiceNo: string | null; invoiceDate: string | null; supplierName: string | null; totalAmount: number | null; supplierMismatch: boolean; flags: Flag[] };
  lines: Draft[]; unmatched: Unmatched[]; totals: { invoice: number | null; linesSum: number; byPo: number; diff: number | null };
};
/** Trạng thái AI của một dòng: ô nào còn là giá trị AI, cảnh báo, đã kiểm chưa */
type AiLine = { qty: boolean; expiry: boolean; note: boolean; flags: Flag[]; invoice: InvoiceInfo | null; checked: boolean; remember: boolean };
type Photo = { dataUrl: string; sharpness: number };

const MAX_PHOTOS = 3;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateVi = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("vi-VN") : "");
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const fmtNum = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

/* ═══════════ Xem ảnh hoá đơn: phóng to / kéo / xoay, tô sáng vùng dòng ═══════════ */
function InvoiceViewer({ images, page, onPage, box }: { images: string[]; page: number; onPage: (p: number) => void; box: Box | null }) {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [full, setFull] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [page]);
  // Bấm dòng có toạ độ → phóng to và đưa vùng đó vào giữa
  useEffect(() => {
    if (!box) return;
    setZoom((z) => Math.max(z, 1.6));
    setPan({ x: (0.5 - (box.x + box.w / 2)) * 100, y: (0.5 - (box.y + box.h / 2)) * 100 });
  }, [box]);
  const down = (e: RPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPan({ x: drag.current.px + ((e.clientX - drag.current.x) / r.width) * 100 / zoom, y: drag.current.py + ((e.clientY - drag.current.y) / r.height) * 100 / zoom });
  };
  const src = images[page] ?? images[0];
  if (!src) return null;
  return (
    <div className={full ? "rcv-viewer is-full" : "rcv-viewer"}>
      <div className="rcv-viewer-tools">
        {images.length > 1 && images.map((_, i) => (
          <button key={i} type="button" className={i === page ? "is-on" : undefined} onClick={() => onPage(i)}>Trang {i + 1}</button>
        ))}
        <span className="rcv-grow" />
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.4))} aria-label="Thu nhỏ"><Minus size={14} /></button>
        <span className="rcv-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(5, z + 0.4))} aria-label="Phóng to"><Plus size={14} /></button>
        <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Xoay ảnh"><RotateCw size={14} /></button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setRot(0); }}>Vừa khung</button>
        {box && <span className="rcv-zoom" title="Vùng tô sáng do AI ước lượng, có thể lệch một dòng">vùng ước lượng</span>}
        <button type="button" className="rcv-full-btn" onClick={() => setFull((v) => !v)} aria-label={full ? "Thu nhỏ" : "Toàn màn hình"}>{full ? <X size={14} /> : <ZoomIn size={14} />}</button>
      </div>
      <div
        className="rcv-viewer-stage"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => Math.min(5, Math.max(1, z - Math.sign(e.deltaY) * 0.2)))}
        onClick={() => !full && window.matchMedia("(max-width: 860px)").matches && setFull(true)}
      >
        <div className="rcv-viewer-img" style={{ transform: `scale(${zoom}) translate(${pan.x}%, ${pan.y}%) rotate(${rot}deg)` }}>
          <img src={src} alt={`Hoá đơn trang ${page + 1}`} draggable={false} />
          {box && box.page - 1 === page && (
            <span className="rcv-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Hộp nhận hàng ═══════════ */
export function ReceiveDialog({ po, onClose, onDone }: { po: ReceivePo; onClose: () => void; onDone: () => void }) {
  const [recv, setRecv] = useState<Record<number, RecvLine>>(() => {
    const backorder = ymd(new Date(Date.now() + 3 * 86400_000));
    return Object.fromEntries(po.lines.filter((l) => l.remaining > 0).map((l) => [l.itemId, { qty: String(l.remaining), rejected: "", expiry: "", note: "", reason: "", photo: null, action: "BACKORDER" as const, backorder }]));
  });
  const [note, setNote] = useState("");
  const [reorder, setReorder] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Ảnh hoá đơn (data URL đã nén cạnh dài ≤ 2000px) + độ nét */
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [ai, setAi] = useState<Record<number, AiLine>>({});
  const [invoiceNo, setInvoiceNo] = useState("");
  const [assign, setAssign] = useState<Record<number, number | "skip">>({});
  const [active, setActive] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    staffApi<{ enabled: boolean }>("/api/ai/invoice-ocr/status").then((r) => setAiEnabled(r.enabled)).catch(() => setAiEnabled(false));
  }, []);

  const lineOf = (itemId: number) => po.lines.find((l) => l.itemId === itemId)!;
  const setField = <K extends keyof RecvLine>(itemId: number, k: K, v: RecvLine[K]) => {
    setRecv((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [k]: v } }));
    // Người nhận sửa ô → không còn là giá trị AI
    const aiKey = k === "qty" ? "qty" : k === "expiry" ? "expiry" : k === "note" ? "note" : null;
    if (aiKey) setAi((prev) => (prev[itemId]?.[aiKey] ? { ...prev, [itemId]: { ...prev[itemId], [aiKey]: false } } : prev));
  };

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    const out: Photo[] = [];
    for (const f of picked) {
      try {
        const dataUrl = await compressImage(f, 2000, 0.85);
        out.push({ dataUrl, sharpness: await measureSharpness(dataUrl).catch(() => Number.NaN) });
      } catch (e) {
        alert(e instanceof Error ? e.message : "Không đọc được ảnh");
      }
    }
    setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
  }

  async function readInvoice() {
    if (!photos.length || reading) return;
    setReading(true);
    setReadMsg(null);
    try {
      const r = await staffApi<ReadResult>(`/api/purchasing/orders/${po.id}/read-invoice`, {
        method: "POST",
        body: JSON.stringify({ images: photos.map((p) => p.dataUrl), sharpness: photos.map((p) => p.sharpness) }),
      });
      if (!r.readable) {
        setResult(null);
        setReadMsg(`Không đọc được hoá đơn${r.reason ? ` (${r.reason})` : ""}. Vui lòng nhập tay.`);
        return;
      }
      setResult(r);
      setInvoiceNo(r.header.invoiceNo ?? "");
      setAssign({});
      // Điền form từ dòng nháp (chỉ mặt hàng còn phải giao)
      setRecv((prev) => {
        const next = { ...prev };
        for (const d of r.lines) {
          if (!next[d.itemId]) continue;
          next[d.itemId] = { ...next[d.itemId], qty: String(d.receivedQty), expiry: d.expiryDate ?? "", note: d.note || next[d.itemId].note };
        }
        return next;
      });
      setAi(Object.fromEntries(r.lines.map((d) => [d.itemId, { qty: d.aiFilled.receivedQty, expiry: d.aiFilled.expiryDate, note: d.aiFilled.note, flags: d.flags, invoice: d.invoice, checked: false, remember: !!d.invoice?.factor && d.invoice.factor !== 1 }])));
    } catch (e) {
      const err = e as Error & { status?: number };
      setReadMsg(`Không đọc được hoá đơn (${err.message}). Vui lòng nhập tay.`);
    } finally {
      setReading(false);
    }
  }

  /** Dòng hoá đơn "không có trong đơn mua" → gán vào mặt hàng của đơn mua (cộng số lượng, phải kiểm) */
  function assignUnmatched(u: Unmatched, itemId: number | "skip") {
    setAssign((a) => ({ ...a, [u.index]: itemId }));
    if (itemId === "skip") return;
    const l = lineOf(itemId);
    const add = Math.round(u.qtyStock ?? u.qtyInvoice);
    setRecv((prev) => ({ ...prev, [itemId]: { ...prev[itemId], qty: String(Math.min(l.remaining, Number(prev[itemId]?.qty || 0) + add)) } }));
    const factor = u.qtyStock && u.qtyInvoice ? u.qtyStock / u.qtyInvoice : 1;
    setAi((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { qty: true, expiry: false, note: false, flags: [], invoice: null }),
        qty: true,
        checked: false,
        remember: true,
        invoice: prev[itemId]?.invoice ?? { ...u, factor },
        flags: [...(prev[itemId]?.flags ?? []).filter((f) => f.code !== "NOT_ON_INVOICE"), { code: "MANUAL_MATCH", level: "warn", text: `Gán tay từ dòng hoá đơn "${u.rawName}" (${fmtNum(u.qtyInvoice)} ${u.unitInvoice ?? ""}).` }],
      },
    }));
  }

  const rows = po.lines.filter((l) => recv[l.itemId]);
  /** Dòng hoá đơn của mặt hàng đã nhận đủ (không còn phải giao) — chỉ báo, không nhập kho */
  const doneLines = result ? result.lines.filter((d) => d.invoice && !recv[d.itemId]) : [];
  /** Dòng phải tích "Đã kiểm": có số nhận hoặc có cảnh báo (chỉ khi dùng AI) */
  const needCheck = (itemId: number) => !!result && (Number(recv[itemId]?.qty || 0) > 0 || (ai[itemId]?.flags.length ?? 0) > 0);
  const unchecked = result ? rows.filter((l) => needCheck(l.itemId) && !ai[l.itemId]?.checked) : [];
  const pendingUnmatched = result ? result.unmatched.filter((u) => assign[u.index] == null) : [];
  const checkClean = () => setAi((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.flags.length ? v : { ...v, checked: true }])));

  const toInt = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const lines = rows.map((l) => {
    const r = recv[l.itemId];
    return {
      itemId: l.itemId, name: l.name, remaining: l.remaining, unitPrice: l.unitPrice, receivedQty: toInt(r.qty), rejectedQty: toInt(r.rejected), expiryDate: r.expiry || null, note: r.note,
      rejectReason: r.reason || undefined, rejectPhoto: r.photo || undefined, shortAction: r.action, backorderDate: r.backorder || null,
    };
  });
  const byPo = lines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0);
  const aiUntouched = result ? Object.entries(ai).reduce((s, [, a]) => s + Number(a.qty) + Number(a.expiry) + Number(a.note), 0) : 0;
  const errorsLeft = result ? rows.flatMap((l) => (ai[l.itemId]?.flags ?? []).filter((f) => f.level === "error").map((f) => `${l.name}: ${f.text}`)) : [];

  /** Kiểm tra như luồng cũ; trả câu lỗi hoặc null */
  function invalid(): string | null {
    const bad = lines.find((l) => !Number.isInteger(l.receivedQty) || l.receivedQty < 0 || !Number.isInteger(l.rejectedQty) || l.rejectedQty < 0 || l.receivedQty + l.rejectedQty > l.remaining);
    if (bad) return `Số lượng của ${bad.name} không hợp lệ: thực nhận + trả lại tối đa ${bad.remaining}.`;
    const noProof = lines.find((l) => l.rejectedQty > 0 && (!l.rejectReason || !l.rejectPhoto));
    if (noProof) return `${noProof.name}: chọn lý do và chụp ảnh hàng bị trả lại.`;
    if (lines.some((l) => l.receivedQty > 0) && !photos.length) return "Chụp ảnh hoá đơn / phiếu giao hàng của nhà cung cấp làm chứng từ công nợ.";
    const short = lines.filter((l) => l.receivedQty < l.remaining);
    if (!lines.some((l) => l.receivedQty > 0 || l.rejectedQty > 0) && !short.some((l) => l.shortAction === "CANCEL")) return "Nhập số thực nhận cho ít nhất 1 mặt hàng.";
    if (unchecked.length) return `Còn ${unchecked.length} dòng chưa tích "Đã kiểm".`;
    if (pendingUnmatched.length) return `Còn ${pendingUnmatched.length} dòng hoá đơn "Không có trong đơn mua" chưa xử lý (gán mặt hàng hoặc Bỏ qua).`;
    return null;
  }

  function summaryText() {
    const short = lines.filter((l) => l.receivedQty < l.remaining);
    const noExpiry = lines.filter((l) => l.receivedQty > 0 && !l.expiryDate).map((l) => l.name);
    const waiting = short.filter((l) => l.shortAction === "BACKORDER");
    const cut = short.filter((l) => l.shortAction === "CANCEL");
    return [
      waiting.length ? `Chờ giao bù: ${waiting.map((l) => `${l.name} thiếu ${l.remaining - l.receivedQty}${l.backorderDate ? ` (hẹn ${dateVi(l.backorderDate)})` : ""}`).join(", ")}.` : "",
      cut.length ? `Hủy phần thiếu: ${cut.map((l) => `${l.name} ${l.remaining - l.receivedQty}`).join(", ")}${reorder ? " — tạo đề xuất mua mới" : ""}.` : "",
      noExpiry.length ? `Chưa nhập hạn sử dụng: ${noExpiry.join(", ")} — sẽ không có cảnh báo hết hạn cho lô này.` : "",
    ].filter(Boolean);
  }

  function startConfirm() {
    const err = invalid();
    if (err) return alert(err);
    // Không dùng AI: hộp xác nhận như cũ
    if (!result) {
      const msg = ["Xác nhận nhập kho (tạo phiếu nhập GRN)? Tồn kho và công nợ NCC tính theo số thực nhận.", ...summaryText().map((s) => `\n${s}`)].join("");
      if (window.confirm(msg)) void submit();
      return;
    }
    setConfirmOpen(true);
  }

  async function submit() {
    setBusy(true);
    try {
      const unitAliases = [
        ...rows
          .filter((l) => ai[l.itemId]?.remember && ai[l.itemId]?.invoice?.factor)
          .map((l) => ({ rawName: ai[l.itemId].invoice!.rawName, itemId: l.itemId, factor: ai[l.itemId].invoice!.factor!, unitInvoice: ai[l.itemId].invoice!.unitInvoice })),
      ];
      const r = await staffApi<{ reorderCode: string | null }>(`/api/purchasing/orders/${po.id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          note,
          reorder,
          // Đã đọc bằng AI: dùng ảnh đã lưu (không gửi lại); không thì gửi ảnh như cũ
          ...(result ? { extractionId: result.extractionId, invoicePhotoUrl: result.imageUrls[0], invoiceNo: invoiceNo.trim() || undefined, unitAliases } : { invoicePhoto: photos[0]?.dataUrl }),
          lines: lines.map((l) => ({
            itemId: l.itemId, receivedQty: l.receivedQty, rejectedQty: l.rejectedQty, expiryDate: l.expiryDate, note: l.note,
            rejectReason: l.rejectReason, rejectPhoto: l.rejectPhoto, shortAction: l.shortAction, backorderDate: l.backorderDate,
          })),
        }),
      });
      if (r.reorderCode) alert(`Đã tạo đề xuất mua ${r.reorderCode} cho phần bị hủy (chờ duyệt).`);
      onDone();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi nhập kho");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  const activeBox = active != null ? ai[active]?.invoice?.box ?? null : null;
  useEffect(() => {
    if (activeBox) setPage(Math.max(0, activeBox.page - 1));
  }, [activeBox]);
  const imageSrcs = useMemo(() => (result ? result.imageUrls.map((u) => mediaUrl(u) ?? u) : photos.map((p) => p.dataUrl)), [result, photos]);
  const blurry = photos.some((p) => Number.isFinite(p.sharpness) && p.sharpness < SHARP_BLURRY);

  const flagBadges = (flags: Flag[]) =>
    flags.map((f, i) => (
      <div key={i} className={f.level === "error" ? "rcv-flag is-error" : "rcv-flag"}>
        <AlertTriangle size={13} aria-hidden /> {f.text}
      </div>
    ));

  const form = (
    <div className="rcv-form">
      {result && (
        <div className="rcv-head">
          <label>Số hoá đơn<input className="input-field" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value.slice(0, 50))} /></label>
          <div><span className="rcv-muted">Ngày</span><b>{result.header.invoiceDate ? dateVi(result.header.invoiceDate) : "—"}</b></div>
          <div><span className="rcv-muted">NCC trên hoá đơn</span><b className={result.header.supplierMismatch ? "rcv-bad" : undefined}>{result.header.supplierName ?? "—"}</b></div>
          <div><span className="rcv-muted">Tổng hoá đơn / theo đơn mua</span><b>{result.totals.invoice != null ? vnd(result.totals.invoice) : "—"} / {vnd(byPo)}</b></div>
          {result.header.flags.length > 0 && <div className="rcv-head-flags">{flagBadges(result.header.flags)}</div>}
        </div>
      )}

      {rows.map((l) => {
        const r = recv[l.itemId];
        const a = ai[l.itemId];
        const got = Number(r.qty || 0);
        const rejected = Number(r.rejected || 0);
        const short = Math.max(0, l.remaining - got);
        const warn = !!a?.flags.some((f) => f.level === "warn");
        const err = !!a?.flags.some((f) => f.level === "error");
        const cls = (on: boolean | undefined) => ["input-field", on ? "rcv-ai" : "", on && (warn || err) ? "rcv-ai-warn" : ""].filter(Boolean).join(" ");
        return (
          <div key={l.itemId} className={`rcv-line${active === l.itemId ? " is-active" : ""}${err ? " is-error" : warn ? " is-warn" : ""}`} onClick={() => setActive(l.itemId)}>
            <div className="rcv-line-head">
              <div>
                <div className="rcv-name">{l.name}</div>
                <div className="rcv-muted">Đặt {l.ordered} {l.unit}{l.received ? ` · đã nhận ${l.received}` : ""} · còn phải giao {l.remaining} · giá {vnd(l.unitPrice)}</div>
              </div>
              {result && needCheck(l.itemId) && (
                <label className={a?.checked ? "rcv-check is-on" : "rcv-check"} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={!!a?.checked} onChange={(e) => setAi((p) => ({ ...p, [l.itemId]: { ...(p[l.itemId] ?? { qty: false, expiry: false, note: false, flags: [], invoice: null, remember: false }), checked: e.target.checked } }))} />
                  Đã kiểm
                </label>
              )}
            </div>
            {a?.invoice && (
              <div className="rcv-oninv">
                Trên hoá đơn: “{a.invoice.rawName}” {fmtNum(a.invoice.qtyInvoice)} {a.invoice.unitInvoice ?? ""}
                {a.invoice.unitPrice != null && ` × ${vnd(a.invoice.unitPrice)}`}
                {a.invoice.conversionNote && ` (${a.invoice.conversionNote})`}
                {a.invoice.factor && a.invoice.factor !== 1 && (
                  <label className="rcv-remember" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={a.remember} onChange={(e) => setAi((p) => ({ ...p, [l.itemId]: { ...p[l.itemId], remember: e.target.checked } }))} /> Ghi nhớ quy đổi này cho nhà cung cấp
                  </label>
                )}
              </div>
            )}
            <div className="rcv-fields">
              <label>Thực nhận {a?.qty && <span className="rcv-ai-dot" title="AI điền"><Sparkles size={11} /></span>}<input className={cls(a?.qty)} style={{ width: 90 }} inputMode="numeric" value={r.qty} onChange={(e) => setField(l.itemId, "qty", e.target.value.replace(/\D/g, ""))} /></label>
              <label>Trả lại (hỏng)<input className="input-field" style={{ width: 90 }} inputMode="numeric" value={r.rejected} onChange={(e) => setField(l.itemId, "rejected", e.target.value.replace(/\D/g, ""))} /></label>
              <label>Hạn sử dụng {a?.expiry && <span className="rcv-ai-dot" title="AI điền"><Sparkles size={11} /></span>}<input type="date" className={cls(a?.expiry)} value={r.expiry} onChange={(e) => setField(l.itemId, "expiry", e.target.value)} /></label>
              <label className="rcv-grow">Ghi chú {a?.note && <span className="rcv-ai-dot" title="AI điền"><Sparkles size={11} /></span>}<input className={cls(a?.note)} style={{ width: "100%" }} value={r.note} onChange={(e) => setField(l.itemId, "note", e.target.value)} placeholder="VD: 2 hộp móp" /></label>
            </div>
            {a && a.flags.length > 0 && <div className="rcv-flags">{flagBadges(a.flags)}</div>}
            {rejected > 0 && (
              <div className="rcv-reject">
                <label>Lý do trả lại<br />
                  <select className="input-field" value={r.reason} onChange={(e) => setField(l.itemId, "reason", e.target.value)}>
                    <option value="">-- Chọn --</option>
                    {Object.entries(REJECT_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <PhotoPicker value={r.photo} onChange={(v) => setField(l.itemId, "photo", v)} />
              </div>
            )}
            {short > 0 && (
              <div className="rcv-short">
                <span>Còn thiếu {short}{rejected ? ` (gồm ${rejected} trả lại)` : ""}:</span>
                <label><input type="radio" checked={r.action === "BACKORDER"} onChange={() => setField(l.itemId, "action", "BACKORDER")} /> Chờ giao bù</label>
                {r.action === "BACKORDER" && <input type="date" className="input-field" min={ymd(new Date())} value={r.backorder} onChange={(e) => setField(l.itemId, "backorder", e.target.value)} />}
                <label><input type="radio" checked={r.action === "CANCEL"} onChange={() => setField(l.itemId, "action", "CANCEL")} /> Hủy phần thiếu</label>
              </div>
            )}
          </div>
        );
      })}

      {result && doneLines.length > 0 && (
        <div className="rcv-unmatched rcv-done">
          <h4>Mặt hàng đã nhận đủ trước đó</h4>
          {doneLines.map((d) => (
            <div key={d.itemId} className="rcv-um">
              <div>{lineOf(d.itemId)?.name ?? `#${d.itemId}`}: hoá đơn ghi “{d.invoice!.rawName}” {fmtNum(d.invoice!.qtyInvoice)} {d.invoice!.unitInvoice ?? ""} — không nhập kho thêm. Kiểm tra có phải hoá đơn cũ / giao dư không.</div>
            </div>
          ))}
        </div>
      )}

      {result && result.unmatched.length > 0 && (
        <div className="rcv-unmatched">
          <h4>Không có trong đơn mua</h4>
          {result.unmatched.map((u) => (
            <div key={u.index} className={assign[u.index] == null ? "rcv-um is-pending" : "rcv-um"}>
              <div>“{u.rawName}” — {fmtNum(u.qtyInvoice)} {u.unitInvoice ?? ""}{u.unitPrice != null ? ` × ${vnd(u.unitPrice)}` : ""}</div>
              <select className="input-field" value={assign[u.index] ?? ""} onChange={(e) => assignUnmatched(u, e.target.value === "skip" ? "skip" : Number(e.target.value))} disabled={assign[u.index] != null && assign[u.index] !== "skip"}>
                <option value="" disabled>Chọn mặt hàng của đơn mua…</option>
                {rows.map((l) => <option key={l.itemId} value={l.itemId}>{l.name}</option>)}
                <option value="skip">Bỏ qua (không nhập kho)</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {Object.values(recv).some((r) => r.action === "CANCEL") && (
        <label className="rcv-small"><input type="checkbox" checked={reorder} onChange={(e) => setReorder(e.target.checked)} /> Tạo đề xuất mua mới cho phần bị hủy (lấy báo giá NCC khác)</label>
      )}
      <label className="rcv-small">Ghi chú đợt nhận<br /><input className="input-field" style={{ width: "100%" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: tài xế NCC ký biên bản trả hàng" /></label>
    </div>
  );

  const photosBox = (
    <div className={`rcv-photos${photos.length ? " has" : ""}`}>
      <div className="rcv-photos-title">Ảnh hoá đơn / phiếu giao hàng của NCC (bắt buộc{aiEnabled ? `, tối đa ${MAX_PHOTOS} ảnh nếu hoá đơn dài` : ""})</div>
      <div className="rcv-photos-row">
        {photos.map((p, i) => (
          <span key={i} className="rcv-thumb">
            <img src={p.dataUrl} alt={`Ảnh hoá đơn ${i + 1}`} />
            {!result && <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} aria-label="Xoá ảnh"><X size={12} /></button>}
          </span>
        ))}
        {!result && photos.length < (aiEnabled ? MAX_PHOTOS : 1) && (
          <button type="button" className="secondary-btn rcv-add-photo" onClick={() => fileRef.current?.click()}><Camera size={14} /> {photos.length ? "Thêm trang" : "Chụp ảnh"}</button>
        )}
        {aiEnabled && photos.length > 0 && !result && (
          <button type="button" className="primary-btn rcv-read" onClick={() => void readInvoice()} disabled={reading}>
            {reading ? <Loader2 size={15} className="rcv-spin" /> : <Sparkles size={15} />} {reading ? "Đang đọc hoá đơn…" : "Đọc hoá đơn bằng AI"}
          </button>
        )}
      </div>
      {blurry && !result && <div className="rcv-warn-text">Ảnh có vẻ mờ — nên chụp lại gần hơn, đủ sáng để AI đọc đúng.</div>}
      {readMsg && <div className="rcv-err-text">{readMsg}</div>}
      <div className="rcv-muted rcv-small">Chứng từ để đối chiếu công nợ với nhà cung cấp.</div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
    </div>
  );

  return (
    <div className="rcv-scrim">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className={result ? "rcv-dialog is-review" : "rcv-dialog"}>
        <header className="rcv-title">
          <div>
            <h2>Nhập kho — {po.code}</h2>
            <p className="rcv-muted">
              {result
                ? `AI đã điền sẵn từ hoá đơn (${(result.latencyMs / 1000).toFixed(1)} giây). Ô viền tím do AI điền — đối chiếu với ảnh, tích "Đã kiểm" từng dòng rồi mới xác nhận.`
                : "Đếm hàng thực nhận. Hàng hỏng / sai quy cách ghi vào \"Trả lại\" kèm lý do và ảnh (không nhập kho, không tính tiền). Phần còn thiếu: chờ nhà cung cấp giao bù hoặc hủy."}
            </p>
          </div>
          <button type="button" className="rcv-x" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </header>

        <div className="rcv-body">
          {result ? (
            <>
              <div className="rcv-left">
                <InvoiceViewer images={imageSrcs} page={page} onPage={setPage} box={activeBox} />
              </div>
              <div className="rcv-right">{form}</div>
            </>
          ) : (
            <div className="rcv-single">
              {photosBox}
              <div className={reading ? "rcv-form-wrap is-reading" : "rcv-form-wrap"}>
                {reading && <div className="rcv-reading"><Loader2 size={18} className="rcv-spin" /> AI đang đọc hoá đơn… vẫn nhập tay được</div>}
                {form}
              </div>
            </div>
          )}
        </div>

        <footer className="rcv-foot">
          {result && (
            <button type="button" className="secondary-btn rcv-quick" onClick={checkClean} disabled={!rows.some((l) => needCheck(l.itemId) && !ai[l.itemId]?.checked && !ai[l.itemId]?.flags.length)}>
              <Check size={14} /> Tích các dòng không có cảnh báo
            </button>
          )}
          <span className="rcv-grow" />
          {result && (unchecked.length > 0 || pendingUnmatched.length > 0) && (
            <span className="rcv-left-count">{unchecked.length ? `Còn ${unchecked.length} dòng chưa kiểm` : ""}{unchecked.length && pendingUnmatched.length ? " · " : ""}{pendingUnmatched.length ? `${pendingUnmatched.length} dòng ngoài đơn mua chưa xử lý` : ""}</span>
          )}
          <button className="secondary-btn rcv-cancel" onClick={onClose}>Hủy</button>
          <button
            className="primary-btn rcv-submit"
            onClick={startConfirm}
            disabled={busy || reading || (!!result && (unchecked.length > 0 || pendingUnmatched.length > 0))}
            title={result && unchecked.length ? `Còn ${unchecked.length} dòng chưa tích "Đã kiểm"` : undefined}
          >
            {busy ? "Đang lưu…" : "Xác nhận nhập kho (tạo GRN)"}
          </button>
        </footer>
      </motion.div>

      {confirmOpen && result && (
        <div className="rcv-confirm-back">
          <div className="rcv-confirm" role="dialog" aria-modal="true" aria-labelledby="rcv-confirm-title">
            <h3 id="rcv-confirm-title">Xác nhận nhập kho?</h3>
            <ul>
              <li><b>{lines.filter((l) => l.receivedQty > 0).length}</b> mặt hàng nhập kho, tổng theo đơn mua <b>{vnd(byPo)}</b>{result.totals.invoice != null && <> · theo hoá đơn <b>{vnd(result.totals.invoice)}</b>{Math.abs(result.totals.invoice - byPo) > 1 && <span className="rcv-bad"> (lệch {vnd(result.totals.invoice - byPo)})</span>}</>}</li>
              {invoiceNo.trim() && <li>Số hoá đơn: <b>{invoiceNo.trim()}</b></li>}
              {aiUntouched > 0 && <li>{aiUntouched} ô vẫn là giá trị AI điền (chưa sửa) — bạn đã đối chiếu với hoá đơn.</li>}
              {errorsLeft.map((e, i) => <li key={i} className="rcv-bad">{e}</li>)}
              {result.header.flags.filter((f) => f.level === "error").map((f, i) => <li key={`h${i}`} className="rcv-bad">{f.text}</li>)}
              {summaryText().map((s, i) => <li key={`s${i}`}>{s}</li>)}
            </ul>
            <p className="rcv-muted">Tồn kho và công nợ nhà cung cấp tính theo số thực nhận × giá báo giá.</p>
            <div className="rcv-confirm-actions">
              <button className="secondary-btn" onClick={() => setConfirmOpen(false)}>Quay lại kiểm tra</button>
              <button className="primary-btn" onClick={() => void submit()} disabled={busy}>{busy ? "Đang lưu…" : "Xác nhận nhập kho"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
