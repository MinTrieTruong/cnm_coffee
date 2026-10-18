import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import {
  Badge, Button, EmptyState, Field, FormGroup, FormGroups, FormView, Kpi, RecordList, errMsg, fmtDate, formatVnd,
} from "../../components/erp";
import { useRecordNav, useResource } from "../shared";

type ReviewRow = {
  id: number;
  rating: number;
  comment: string | null;
  adminReply: string | null;
  hidden: boolean;
  createdAt: string;
  customer: { fullName: string; phone: string | null };
  order: { id: number; totalAmount: number };
  replyBy: { fullName: string } | null;
};

const BASE = "/app/sales/reviews";

export function Stars({ n }: { n: number }) {
  return (
    <span className="o-row" style={{ gap: 1, flexWrap: "nowrap", verticalAlign: "middle" }} aria-label={`${n} sao`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={14} aria-hidden fill={s <= n ? "#b45309" : "none"} color={s <= n ? "#b45309" : "#d1d5db"} />
      ))}
    </span>
  );
}

export function ReviewList() {
  const { data: rows, loading, error } = useResource<ReviewRow[]>("/api/admin/reviews", []);
  const go = useRecordNav(BASE);
  const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : null;
  return (
    <RecordList
      crumbs={[{ label: "Đánh giá" }]}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      error={error}
      onOpen={(r) => go.open(r.id)}
      top={
        <div className="o-kpis">
          <Kpi label="Tổng đánh giá" value={rows.length} />
          {avg && <Kpi label="Điểm trung bình" value={avg} tone="warning" />}
          <Kpi label="Đã phản hồi" value={rows.filter((r) => !!r.adminReply).length} tone="success" />
          <Kpi label="Đang ẩn" value={rows.filter((r) => r.hidden).length} />
        </div>
      }
      columns={[
        { key: "date", label: "Ngày", value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
        { key: "rating", label: "Đánh giá", value: (r) => r.rating, render: (r) => <Stars n={r.rating} /> },
        { key: "customer", label: "Khách hàng", value: (r) => r.customer.fullName },
        { key: "comment", label: "Nội dung", value: (r) => r.comment ?? "", wrap: true },
        { key: "order", label: "Đơn", value: (r) => r.order.id, numeric: true, render: (r) => `#${r.order.id}`, optional: true },
        {
          key: "state",
          label: "Trạng thái",
          value: (r) => `${r.adminReply ? "Đã phản hồi" : "Chưa phản hồi"}${r.hidden ? ", ẩn" : ""}`,
          render: (r) => (
            <span className="o-row" style={{ gap: 4 }}>
              {r.adminReply ? <Badge tone="success">Đã phản hồi</Badge> : <Badge tone="warning">Chưa phản hồi</Badge>}
              {r.hidden && <Badge tone="danger">Đang ẩn</Badge>}
            </span>
          ),
        },
      ]}
      searchText={(r) => `${r.customer.fullName} ${r.comment ?? ""}`}
      filters={[5, 4, 3, 2, 1].map((s) => ({ id: `s${s}`, label: `${s} sao`, test: (r: ReviewRow) => r.rating === s }))}
      groupBys={[
        { id: "rating", label: "Số sao", key: (r) => `${r.rating} sao` },
        { id: "reply", label: "Phản hồi", key: (r) => (r.adminReply ? "Đã phản hồi" : "Chưa phản hồi") },
      ]}
      exportName="danh-gia"
      emptyState={<EmptyState icon={Star} title="Chưa có đánh giá nào" />}
    />
  );
}

export function ReviewForm({ recordId }: { recordId?: string }) {
  const list = useResource<ReviewRow[]>("/api/admin/reviews", []);
  const r = list.data.find((x) => String(x.id) === recordId) ?? null;
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setReply(r?.adminReply ?? ""), [r?.id, r?.adminReply]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(body: object) {
    if (!r) return;
    setBusy(true);
    setErr(null);
    try {
      await staffApi(`/api/admin/reviews/${r.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await list.reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!r) {
    return (
      <FormView crumbs={[{ label: "Đánh giá", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy đánh giá."}</div>
      </FormView>
    );
  }
  return (
    <FormView
      crumbs={[{ label: "Đánh giá", to: BASE }, { label: `${r.customer.fullName} — ${fmtDate(r.createdAt)}` }]}
      editing={false}
      canEdit={false}
      error={err}
      actions={
        <Button onClick={() => void patch({ hidden: !r.hidden })} disabled={busy}>
          {r.hidden ? "Hiện trên trang công khai" : "Ẩn khỏi trang công khai"}
        </Button>
      }
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <h1>{r.customer.fullName}</h1>
          <div className="o-sheet-sub"><Stars n={r.rating} /> · {fmtDate(r.createdAt)}</div>
        </div>
        <span className="o-row" style={{ gap: 4 }}>
          {r.hidden && <Badge tone="danger">Đang ẩn</Badge>}
          {r.adminReply && <Badge tone="success">Đã phản hồi</Badge>}
        </span>
      </div>
      <FormGroups>
        <FormGroup>
          <Field label="SĐT">{r.customer.phone ?? <span className="o-muted">—</span>}</Field>
          <Field label="Đơn hàng">#{r.order.id} · {formatVnd(r.order.totalAmount)}</Field>
        </FormGroup>
        <FormGroup>
          <Field label="Người phản hồi">{r.replyBy?.fullName ?? <span className="o-muted">—</span>}</Field>
        </FormGroup>
      </FormGroups>
      <Field label="Nội dung" full>
        <div style={{ borderLeft: "3px solid var(--o-border)", paddingLeft: 10, whiteSpace: "pre-wrap" }}>
          {r.comment ?? <span className="o-muted">Không có nội dung.</span>}
        </div>
      </Field>
      <div className="o-group-title" style={{ marginTop: 16 }}>Phản hồi hiển thị trên web</div>
      <textarea className="o-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Cảm ơn bạn đã ghé TD Coffee…" />
      <div className="o-row" style={{ marginTop: 8 }}>
        <Button variant="primary" onClick={() => void patch({ adminReply: reply.trim() || null })} disabled={busy}>
          {r.adminReply ? "Cập nhật phản hồi" : "Lưu phản hồi"}
        </Button>
        {r.adminReply && (
          <Button variant="danger" onClick={() => void patch({ adminReply: null })} disabled={busy}>Xóa phản hồi</Button>
        )}
      </div>
    </FormView>
  );
}
