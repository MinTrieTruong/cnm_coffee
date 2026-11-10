import { useState } from "react";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { activeStoreId, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, EmptyState, Field, ListView, Modal, errMsg, fmtDateTime, fmtQty, type Tone } from "../../components/erp";
import { useResource } from "../shared";

type Transfer = {
  id: number;
  code: string;
  status: "PENDING" | "SHIPPED" | "RECEIVED" | "CANCELLED";
  note: string | null;
  createdAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  fromStoreId: number;
  toStoreId: number;
  fromStore: { id: number; name: string };
  toStore: { id: number; name: string };
  createdBy: { fullName: string };
  receivedBy: { fullName: string } | null;
  items: { id: number; itemId: number; qty: number; receivedQty: number | null; item: { name: string; unit: string | null } }[];
};
type StoreOpt = { id: number; name: string };
type InvItem = { id: number; name: string; unit: string | null; stockQty: number };

const STATUS: Record<Transfer["status"], { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ xuất", tone: "warning" },
  SHIPPED: { label: "Đang chuyển", tone: "info" },
  RECEIVED: { label: "Đã nhận", tone: "success" },
  CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};

/** Kho › Chuyển kho giữa các chi nhánh */
export function TransferList() {
  const sid = activeStoreId();
  const list = useResource<Transfer[]>("/api/admin/stock-transfers", []);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Transfer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(t: Transfer, action: "ship" | "cancel") {
    const ask = action === "ship" ? `Xuất kho phiếu ${t.code}? Tồn kho chi nhánh sẽ bị trừ.` : `Huỷ phiếu ${t.code}?`;
    if (!window.confirm(ask)) return;
    try {
      await staffApi(`/api/admin/stock-transfers/${t.id}/${action}`, { method: "POST" });
      setErr(null);
      await list.reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Chuyển kho" }]}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)} disabled={sid == null} title={sid == null ? "Chọn chi nhánh gửi trước" : undefined}>
            Tạo phiếu
          </Button>
        }
      />
      <div className="o-content o-stack">
        {sid == null && <Alert tone="info">Đang xem tất cả chi nhánh. Chọn một chi nhánh để tạo, xuất hoặc nhận phiếu.</Alert>}
        {(err || list.error) && <Alert>{err ?? list.error}</Alert>}
        <ListView
          rows={list.data}
          rowKey={(t) => t.id}
          loading={list.loading}
          exportName="chuyen-kho"
          emptyState={<EmptyState icon={ArrowRightLeft} title="Chưa có phiếu chuyển kho" />}
          columns={[
            { key: "code", label: "Mã phiếu", value: (t) => t.code },
            { key: "from", label: "Từ", value: (t) => t.fromStore.name },
            { key: "to", label: "Đến", value: (t) => t.toStore.name },
            {
              key: "items",
              label: "Nguyên liệu",
              wrap: true,
              value: (t) =>
                t.items
                  .map((i) => `${i.item.name} ×${i.qty}${i.receivedQty != null && i.receivedQty !== i.qty ? ` (nhận ${i.receivedQty})` : ""}`)
                  .join("; "),
            },
            { key: "status", label: "Trạng thái", value: (t) => STATUS[t.status].label, render: (t) => <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge> },
            { key: "by", label: "Người tạo", value: (t) => t.createdBy.fullName, optional: true },
            { key: "at", label: "Ngày tạo", value: (t) => t.createdAt, render: (t) => fmtDateTime(t.createdAt), optional: true },
            {
              key: "act",
              label: "",
              sortable: false,
              render: (t) => (
                <span className="o-row" style={{ gap: 4, justifyContent: "flex-end" }}>
                  {t.status === "PENDING" && t.fromStoreId === sid && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => void act(t, "ship")}>Xuất kho</Button>
                      <Button size="sm" icon={Trash2} onClick={() => void act(t, "cancel")}>Huỷ</Button>
                    </>
                  )}
                  {t.status === "SHIPPED" && t.toStoreId === sid && (
                    <Button size="sm" variant="primary" onClick={() => setReceiving(t)}>Nhận hàng</Button>
                  )}
                </span>
              ),
            },
          ]}
        />
      </div>
      {creating && sid != null && (
        <CreateTransfer
          fromStoreId={sid}
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false);
            await list.reload();
          }}
        />
      )}
      {receiving && (
        <ReceiveTransfer
          t={receiving}
          onClose={() => setReceiving(null)}
          onDone={async () => {
            setReceiving(null);
            await list.reload();
          }}
        />
      )}
    </div>
  );
}

function CreateTransfer({ fromStoreId, onClose, onDone }: { fromStoreId: number; onClose: () => void; onDone: () => Promise<void> }) {
  const stores = useResource<StoreOpt[]>("/api/stores", []);
  const inv = useResource<InvItem[]>("/api/admin/inventory", []);
  const [toStoreId, setTo] = useState<number | "">("");
  const [lines, setLines] = useState<{ itemId: number | ""; qty: string }[]>([{ itemId: "", qty: "" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const targets = stores.data.filter((s) => s.id !== fromStoreId);
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit() {
    const items = lines.filter((l) => l.itemId && Number(l.qty) > 0).map((l) => ({ itemId: Number(l.itemId), qty: Number(l.qty) }));
    if (!toStoreId) return setErr("Chọn chi nhánh nhận");
    if (!items.length) return setErr("Thêm ít nhất 1 nguyên liệu với số lượng > 0");
    setBusy(true);
    try {
      await staffApi("/api/admin/stock-transfers", { method: "POST", body: JSON.stringify({ toStoreId, items, note }) });
      await onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Tạo phiếu chuyển kho"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>Tạo phiếu</Button>
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Field label="Chi nhánh nhận">
        <select className="o-input" value={toStoreId} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Chọn chi nhánh…</option>
          {targets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      {lines.map((l, i) => {
        const item = inv.data.find((x) => x.id === l.itemId);
        return (
          <div key={i} className="o-row" style={{ flexWrap: "nowrap", alignItems: "flex-end", gap: 8 }}>
            <Field label={i === 0 ? "Nguyên liệu" : ""}>
              <select className="o-input" value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value ? Number(e.target.value) : "" })}>
                <option value="">Chọn…</option>
                {inv.data.map((x) => <option key={x.id} value={x.id}>{x.name} (tồn {fmtQty(x.stockQty)} {x.unit ?? ""})</option>)}
              </select>
            </Field>
            <Field label={i === 0 ? `Số lượng${item?.unit ? ` (${item.unit})` : ""}` : ""}>
              <input className="o-input" type="number" min="1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} style={{ width: 100 }} />
            </Field>
            {lines.length > 1 && (
              <Button icon={Trash2} aria-label="Bỏ dòng" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
            )}
          </div>
        );
      })}
      <Button variant="link" icon={Plus} onClick={() => setLines((ls) => [...ls, { itemId: "", qty: "" }])}>Thêm nguyên liệu</Button>
      <Field label="Ghi chú">
        <input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function ReceiveTransfer({ t, onClose, onDone }: { t: Transfer; onClose: () => void; onDone: () => Promise<void> }) {
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(t.items.map((i) => [i.itemId, String(i.qty)])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const received = Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
    setBusy(true);
    try {
      await staffApi(`/api/admin/stock-transfers/${t.id}/receive`, { method: "POST", body: JSON.stringify({ received }) });
      await onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Nhận hàng — ${t.code}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>Xác nhận nhận hàng</Button>
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <p className="o-muted" style={{ marginTop: 0 }}>Từ {t.fromStore.name}. Nhập số thực nhận nếu có hao hụt.</p>
      {t.items.map((i) => (
        <Field key={i.id} label={`${i.item.name} — gửi ${i.qty} ${i.item.unit ?? ""}`}>
          <input
            className="o-input"
            type="number"
            min="0"
            max={i.qty}
            value={qty[i.itemId] ?? ""}
            onChange={(e) => setQty((q) => ({ ...q, [i.itemId]: e.target.value }))}
          />
        </Field>
      ))}
    </Modal>
  );
}
