import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { apiBase, apiOrigin } from "../lib/api";
import { mapFetchError } from "../lib/net";
import { getStaffInfo, staffApi } from "../lib/staffApi";
import { PosDeliveryPanel } from "../components/PosDeliveryPanel";

/** Âm thanh nhỏ nhẹ khi nhận yêu cầu thanh toán từ phục vụ. */
function playPaymentRequestSound() {
  try {
    const ctx = new AudioContext();
    const playNote = (freq: number, time: number, vol = 0.28) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.start(time);
      osc.stop(time + 0.38);
    };
    const t = ctx.currentTime;
    playNote(660, t);          // E5
    playNote(784, t + 0.18);   // G5
    playNote(880, t + 0.34);   // A5
    setTimeout(() => ctx.close(), 1500);
  } catch { /* */ }
}

type Zone = {
  id: number;
  name: string;
  isActive: boolean;
};

type TableRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
  zoneId?: number;
  paymentStatus?: string;
  orders: { id: number; status: string; totalAmount: number; details?: any[] }[];
};

type PendingDetail = {
  id: number;
  quantity: number;
  unitPrice: number;
  product: { name: string };
};

type PendingOrder = {
  id: number;
  createdAt: string;
  subTotal: number;
  discountAmt: number;
  orderType?: string;
  table: { id: number; name: string } | null;
  customer: { id: number; fullName: string; phone: string | null; points: number } | null;
  details: PendingDetail[];
  status?: string;
  payments?: { method: string, shiftId: number | null }[];
};

type BillItem = { id: number; name: string; quantity: number; unitPrice: number; lineTotal: number; customNotes: string | null };
type BillRecord = {
  id: number;
  createdAt: string;
  orderType: string;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subTotal: number;
  discountAmt: number;
  vatAmount: number;
  totalAmount: number;
  payMethod: string | null;
  paidAt: string | null;
  items: BillItem[];
};

type StoreSettings = {
  vatRatePercent: number;
  pointPerVnd: number;
  pointValueVnd: number;
  cashRoundTo: number;
  pointEarnEveryVnd: number;
  pointEarnEach: number;
};

function computePointsEarned(paidAmountVnd: number, everyVnd: number, each: number) {
  const block = everyVnd > 0 ? everyVnd : 1000;
  const pts = each > 0 ? each : 100;
  return Math.floor(paidAmountVnd / block) * pts;
}

type ShiftRow = { id: number; startTime: string; startingCash: number } | null;

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function computeBill(
  subTotal: number,
  discountAmt: number,
  pointsToUse: number,
  pointValueVnd: number,
  vatRatePercent: number,
) {
  const pointsDiscount = pointsToUse * pointValueVnd;
  const taxable = Math.max(0, subTotal - discountAmt - pointsDiscount);
  const vatAmount = Math.floor((taxable * vatRatePercent) / 100);
  const totalAmount = taxable + vatAmount;
  return { taxable, pointsDiscount, vatAmount, totalAmount };
}

function roundCashAmount(amount: number, roundTo: number) {
  if (roundTo <= 1) return amount;
  return Math.round(amount / roundTo) * roundTo;
}

function tableStatusMeta(status: string) {
  if (status === "Occupied")    return { cls: "table-tile-occupied", label: "Có khách" };
  if (status === "Waiting_Pay") return { cls: "table-tile-paying",   label: "Đang thanh toán" };
  if (status === "Cleaning")   return { cls: "table-tile-cleaning",  label: "Vừa thanh toán" };
  return { cls: "table-tile-empty", label: "Trống" };
}

function getDrinkBadge(order: any) {
  if (!order || !order.details || order.details.length === 0) return null;
  const details = order.details;
  const readyItems = details.filter((d: any) => d.kdsStatus === "Ready");
  if (readyItems.length > 0) {
    const qty = readyItems.reduce((acc: number, d: any) => acc + d.quantity, 0);
    return (
      <div style={{
        position: "absolute", top: -8, right: -8,
        background: "var(--danger)", color: "#fff",
        padding: "0.25rem 0.5rem", borderRadius: 12,
        fontSize: "0.75rem", fontWeight: 700,
        boxShadow: "0 4px 12px rgba(220, 38, 38, 0.4)",
        animation: "badge-pulse 1.5s infinite"
      }}>
        {qty} món
      </div>
    );
  }
  const pendingItems = details.filter((d: any) => ["Hold", "Waiting", "Cooking"].includes(d.kdsStatus));
  if (pendingItems.length > 0) {
    return (
      <div style={{
        position: "absolute", top: -6, right: -6,
        background: "rgba(0,0,0,0.6)", color: "#fff",
        padding: "0.2rem 0.45rem", borderRadius: 8,
        fontSize: "0.7rem", fontWeight: 700,
      }}>
        Đang pha
      </div>
    );
  }
  const servedItems = details.filter((d: any) => d.kdsStatus === "Served");
  if (servedItems.length === details.length) {
    return (
      <div style={{
        position: "absolute", top: -6, right: -6,
        background: "#047857", color: "#fff",
        padding: "0.2rem 0.45rem", borderRadius: 8,
        fontSize: "0.7rem", fontWeight: 700,
        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
      }}>
        Đủ món
      </div>
    );
  }
  return null;
}

export function Pos() {
  const info = getStaffInfo();
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<number | "all">("all");
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [shift, setShift] = useState<ShiftRow | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [startingCash, setStartingCash] = useState("500000");
  const [actualCash, setActualCash] = useState("");
  const [payOrder, setPayOrder] = useState<PendingOrder | null>(null);
  const [billModal, setBillModal] = useState<PendingOrder | null>(null);
  const [billStep, setBillStep] = useState<"bill" | "pay">("bill");
  const [payMethod, setPayMethod] = useState("Cash");
  const [cashGiven, setCashGiven] = useState("");
  const [pointsToUse, setPointsToUse] = useState(0);
  // --- Lịch sử bill ---
  const [showBillHistory, setShowBillHistory] = useState(false);
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billHistory, setBillHistory] = useState<BillRecord[]>([]);
  const [billHistoryLoading, setBillHistoryLoading] = useState(false);
  const [billHistoryErr, setBillHistoryErr] = useState<string | null>(null);
  const [billDetailModal, setBillDetailModal] = useState<BillRecord | null>(null);

  const [, setMenuTableId] = useState<number | null>(null);
  

  /** Mở popup riêng để in bill — đảm bảo chỉ 1 trang, không lẫn layout trang POS */
  function printBill(order: PendingOrder, vatAmount: number, totalAmount: number, vatRate: number) {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const rows = order.details
      .map(
        (d) =>
          `<tr>
            <td>${d.product.name}</td>
            <td style="text-align:center">×${d.quantity}</td>
            <td style="text-align:right">${new Intl.NumberFormat("vi-VN").format(d.unitPrice * d.quantity)}&nbsp;đ</td>
          </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Bill #${order.id} – TD Coffee</title>
  <style>
    @page { size: 80mm auto; margin: 6mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: monospace; font-size: 13px; color: #000; }
    body { width: 80mm; }
    .wrap { border: 1px solid #000; padding: 8px; }
    h1 { text-align: center; font-size: 15px; margin-bottom: 2px; }
    .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 8px; }
    .info { font-size: 12px; margin-bottom: 8px; border-bottom: 1px dashed #999; padding-bottom: 6px; }
    .info div { display: flex; justify-content: space-between; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    thead tr { border-bottom: 1px solid #444; }
    th { font-weight: 700; padding-bottom: 3px; }
    td, th { padding: 2px 0; vertical-align: top; }
    th:nth-child(2), td:nth-child(2) { text-align: center; width: 24px; }
    th:nth-child(3), td:nth-child(3) { text-align: right; }
    .totals { border-top: 1px solid #444; padding-top: 6px; font-size: 12px; }
    .totals div { display: flex; justify-content: space-between; margin-top: 2px; }
    .grand { font-weight: 700; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
    .footer { text-align: center; font-size: 11px; color: #555; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>TD COFFEE</h1>
    <div class="sub">——— HÓA ĐƠN TẠM TÍNH ———<br/>Bill #${order.id}</div>
    <div class="info">
      <div><span>Giờ vào:</span><span>${new Date(order.createdAt).toLocaleString("vi-VN")}</span></div>
      <div><span>Khách:</span><span>${order.customer?.fullName ?? "Vãng lai"}${order.customer?.phone ? " · " + order.customer.phone : ""}</span></div>
      ${order.table ? `<div><span>Bàn:</span><span>${order.table.name}</span></div>` : ""}
    </div>
    <table>
      <thead><tr><th>Món</th><th>SL</th><th>T.tiền</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>Tạm tính:</span><span>${new Intl.NumberFormat("vi-VN").format(order.subTotal)}&nbsp;đ</span></div>
      <div><span>VAT (${vatRate}%):</span><span>${new Intl.NumberFormat("vi-VN").format(vatAmount)}&nbsp;đ</span></div>
      <div class="grand"><span>TỔNG PHẢI THU:</span><span>${new Intl.NumberFormat("vi-VN").format(totalAmount)}&nbsp;đ</span></div>
    </div>
    <div class="footer">Cảm ơn quý khách! Hẹn gặp lại</div>
  </div>
  <script>window.onload = function() { window.print(); window.close(); }<\/script>
</body>
</html>`);
    win.document.close();
  }

  const loadTables = useCallback(async () => {
    const base = apiBase();
    let res: Response;
    try {
      res = await fetch(`${base}/api/pos/tables`);
    } catch (e) {
      throw mapFetchError(e);
    }
    if (!res.ok) throw new Error("Không tải được bàn");
    const data = (await res.json()) as TableRow[];
    setTables(data);
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const data = await staffApi<PendingOrder[]>("/api/pos/pending-orders");
      // Đơn giao COD chưa thu tiền được quản lý ở bảng "Đơn giao hàng" (shipper thu hộ)
      setPending(data.filter((o) => !(o.orderType === "Delivery" && o.status !== "Paid")));
    } catch {
      setPending([]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await staffApi<StoreSettings>("/api/pos/store-settings");
      setSettings({
        ...s,
        pointEarnEveryVnd: s.pointEarnEveryVnd ?? 1000,
        pointEarnEach: s.pointEarnEach ?? 100,
      });
    } catch {
      setSettings(null);
    }
  }, []);

  const loadShift = useCallback(async () => {
    try {
      const data = await staffApi<{ shift: ShiftRow }>("/api/shifts/open");
      setShift(data.shift);
    } catch {
      setShift(null);
    }
  }, []);

  const loadZones = useCallback(async () => {
    try {
      const z = await staffApi<Zone[]>("/api/pos/zones");
      setZones(z);
      const savedZone = localStorage.getItem("staff_selected_zone");
      if (savedZone && savedZone !== "all") {
        setActiveZoneId(Number(savedZone));
      }
    } catch {
      setZones([]);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setErr(null);
      await Promise.all([loadTables(), loadShift(), loadPending(), loadSettings(), loadZones()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }, [loadTables, loadShift, loadPending, loadSettings, loadZones]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", "pos");
    socket.emit("join", "staff");
    socket.on("payment:done", (payload?: { orderId: number; isOnline?: boolean; method?: string; tableLabel?: string; customerLabel?: string }) => {
      if (payload?.isOnline) {
        setToast(`Đã thanh toán: ${payload.tableLabel ?? "Mang về"} qua ${payload.method ?? "Online"}. Vui lòng xác nhận trong Đơn chờ!`);
        playPaymentRequestSound();
      } else {
        setToast("Đã thanh toán xong.");
      }
      setTimeout(() => setToast(null), 3800);
      void refreshAll();
    });
    socket.on("payment:request", (payload: { orderId?: number }) => {
      playPaymentRequestSound();
      setToast(`Phục vụ yêu cầu thanh toán đơn #${payload.orderId ?? "?"}`);
      setTimeout(() => setToast(null), 4200);
      void loadPending();
      void loadTables();
    });
    socket.on("order:pending_grace", (p: { orderId?: number; tableId?: number | null; payMode?: "now" | "later" }) => {
      const tableLabel = p.tableId ? `bàn #${p.tableId}` : "đơn mang về";
      const modeLabel = p.payMode === "now" ? " (khách chọn thanh toán ngay)" : "";
      setToast(`Đơn #${p.orderId ?? "?"} mới từ ${tableLabel}${modeLabel}`);
      setTimeout(() => setToast(null), 4200);
      void loadTables();
    });
    socket.on("order:confirmed", (p: { orderId?: number }) => {
      setToast(`Đơn #${p.orderId ?? "?"} đã qua ân hạn, sẵn sàng thanh toán.`);
      setTimeout(() => setToast(null), 4200);
      void refreshAll();
    });
    socket.on("chat:escalate", (p: { message?: string; tableId?: number | null }) => {
      const t = p.tableId ? `Bàn liên quan #${p.tableId}` : "Khách";
      setToast(`${t}: ${(p.message ?? "").slice(0, 80)}`);
      setTimeout(() => setToast(null), 5200);
    });
    socket.on("inventory:request", () => {
      setToast("Có phiếu xin nguyên liệu từ pha chế.");
      setTimeout(() => setToast(null), 3200);
    });
    socket.on("inventory:restock_request", (p: { itemName?: string }) => {
      setToast(`Nhân viên tạo phiếu nhập hàng: ${p.itemName ?? "nguyên liệu"}. Vào Admin → Phiếu xin NL để duyệt.`);
      setTimeout(() => setToast(null), 5000);
    });
    return () => {
      socket.disconnect();
    };
  }, [refreshAll, loadPending, loadTables]);

  async function openShift() {
    const n = Number(startingCash.replace(/\D/g, "")) || 0;
    try {
      await staffApi("/api/shifts/open", {
        method: "POST",
        body: JSON.stringify({ startingCash: n }),
      });
      await loadShift();
      setToast("Đã mở ca.");
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi mở ca");
    }
  }

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };


  async function closeShift() {
    const n = Number(actualCash.replace(/\D/g, ""));
    if (Number.isNaN(n)) {
      setErr("Nhập số tiền mặt thực tế khi đóng ca.");
      return;
    }
    try {
      await staffApi("/api/shifts/close", {
        method: "POST",
        body: JSON.stringify({ actualCash: n }),
      });
      setActualCash("");
      await loadShift();
      setToast("Đã đóng ca.");
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi đóng ca");
    }
  }

  const billPreview = useMemo(() => {
    if (!billModal || !settings) return null;
    const { vatAmount, totalAmount, pointsDiscount } = computeBill(
      billModal.subTotal,
      billModal.discountAmt,
      0,
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const ptsEarn = billModal.customer
      ? computePointsEarned(totalAmount, settings.pointEarnEveryVnd, settings.pointEarnEach)
      : 0;
    return { vatAmount, totalAmount, pointsDiscount, ptsEarn };
  }, [billModal, settings]);

  const preview = useMemo(() => {
    if (!payOrder || !settings) return null;
    const maxPts = payOrder.customer
      ? Math.min(
        payOrder.customer.points,
        Math.floor(Math.max(0, payOrder.subTotal - payOrder.discountAmt) / settings.pointValueVnd),
      )
      : 0;
    const pts = Math.min(pointsToUse, maxPts);
    const { vatAmount, totalAmount, pointsDiscount } = computeBill(
      payOrder.subTotal,
      payOrder.discountAmt,
      pts,
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const display =
      payMethod === "Cash" ? roundCashAmount(totalAmount, settings.cashRoundTo) : totalAmount;
    const cashNum = Number(cashGiven.replace(/\D/g, ""));
    const change = payMethod === "Cash" && !Number.isNaN(cashNum) ? cashNum - display : null;
    const pointsEarned = payOrder.customer
      ? computePointsEarned(display, settings.pointEarnEveryVnd, settings.pointEarnEach)
      : 0;
    return { vatAmount, totalAmount, pointsDiscount, display, change, maxPts, pts, pointsEarned };
  }, [payOrder, settings, payMethod, cashGiven, pointsToUse]);

  async function submitPay() {
    if (!payOrder || !preview) return;
    const body: Record<string, unknown> = {
      orderId: payOrder.id,
      method: payMethod,
      pointsToUse: preview.pts,
    };
    if (payOrder.status !== "Paid" && payMethod === "Cash") {
      const cg = Number(cashGiven.replace(/\D/g, ""));
      if (!cashGiven.trim() || Number.isNaN(cg) || cg <= 0) {
        setErr("Vui lòng nhập số tiền khách đưa.");
        return;
      }
      if (cg < preview.display) {
        setErr(`Tiền khách đưa (${formatVnd(cg)}) chưa đủ, cần ít nhất ${formatVnd(preview.display)}.`);
        return;
      }
      body.cashGiven = cg;
    }
    try {
      setErr(null);
      if (payOrder.status === "Paid") {
        await staffApi("/api/pos/ack-online", { method: "POST", body: JSON.stringify({ orderId: payOrder.id }) });
        const b = await staffApi<BillRecord>(`/api/pos/bills/${payOrder.id}`);
        printHistoryBill(b);
      } else {
        await staffApi("/api/pos/pay", { method: "POST", body: JSON.stringify(body) });
      }
      setPayOrder(null);
      setBillModal(null);
      setBillStep("bill");
      setCashGiven("");
      setPointsToUse(0);
      setPayMethod("Cash");
      await refreshAll();
      setToast(payOrder.status === "Paid" ? "Xác nhận & in bill thành công." : "Thanh toán thành công.");
      setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi thanh toán");
    }
  }

  useEffect(() => {
    if (payOrder && settings) {
      const maxPts = payOrder.customer
        ? Math.min(
          payOrder.customer.points,
          Math.floor(Math.max(0, payOrder.subTotal - payOrder.discountAmt) / settings.pointValueVnd),
        )
        : 0;
      setPointsToUse((p) => Math.min(p, maxPts));
    }
  }, [payOrder, settings]);

  const loadBills = async (date: string) => {
    setBillHistoryLoading(true);
    setBillHistoryErr(null);
    try {
      const data = await staffApi<BillRecord[]>(`/api/pos/bills?date=${date}`);
      setBillHistory(data);
    } catch (e) {
      setBillHistoryErr(e instanceof Error ? e.message : "Lỗi tải lịch sử");
    } finally {
      setBillHistoryLoading(false);
    }
  };

  const payMethodLabel = (m: string | null) => {
    if (!m) return "?";
    if (m === "Cash") return "Tiền mặt";
    if (m === "Transfer_QR") return "Chuyển khoản";
    if (m === "Card") return "Thẻ";
    if (m === "MoMo") return "MoMo";
    return m;
  };

  function printHistoryBill(b: BillRecord) {
    const win = window.open("", "_blank", "width=400,height=620");
    if (!win) return;
    const rows = b.items.map((d) =>
      `<tr>
        <td>${d.name}${d.customNotes ? ` <em style="color:#666;font-size:11px">(${d.customNotes})</em>` : ""}</td>
        <td style="text-align:center">×${d.quantity}</td>
        <td style="text-align:right">${new Intl.NumberFormat("vi-VN").format(d.lineTotal)}&nbsp;đ</td>
      </tr>`
    ).join("");
    win.document.write(`<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"/><title>Bill #${b.id}</title>
<style>@page{size:80mm auto;margin:6mm}*{box-sizing:border-box;margin:0;padding:0;font-family:monospace;font-size:13px;color:#000}body{width:80mm}.wrap{border:1px solid #000;padding:8px}h1{text-align:center;font-size:15px;margin-bottom:2px}.sub{text-align:center;font-size:11px;color:#555;margin-bottom:8px}.info{font-size:12px;margin-bottom:8px;border-bottom:1px dashed #999;padding-bottom:6px}.info div{display:flex;justify-content:space-between;margin-top:2px}table{width:100%;border-collapse:collapse;margin-bottom:8px}thead tr{border-bottom:1px solid #444}th{font-weight:700;padding-bottom:3px}td,th{padding:2px 0;vertical-align:top}th:nth-child(2),td:nth-child(2){text-align:center;width:24px}th:nth-child(3),td:nth-child(3){text-align:right}.totals{border-top:1px solid #444;padding-top:6px;font-size:12px}.totals div{display:flex;justify-content:space-between;margin-top:2px}.grand{font-weight:700;font-size:14px;border-top:1px solid #000;padding-top:4px;margin-top:4px}.footer{text-align:center;font-size:11px;color:#555;margin-top:8px}.reprint{text-align:center;font-size:10px;color:#c00;margin-top:4px;font-weight:bold}</style></head>
<body><div class="wrap">
<h1>TD COFFEE</h1>
<div class="sub">——— HÓA ĐƠN ———<br/>Bill #${b.id}</div>
<div class="info">
  <div><span>Giờ:</span><span>${new Date(b.createdAt).toLocaleString("vi-VN")}</span></div>
  ${b.tableName ? `<div><span>Bàn:</span><span>${b.tableName}</span></div>` : ""}
  ${b.customerName ? `<div><span>Khách:</span><span>${b.customerName}${b.customerPhone ? " · " + b.customerPhone : ""}</span></div>` : ""}
  <div><span>TT:</span><span>${payMethodLabel(b.payMethod)}</span></div>
</div>
<table><thead><tr><th>Món</th><th>SL</th><th>T.tiền</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>Tạm tính:</span><span>${new Intl.NumberFormat("vi-VN").format(b.subTotal)}&nbsp;đ</span></div>
  ${b.discountAmt > 0 ? `<div><span>Giảm giá:</span><span>-${new Intl.NumberFormat("vi-VN").format(b.discountAmt)}&nbsp;đ</span></div>` : ""}
  <div><span>VAT:</span><span>${new Intl.NumberFormat("vi-VN").format(b.vatAmount)}&nbsp;đ</span></div>
  <div class="grand"><span>TỔNG:</span><span>${new Intl.NumberFormat("vi-VN").format(b.totalAmount)}&nbsp;đ</span></div>
</div>
<div class="reprint">[BẢN SAO — Đã thanh toán ${b.paidAt ? new Date(b.paidAt).toLocaleString("vi-VN") : ""}]</div>
<div class="footer">Cảm ơn quý khách! Hẹn gặp lại</div></div>
<script>window.onload=function(){window.print();window.close()}<\/script></body></html>`);
    win.document.close();
  }

  if (!info || (info.role !== "Cashier" && info.role !== "Admin")) {
    return (
      <div className="staff-page-inner">
        <p className="subtle">Cần đăng nhập thu ngân hoặc quản lý.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập nhân sự
        </Link>
      </div>
    );
  }

  return (
    <div className="staff-page-inner staff-page-wide">
      <div className="staff-page-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          Thu ngân (POS)
        </h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link to="/staff/inventory" className="btn btn-ghost staff-btn-light">Kiểm kho</Link>
          <button type="button" className="btn btn-ghost staff-btn-light"
            style={showBillHistory ? { background: "rgba(146,64,14,0.15)", borderColor: "#92400e" } : undefined}
            onClick={() => {
              const next = !showBillHistory;
              setShowBillHistory(next);
              if (next) void loadBills(billDate);
            }}>
            Lịch sử bill
          </button>
          <button type="button" className="btn btn-ghost staff-btn-light" onClick={() => void refreshAll()}>
            Làm mới
          </button>
        </div>
      </div>

      <p className="subtle">Quản lý ca làm việc và xử lý thanh toán tại quầy.</p>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.25rem",
            right: "1.25rem",
            background: "var(--card)",
            border: "1px solid var(--border)",
            padding: "0.75rem 1rem",
            borderRadius: "12px",
            boxShadow: "var(--shadow-lg)",
            zIndex: 50,
            maxWidth: 360,
            fontSize: "0.92rem",
          }}
        >
          {toast}
        </div>
      )}

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <section className="card" style={{ padding: "1rem 1.15rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.65rem" }}>Ca làm việc</h2>
        {shift === undefined ? (
          <p className="subtle">Đang kiểm tra ca…</p>
        ) : shift ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div>
              <span className="subtle">Ca #{shift.id}</span> — mở lúc {new Date(shift.startTime).toLocaleString("vi-VN")}
              <br />
              <span className="subtle">Tiền mặt đầu ca:</span> {formatVnd(shift.startingCash)}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="ac">
                Tiền mặt đếm thực tế khi đóng ca
              </label>
              <input
                id="ac"
                className="input"
                placeholder="VD: 1250000"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                style={{ maxWidth: 200 }}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void closeShift()}>
              Đóng ca
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="sc">
                Tiền mặt đầu ca
              </label>
              <input
                id="sc"
                className="input"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                style={{ maxWidth: 200 }}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void openShift()}>
              Mở ca
            </button>
          </div>
        )}
      </section>

      <PosDeliveryPanel onToast={showToast} />

      <section style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.65rem" }}>Đơn chờ thanh toán</h2>
        {shift === undefined && <p className="subtle">Đang kiểm tra ca…</p>}
        {shift === null && <p className="subtle">Mở ca trước khi thanh toán.</p>}
        {pending.length === 0 && shift != null ? <p className="subtle">Không có đơn Confirmed chưa thu tiền.</p> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {pending.map((o) => (
            <div key={o.id} className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>Đơn #{o.id}</strong>
                  {o.table && (
                    <span style={{ color: "var(--muted)", marginLeft: "0.5rem" }}>
                      {o.table.name}
                    </span>
                  )}
                  {!o.table && (
                    <span style={{ color: "var(--muted)", marginLeft: "0.5rem" }}>Mang về</span>
                  )}
                  {o.status === "Paid" && o.payments && o.payments.length > 0 && o.payments[0].shiftId === null && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", padding: "0.2rem 0.5rem", background: "#16a34a", color: "#fff", borderRadius: "12px", fontWeight: "bold" }}>
                      Đã thanh toán {o.payments[0].method}
                    </span>
                  )}
                  <div style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>
                    {o.customer ? (
                      <>
                        {o.customer.fullName} — {o.customer.points} điểm
                      </>
                    ) : (
                      "Khách vãng lai"
                    )}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                    Giờ vào: {new Date(o.createdAt).toLocaleString("vi-VN")}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                    Tạm tính: {formatVnd(o.subTotal)} (chưa gồm VAT / điểm)
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={shift == null}
                    onClick={() => {
                      setBillModal(o);
                      setBillStep("bill");
                      setPayOrder(null);
                    }}
                  >
                    Xem bill / Thu tiền
                  </button>
                  {o.status !== "Paid" && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ border: "1px solid var(--danger)", color: "var(--danger)", padding: "0.5rem 0.75rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                      onClick={async () => {
                        const reason = window.prompt("Lý do hủy đơn (ví dụ: Hết nguyên liệu, Khách đổi ý,...):");
                        if (reason === null) return;
                        try {
                           await staffApi(`/api/orders/${o.id}/cancel`, {
                             method: "POST",
                             body: JSON.stringify({ cancelReason: reason.trim() || "Nhân viên hủy đơn" })
                           });
                           showToast("Đã hủy đơn thành công.");
                           void refreshAll();
                        } catch(e) {
                           showToast(e instanceof Error ? e.message : "Lỗi hủy đơn");
                        }
                      }}
                    >
                      Hủy đơn
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {tables && (
        <section>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.65rem" }}>Sơ đồ bàn</h2>
          <div className="table-legend" style={{ marginBottom: "0.65rem", flexWrap: "wrap", rowGap: "0.5rem" }}>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-empty" /> Trống
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-occupied" /> Chưa thanh toán
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-paying" /> Gọi tính tiền
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-cleaning" /> Đã thanh toán
            </span>
            <span style={{ margin: "0 0.5rem", color: "var(--muted)" }}>|</span>
            <span className="table-legend-item" style={{ fontSize: "0.8rem" }}>
              Chờ bưng
            </span>
            <span className="table-legend-item" style={{ fontSize: "0.8rem" }}>
              Đang pha
            </span>
            <span className="table-legend-item" style={{ fontSize: "0.8rem" }}>
              Đủ món
            </span>
          </div>

          {/* THAY ĐỔI ZONE */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button 
              className={activeZoneId === "all" ? "btn btn-primary" : "btn btn-ghost staff-btn-light"}
              onClick={() => { setActiveZoneId("all"); localStorage.setItem("staff_selected_zone", "all"); }}
            >
              Tất cả Khu vực
            </button>
            {zones.map(z => (
              <button 
                key={z.id}
                className={activeZoneId === z.id ? "btn btn-primary" : "btn btn-ghost staff-btn-light"}
                onClick={() => { setActiveZoneId(z.id); localStorage.setItem("staff_selected_zone", String(z.id)); }}
              >
                {z.name}
              </button>
            ))}
          </div>

          <div className="table-grid">
            {tables.filter(t => activeZoneId === "all" || (t as any).zoneId === activeZoneId).map((t) => {
              const meta = tableStatusMeta(t.status);
              const o = t.orders[0];
              return (
                <div
                  key={t.id}
                  className={`table-tile ${meta.cls}`}
                  onClick={() => setMenuTableId(t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") setMenuTableId(t.id);
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1 }}>{t.name.replace("Bàn ", "")}</div>
                  {activeZoneId === "all" && (
                    <div style={{ fontSize: "0.72rem", opacity: 0.95, marginTop: "0.25rem" }}>{t.location ?? "Tại quán"}</div>
                  )}
                  {getDrinkBadge(o)}
                  <div style={{ fontSize: "0.74rem", marginTop: "0.35rem", fontWeight: 600 }}>{meta.label}</div>
                  {o && (
                    <div style={{ fontSize: "0.7rem", marginTop: "0.18rem" }}>
                      #{o.id} · {formatVnd(o.totalAmount)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== LỊCH SỬ BILL ===== */}
      {showBillHistory && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, padding: "1rem" }}
          role="presentation" onClick={(e) => e.target === e.currentTarget && setShowBillHistory(false)}>
          <section className="card" style={{ padding: "1rem 1.15rem", width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", margin: 0 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.65rem", marginBottom: "0.85rem" }}>
              <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Lịch sử bill</h2>
              <button type="button" className="btn btn-ghost" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }} onClick={() => setShowBillHistory(false)} aria-label="Đóng"><X size={16} /></button>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
              <input
                type="date"
                className="input"
                style={{ maxWidth: 165, padding: "0.45rem 0.75rem", fontSize: "0.9rem" }}
                value={billDate}
                min={(() => { const d = new Date(); d.setDate(d.getDate() - 19); return d.toISOString().slice(0, 10); })()}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  setBillDate(e.target.value);
                  void loadBills(e.target.value);
                }}
              />
              <button type="button" className="btn btn-ghost staff-btn-light"
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.88rem" }}
                onClick={() => void loadBills(billDate)}>
                Tải lại
              </button>
            </div>

          {billHistoryLoading && <p className="subtle">Đang tải…</p>}
          {billHistoryErr && <p style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{billHistoryErr}</p>}

          {!billHistoryLoading && (
            <>
              {/* Tổng kết ngày */}
              {billHistory.length > 0 && (
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.85rem", padding: "0.65rem 0.85rem", background: "rgba(146,64,14,0.08)", borderRadius: 10, border: "1px solid rgba(146,64,14,0.2)" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Số đơn</div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{billHistory.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Doanh thu</div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--accent)" }}>
                      {formatVnd(billHistory.reduce((s, b) => s + b.totalAmount, 0))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tiền mặt</div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                      {formatVnd(billHistory.filter(b => b.payMethod === "Cash").reduce((s, b) => s + b.totalAmount, 0))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chuyển khoản</div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                      {formatVnd(billHistory.filter(b => ["Transfer_QR", "VNPay", "SePay"].includes(b.payMethod || "")).reduce((s, b) => s + b.totalAmount, 0))}
                    </div>
                  </div>
                </div>
              )}

              {billHistory.length === 0 && !billHistoryErr && (
                <p className="subtle">Không có đơn nào trong ngày này.</p>
              )}

              {/* Danh sách bill */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", maxHeight: 420, overflowY: "auto" }}>
                {billHistory.map((b) => (
                  <div key={b.id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.85rem", background: "#fff", borderRadius: 10, border: "1px solid #e5ddd5", cursor: "pointer", transition: "box-shadow 0.15s" }}
                    onClick={() => setBillDetailModal(b)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setBillDetailModal(b)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.92rem" }}>
                        Bill #{b.id}
                        {b.tableName && <span style={{ fontWeight: 400, color: "#6b5e55", marginLeft: "0.4rem" }}>· {b.tableName}</span>}
                        {!b.tableName && <span style={{ fontWeight: 400, color: "#6b5e55", marginLeft: "0.4rem" }}>· Mang về</span>}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#6b5e55", marginTop: "0.15rem" }}>
                        {new Date(b.createdAt).toLocaleTimeString("vi-VN")}
                        {b.customerName && ` · ${b.customerName}`}
                        {` · ${b.items.length} món`}
                        <div style={{ marginTop: "0.15rem", color: "#8a7e75", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.78rem" }}>
                          {b.items.map(i => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join(", ")}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{formatVnd(b.totalAmount)}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b5e55", marginTop: "0.1rem" }}>{payMethodLabel(b.payMethod)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          </section>
        </div>
      )}

      {/* Modal chi tiết bill lịch sử */}
      {billDetailModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 45, padding: "1rem" }}
          role="presentation" onClick={(e) => e.target === e.currentTarget && setBillDetailModal(null)}>
          <div className="card" style={{ padding: "1.25rem", maxWidth: 440, width: "100%", overflowY: "auto", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Bill #{billDetailModal.id}</h3>
              <button type="button" className="btn btn-ghost" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }} onClick={() => setBillDetailModal(null)} aria-label="Đóng"><X size={16} /></button>
            </div>

            <div style={{ fontSize: "0.85rem", marginBottom: "0.75rem", borderBottom: "1px dashed var(--border)", paddingBottom: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Giờ vào:</span><span>{new Date(billDetailModal.createdAt).toLocaleString("vi-VN")}</span></div>
              {billDetailModal.tableName && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Bàn:</span><span>{billDetailModal.tableName}</span></div>}
              {billDetailModal.customerName && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Khách:</span><span>{billDetailModal.customerName}{billDetailModal.customerPhone ? ` · ${billDetailModal.customerPhone}` : ""}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Thanh toán:</span><span>{payMethodLabel(billDetailModal.payMethod)}</span></div>
              {billDetailModal.paidAt && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Lúc:</span><span>{new Date(billDetailModal.paidAt).toLocaleString("vi-VN")}</span></div>}
            </div>

            <table style={{ width: "100%", fontSize: "0.88rem", borderCollapse: "collapse", marginBottom: "0.65rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", paddingBottom: "0.3rem", fontWeight: 600 }}>Món</th>
                  <th style={{ textAlign: "center", paddingBottom: "0.3rem", fontWeight: 600 }}>SL</th>
                  <th style={{ textAlign: "right", paddingBottom: "0.3rem", fontWeight: 600 }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {billDetailModal.items.map((d) => (
                  <tr key={d.id}>
                    <td style={{ paddingTop: "0.3rem" }}>
                      {d.name}
                      {d.customNotes && <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontStyle: "italic" }}>{d.customNotes}</div>}
                    </td>
                    <td style={{ textAlign: "center", paddingTop: "0.3rem" }}>×{d.quantity}</td>
                    <td style={{ textAlign: "right", paddingTop: "0.3rem" }}>{formatVnd(d.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: "0.9rem", borderTop: "1px solid var(--border)", paddingTop: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Tạm tính:</span><span>{formatVnd(billDetailModal.subTotal)}</span></div>
              {billDetailModal.discountAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Giảm giá:</span><span style={{ color: "var(--success)" }}>-{formatVnd(billDetailModal.discountAmt)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>VAT:</span><span>{formatVnd(billDetailModal.vatAmount)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1rem", marginTop: "0.35rem", paddingTop: "0.35rem", borderTop: "1px solid var(--border)" }}>
                <span>TỔNG:</span><span style={{ color: "var(--accent)" }}>{formatVnd(billDetailModal.totalAmount)}</span>
              </div>
            </div>

            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => printHistoryBill(billDetailModal)}>
                In lại bill
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setBillDetailModal(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {billModal && settings && billPreview && billStep === "bill" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            padding: "1rem",
          }}
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setBillModal(null)}
        >
          <div
            className="card"
            style={{ padding: "1.25rem", maxWidth: 440, width: "100%", overflowY: "auto", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, textAlign: "center", letterSpacing: "0.05em" }}>TD COFFEE</h3>
            <p style={{ textAlign: "center", fontSize: "0.82rem", margin: "-0.25rem 0 0.5rem", color: "var(--muted)" }}>
              ————— HÓA ĐƠN TẠM TÍNH —————
            </p>
            <p style={{ textAlign: "center", fontSize: "0.85rem", margin: "0 0 0.85rem", color: "var(--muted)" }}>
              Bill #{billModal.id}
            </p>

            <div style={{ fontSize: "0.85rem", marginBottom: "0.75rem", borderBottom: "1px dashed var(--border)", paddingBottom: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Giờ vào:</span>
                <span>{new Date(billModal.createdAt).toLocaleString("vi-VN")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Khách:</span>
                <span>
                  {billModal.customer?.fullName ?? "Vãng lai"}
                  {billModal.customer?.phone ? ` · ${billModal.customer.phone}` : ""}
                </span>
              </div>
              {billModal.table && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Bàn:</span>
                  <span>{billModal.table.name}</span>
                </div>
              )}
            </div>

            <table style={{ width: "100%", fontSize: "0.88rem", borderCollapse: "collapse", marginBottom: "0.65rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", paddingBottom: "0.3rem", fontWeight: 600 }}>Món</th>
                  <th style={{ textAlign: "center", paddingBottom: "0.3rem", fontWeight: 600 }}>SL</th>
                  <th style={{ textAlign: "right", paddingBottom: "0.3rem", fontWeight: 600 }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {billModal.details.map((d) => (
                  <tr key={d.id}>
                    <td style={{ paddingTop: "0.3rem" }}>{d.product.name}</td>
                    <td style={{ textAlign: "center", paddingTop: "0.3rem" }}>×{d.quantity}</td>
                    <td style={{ textAlign: "right", paddingTop: "0.3rem" }}>{formatVnd(d.unitPrice * d.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: "0.9rem", borderTop: "1px solid var(--border)", paddingTop: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Tạm tính:</span>
                <span>{formatVnd(billModal.subTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>VAT ({settings.vatRatePercent}%):</span>
                <span>{formatVnd(billPreview.vatAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1rem", marginTop: "0.35rem", paddingTop: "0.35rem", borderTop: "1px solid var(--border)" }}>
                <span>TỔNG PHẢI THU:</span>
                <span>{formatVnd(billPreview.totalAmount)}</span>
              </div>
              {billModal.customer && billPreview.ptsEarn > 0 && (
                <div style={{ marginTop: "0.35rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                  Điểm tích dự kiến: <strong>{billPreview.ptsEarn}</strong>
                </div>
              )}
            </div>

            <p style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.85rem", marginBottom: 0 }}>
              Cảm ơn quý khách! Hẹn gặp lại
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => printBill(billModal, billPreview.vatAmount, billPreview.totalAmount, settings.vatRatePercent)}
              >
                In bill tạm tính
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={shift == null}
                onClick={() => {
                  setPayOrder(billModal);
                  setCashGiven("");
                  setPointsToUse(0);
                  setPayMethod("Cash");
                  setBillStep("pay");
                }}
              >
                Thu tiền
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setBillModal(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}


      {payOrder && settings && preview && billStep === "pay" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            padding: "1rem",
          }}
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && (setPayOrder(null), setBillModal(null), setBillStep("bill"))}
        >
          <div className="card" style={{ padding: "1.25rem", maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Thanh toán đơn #{payOrder.id}</h3>
            <ul style={{ fontSize: "0.9rem", margin: "0 0 0.75rem", paddingLeft: "1.1rem" }}>
              {payOrder.details.map((d) => (
                <li key={d.id}>
                  {d.product.name} × {d.quantity} — {formatVnd(d.unitPrice * d.quantity)}
                </li>
              ))}
            </ul>
            {payOrder.status === "Paid" ? (
              <div style={{ margin: "1.5rem 0", padding: "1rem", backgroundColor: "#ecfdf5", borderRadius: "8px", textAlign: "center", border: "1px solid #047857" }}>
                <strong style={{ color: "#047857", fontSize: "1.1rem" }}>Đã thanh toán {payOrder.payments?.[0]?.method ?? "Online"}</strong>
                <p style={{ margin: "0.5rem 0 0", color: "#065f46" }}>Số tiền: <strong>{formatVnd(preview.totalAmount)}</strong></p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#065f46" }}>Vui lòng nhấn "Xác nhận & In bill" để kết thúc đơn.</p>
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="label">Đổi điểm (tối đa {preview.maxPts})</label>
                  <input
                    type="range"
                    min={0}
                    max={preview.maxPts}
                    value={preview.pts}
                    onChange={(e) => setPointsToUse(Number(e.target.value))}
                  />
                  <span className="subtle" style={{ fontSize: "0.85rem" }}>
                    Dùng {preview.pts} điểm → giảm {formatVnd(preview.pointsDiscount)}
                  </span>
                </div>
                <div style={{ margin: "0.65rem 0", fontSize: "0.92rem" }}>
                  VAT ({settings.vatRatePercent}%): {formatVnd(preview.vatAmount)}
                  <br />
                  <strong>Tổng phải thu: {formatVnd(preview.display)}</strong>
                  {payOrder.customer && preview.pointsEarned > 0 && (
                    <span className="subtle" style={{ display: "block", marginTop: "0.35rem" }}>
                      Dự kiến cộng cho khách: <strong>{preview.pointsEarned}</strong> điểm (theo số tiền thu)
                    </span>
                  )}
                  {payMethod === "Cash" && (
                    <span className="subtle" style={{ display: "block", marginTop: "0.25rem" }}>
                      (Tiền mặt làm tròn bội số {formatVnd(settings.cashRoundTo)})
                    </span>
                  )}
                </div>
                <div className="field">
                  <label className="label" htmlFor="pm">
                    Phương thức
                  </label>
                  <select id="pm" className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="Cash">Tiền mặt</option>
                  </select>
                </div>
                {payMethod === "Cash" && (
                  <div className="field">
                    <label className="label" htmlFor="cg">
                      Khách đưa <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>*</span>
                    </label>
                    <input
                      id="cg"
                      className="input"
                      inputMode="numeric"
                      value={cashGiven}
                      onChange={(e) => {
                        // Chỉ giữ số, rồi format dấu chấm ngàn
                        const raw = e.target.value.replace(/\D/g, "");
                        const formatted = raw ? new Intl.NumberFormat("vi-VN").format(Number(raw)) : "";
                        setCashGiven(formatted);
                      }}
                      placeholder="VD: 100.000"
                    />
                    {/* Gợi ý nhanh */}
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                      {[preview.display, Math.ceil(preview.display / 10000) * 10000, Math.ceil(preview.display / 50000) * 50000, Math.ceil(preview.display / 100000) * 100000]
                        .filter((v, i, arr) => arr.indexOf(v) === i) // unique
                        .map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            className="btn btn-ghost staff-btn-light"
                            style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                            onClick={() => setCashGiven(new Intl.NumberFormat("vi-VN").format(amt))}
                          >
                            {formatVnd(amt)}
                          </button>
                        ))}
                    </div>
                    {preview.change !== null && Number(cashGiven.replace(/\D/g, "")) > 0 && (
                      <span style={{ fontSize: "0.9rem", marginTop: "0.35rem", display: "block", color: preview.change >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {preview.change >= 0 ? `Tiền thừa: ${formatVnd(preview.change)}` : `Còn thiếu: ${formatVnd(Math.abs(preview.change))}`}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary btn-block" onClick={() => void submitPay()}>
                {payOrder.status === "Paid" ? "Xác nhận & In bill" : "Xác nhận thanh toán"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setBillStep("bill");
                  setPayOrder(null);
                }}
              >
                ← Xem lại bill
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPayOrder(null);
                  setBillModal(null);
                  setBillStep("bill");
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
