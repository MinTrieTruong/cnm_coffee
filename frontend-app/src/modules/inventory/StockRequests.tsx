import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PackageSearch, Plus } from "lucide-react";
import { activeStoreId, staffApi, staffSocket } from "../../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, EmptyState, Field, Modal, errMsg, fmtDateTime, fmtQty } from "../../components/erp";
import { useResource } from "../shared";

type StockRequestRow = {
  id: number;
  qty: number;
  note: string | null;
  status: "OPEN" | "ACCEPTED" | "CANCELLED";
  createdAt: string;
  acceptedAt: string | null;
  mine: boolean;
  myStockQty: number | null;
  store: { id: number; name: string };
  acceptedStore: { id: number; name: string } | null;
  item: { id: number; name: string; unit: string | null };
  createdBy: { fullName: string };
  acceptedBy: { fullName: string } | null;
  transfer: { id: number; code: string; status: string } | null;
};
type InvRow = { id: number; name: string; unit: string | null; stockQty: number; minLevel: number };

const unit = (r: { item: { unit: string | null } }) => r.item.unit ?? "";

/** Kho › Cần hàng gấp — nhờ chi nhánh khác còn hàng chuyển qua khi chưa kịp đặt nhà cung cấp */
export function StockRequests() {
  const { data: rows, loading, error, reload } = useResource<StockRequestRow[]>("/api/stock-requests", []);
  const [create, setCreate] = useState(false);
  const [give, setGive] = useState<StockRequestRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const needStore = activeStoreId() == null;

  useEffect(() => {
    const socket = staffSocket();
    socket.emit("join", "admin_room");
    ["stock-request:new", "stock-request:accepted", "stock-request:closed"].forEach((ev) => socket.on(ev, () => void reload()));
    return () => { socket.disconnect(); };
  }, [reload]);

  const others = rows.filter((r) => !r.mine && r.status === "OPEN");
  const mine = rows.filter((r) => r.mine);

  async function cancel(r: StockRequestRow) {
    if (!confirm(`Huỷ yêu cầu ${r.qty} ${unit(r)} ${r.item.name}?`)) return;
    try {
      await staffApi(`/api/stock-requests/${r.id}/cancel`, { method: "POST" });
      await reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Cần hàng gấp" }]}
        actions={!needStore && <Button variant="primary" icon={Plus} onClick={() => setCreate(true)}>Cần hàng gấp</Button>}
      />
      <div className="o-content o-stack" style={{ maxWidth: 1000, margin: "0 auto" }}>
        {needStore && <Alert tone="info">Chọn một chi nhánh để đăng hoặc nhận yêu cầu hàng gấp.</Alert>}
        <p className="o-muted" style={{ margin: 0 }}>
          Sắp hết mà chưa kịp đặt nhà cung cấp? Đăng yêu cầu — chi nhánh khác còn hàng bấm "Chuyển giúp", hàng được xuất ngay và hiện ở mục Chuyển kho để bạn xác nhận khi nhận.
        </p>
        {(error || err) && <Alert>{error ?? err}</Alert>}
        {msg && <Alert tone="info">{msg}</Alert>}
        {loading && <p className="o-muted">Đang tải…</p>}

        <section className="o-card">
          <div className="o-card-head"><h3>Chi nhánh khác đang cần ({others.length})</h3></div>
          {others.length === 0 ? (
            <p className="o-muted o-card-note" style={{ paddingTop: 12 }}>Không có chi nhánh nào đang cần hàng gấp.</p>
          ) : (
            others.map((r) => {
              const canGive = (r.myStockQty ?? 0) >= 1;
              return (
                <div key={r.id} className="o-req">
                  <div className="o-req-main">
                    <strong>{r.store.name} cần {fmtQty(r.qty)} {unit(r)} {r.item.name}</strong>
                    <div className="o-muted">{r.createdBy.fullName} · {fmtDateTime(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</div>
                    {r.myStockQty != null && (
                      <div style={{ color: canGive ? "var(--o-success)" : "var(--o-muted)" }}>Chi nhánh bạn còn {fmtQty(r.myStockQty)} {unit(r)}</div>
                    )}
                  </div>
                  <Button variant="primary" size="sm" disabled={!canGive || needStore} onClick={() => setGive(r)}>Chuyển giúp</Button>
                </div>
              );
            })
          )}
        </section>

        <section className="o-card">
          <div className="o-card-head"><h3>Yêu cầu của chi nhánh mình</h3></div>
          {mine.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Chưa có yêu cầu nào" />
          ) : (
            mine.map((r) => (
              <div key={r.id} className="o-req">
                <div className="o-req-main">
                  <strong>{fmtQty(r.qty)} {unit(r)} {r.item.name}</strong>
                  <div className="o-muted">{r.createdBy.fullName} · {fmtDateTime(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</div>
                  {r.status === "ACCEPTED" && r.acceptedStore && (
                    <div>
                      {r.acceptedStore.name} ({r.acceptedBy?.fullName}) đã xuất hàng — phiếu {r.transfer?.code}.{" "}
                      {r.transfer?.status === "RECEIVED" ? "Đã nhận đủ." : <Link to="/app/inventory/transfers">Xác nhận nhận hàng</Link>}
                    </div>
                  )}
                </div>
                <span className="o-inline">
                  {r.status === "OPEN" && <Badge tone="warning">Đang chờ chi nhánh khác</Badge>}
                  {r.status === "ACCEPTED" && <Badge tone={r.transfer?.status === "RECEIVED" ? "success" : "info"}>{r.transfer?.status === "RECEIVED" ? "Đã nhận hàng" : "Đang chuyển tới"}</Badge>}
                  {r.status === "CANCELLED" && <Badge>Đã huỷ</Badge>}
                  {r.status === "OPEN" && <Button size="sm" variant="link" onClick={() => void cancel(r)}>Huỷ</Button>}
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      {create && <CreateModal onClose={() => setCreate(false)} onDone={() => { setCreate(false); setMsg("Đã báo các chi nhánh khác."); void reload(); }} />}
      {give && (
        <GiveModal
          r={give}
          onClose={() => setGive(null)}
          onDone={(code) => { setGive(null); setMsg(`Đã xuất hàng cho ${give.store.name} (phiếu ${code}). Tồn kho chi nhánh bạn đã được trừ.`); void reload(); }}
        />
      )}
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const inv = useResource<InvRow[]>("/api/admin/inventory", []);
  const [v, setV] = useState({ itemId: "", qty: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sắp hết lên đầu
  const items = [...inv.data].sort((a, b) => Number(b.stockQty <= b.minLevel) - Number(a.stockQty <= a.minLevel) || a.name.localeCompare(b.name));

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await staffApi("/api/stock-requests", { method: "POST", body: JSON.stringify({ itemId: Number(v.itemId), qty: Number(v.qty), note: v.note }) });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Cần hàng gấp"
      onClose={onClose}
      size="sm"
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={busy || !v.itemId || !(Number(v.qty) > 0)} onClick={() => void send()}>Báo các chi nhánh</Button></>}
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <Field label="Nguyên liệu" required>
          <select className="o-input" value={v.itemId} onChange={(e) => setV({ ...v, itemId: e.target.value })}>
            <option value="">Chọn…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.stockQty <= i.minLevel ? "⚠ " : ""}{i.name} — còn {fmtQty(i.stockQty)} {i.unit ?? ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cần bao nhiêu" required>
          <input className="o-input o-input-num" type="number" min={1} step={1} value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} />
        </Field>
        <Field label="Ghi chú">
          <input className="o-input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="VD: NCC giao trễ 2 ngày" />
        </Field>
      </div>
    </Modal>
  );
}

function GiveModal({ r, onClose, onDone }: { r: StockRequestRow; onClose: () => void; onDone: (code: string) => void }) {
  const max = Math.floor(r.myStockQty ?? 0);
  const [qty, setQty] = useState(String(Math.min(r.qty, max)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await staffApi<{ transfer: { code: string } | null }>(`/api/stock-requests/${r.id}/accept`, { method: "POST", body: JSON.stringify({ qty: Number(qty) }) });
      onDone(res.transfer?.code ?? "");
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Chuyển giúp ${r.store.name}`}
      onClose={onClose}
      size="sm"
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={busy || !(Number(qty) >= 1) || Number(qty) > max} onClick={() => void send()}>Xuất hàng</Button></>}
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <p style={{ margin: 0 }}>{r.store.name} cần <strong>{fmtQty(r.qty)} {unit(r)} {r.item.name}</strong>. Chi nhánh bạn còn {fmtQty(r.myStockQty)} {unit(r)}.</p>
        <Field label={`Số lượng chuyển (tối đa ${max})`}>
          <input className="o-input o-input-num" type="number" min={1} max={max} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <p className="o-muted" style={{ margin: 0 }}>Bấm "Xuất hàng" là trừ tồn kho chi nhánh bạn ngay. Chi nhánh kia xác nhận khi nhận được hàng.</p>
      </div>
    </Modal>
  );
}
