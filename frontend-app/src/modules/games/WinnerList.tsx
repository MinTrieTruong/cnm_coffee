import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, MessageSquare, Phone, RefreshCw, Search, Settings2 } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole } from "../../lib/staffApi";
import { Badge, Button, Dropdown, ListView, downloadCsv, type Column } from "../../components/erp";
import { useResource } from "../shared";
import { CLAIM_STATUS, PRIZE_KIND_LABEL, PRIZE_KIND_TONE, type PrizeKind, type StoreOpt, type WinnerRow } from "./types";

const PAGE_SIZES = [10, 20, 50];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
}

const fmtTime = (s: string) => new Date(s).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (s: string) => new Date(s).toLocaleDateString("vi-VN");
const claimLabel = (w: WinnerRow) => {
  if (!w.giftClaim) return "";
  const expired = w.giftClaim.status === "WAITING" && new Date(w.giftClaim.expiresAt) < new Date();
  return (expired ? CLAIM_STATUS.EXPIRED : CLAIM_STATUS[w.giftClaim.status])?.label ?? w.giftClaim.status;
};

/** Danh sách trúng thưởng — dùng chung cho mọi mini game (trong trang chiến dịch hoặc trang riêng) */
export function WinnerList({ campaignId, title = "Danh sách trúng thưởng" }: { campaignId?: number; title?: string }) {
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [storeId, setStoreId] = useState("");
  const [kind, setKind] = useState<"" | PrizeKind>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [onlyWon, setOnlyWon] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  const params = new URLSearchParams();
  if (campaignId) params.set("campaignId", String(campaignId));
  if (storeId) params.set("storeId", storeId);
  if (kind) params.set("kind", kind);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (onlyWon) params.set("onlyWon", "1");
  const { data: rows, loading, error, reload } = useResource<WinnerRow[]>(`/api/admin/games/winners?${params}`, []);
  const stores = useResource<StoreOpt[]>(owner ? "/api/stores" : null, []);

  const filtered = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return rows;
    return rows.filter((w) => norm(`${w.customer.fullName} ${w.customer.phone ?? ""} ${w.prizeLabel} ${w.giftClaim?.code ?? ""}`).includes(s));
  }, [rows, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * size, cur * size + size);

  const columns: Column<WinnerRow>[] = [
    {
      key: "player", label: "Người chơi", value: (w) => w.customer.fullName,
      render: (w) => (
        <div className="gm-player">
          {w.customer.avatarUrl ? <img src={mediaUrl(w.customer.avatarUrl)} alt="" /> : <span className="gm-avatar">{initials(w.customer.fullName)}</span>}
          <div>
            <strong>{w.customer.fullName}</strong>
            <div className="o-muted">{w.customer.phone ?? "—"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "contact", label: "Liên hệ", sortable: false,
      render: (w) => w.customer.phone ? (
        <span className="o-row" style={{ gap: 4, flexWrap: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <a className="gm-icon-link" href={`tel:${w.customer.phone}`} title="Gọi điện" aria-label="Gọi điện"><Phone size={14} /></a>
          <a className="gm-icon-link" href={`sms:${w.customer.phone}`} title="Nhắn tin" aria-label="Nhắn tin"><MessageSquare size={14} /></a>
        </span>
      ) : <span className="o-muted">—</span>,
    },
    { key: "time", label: "Thời điểm quay", value: (w) => w.playedAt, render: (w) => <div><div>{fmtTime(w.playedAt)}</div><div className="o-muted">{fmtDay(w.playedAt)}</div></div> },
    { key: "campaign", label: "Chiến dịch", value: (w) => w.campaign.name, optional: true, defaultHidden: !!campaignId },
    { key: "prize", label: "Tên phần thưởng", value: (w) => w.prizeLabel, wrap: true },
    { key: "weight", label: "Tỉ lệ trúng thưởng", value: (w) => w.prizeWeight, numeric: true, render: (w) => `${w.prizeWeight.toLocaleString("vi-VN")}%`, optional: true },
    { key: "remain", label: "Số lượng còn lại", value: (w) => w.remaining ?? -1, numeric: true, render: (w) => (w.remaining == null ? "∞" : w.remaining.toLocaleString("vi-VN")), optional: true },
    { key: "kind", label: "Loại phần thưởng", value: (w) => PRIZE_KIND_LABEL[w.prizeKind], render: (w) => <Badge tone={PRIZE_KIND_TONE[w.prizeKind]}>{PRIZE_KIND_LABEL[w.prizeKind]}</Badge> },
    {
      key: "claim", label: "Trạng thái nhận", value: claimLabel, optional: true,
      render: (w) => {
        if (!w.giftClaim) return <span className="o-muted">—</span>;
        const expired = w.giftClaim.status === "WAITING" && new Date(w.giftClaim.expiresAt) < new Date();
        const st = expired ? CLAIM_STATUS.EXPIRED : CLAIM_STATUS[w.giftClaim.status];
        return <Badge tone={st?.tone ?? "neutral"}>{st?.label ?? w.giftClaim.status}</Badge>;
      },
    },
    { key: "code", label: "Mã nhận quà", value: (w) => w.giftClaim?.code ?? "", optional: true, defaultHidden: true, render: (w) => (w.giftClaim ? <code>{w.giftClaim.code}</code> : <span className="o-muted">—</span>) },
    { key: "store", label: "Chi nhánh", value: (w) => w.store?.name ?? "Online", optional: true },
    {
      key: "img", label: "Hình ảnh phần thưởng", sortable: false, optional: true,
      render: (w) => (w.prizeImage ? <img className="gm-thumb-sm" src={mediaUrl(w.prizeImage)} alt="" /> : <span className="o-muted">—</span>),
    },
  ];

  function exportExcel() {
    downloadCsv(
      `trung-thuong${campaignId ? `-chien-dich-${campaignId}` : ""}-${new Date().toISOString().slice(0, 10)}`,
      ["Người chơi", "SĐT", "Thời điểm quay", "Chiến dịch", "Tên phần thưởng", "Tỉ lệ trúng (%)", "Số lượng còn lại", "Loại phần thưởng", "Trạng thái nhận", "Mã nhận quà", "Chi nhánh", "Hình ảnh phần thưởng"],
      filtered.map((w) => [
        w.customer.fullName, w.customer.phone ?? "", new Date(w.playedAt).toLocaleString("vi-VN"), w.campaign.name, w.prizeLabel, w.prizeWeight,
        w.remaining == null ? "Không giới hạn" : w.remaining, PRIZE_KIND_LABEL[w.prizeKind], claimLabel(w), w.giftClaim?.code ?? "",
        w.store?.name ?? "Online", w.prizeImage ? mediaUrl(w.prizeImage) ?? "" : "",
      ]),
    );
  }

  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <div className="gm-section-head">
        <h3>{title}</h3>
        <Button icon={Download} onClick={exportExcel} disabled={!filtered.length}>Xuất Excel</Button>
      </div>

      <div className="gm-toolbar">
        <div className="gm-search">
          <Search size={15} aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Tìm tên, SĐT, tên giải, mã nhận quà…" aria-label="Tìm kiếm" />
        </div>
        {owner && (
          <select className="o-input" value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(0); }} aria-label="Chi nhánh">
            <option value="">Mọi chi nhánh</option>
            {stores.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select className="o-input" value={kind} onChange={(e) => { setKind(e.target.value as "" | PrizeKind); setPage(0); }} aria-label="Loại giải">
          <option value="">Mọi loại giải</option>
          {(Object.keys(PRIZE_KIND_LABEL) as PrizeKind[]).map((k) => <option key={k} value={k}>{PRIZE_KIND_LABEL[k]}</option>)}
        </select>
        <input type="date" className="o-input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} aria-label="Từ ngày" />
        <input type="date" className="o-input" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} aria-label="Đến ngày" />
        <span style={{ flex: 1 }} />
        <Button variant="link" icon={RefreshCw} onClick={() => void reload()} aria-label="Làm mới" title="Làm mới" />
        <Dropdown align="right" button={({ toggle }) => <Button variant="link" icon={Settings2} onClick={toggle} aria-label="Cài đặt" title="Cài đặt" />}>
          {() => (
            <label className="o-dropdown-item">
              <input type="checkbox" checked={onlyWon} onChange={(e) => { setOnlyWon(e.target.checked); setPage(0); }} />
              Ẩn lượt “Chúc may mắn lần sau”
            </label>
          )}
        </Dropdown>
      </div>

      {error && <div className="o-alert o-alert-danger">{error}</div>}
      <ListView columns={columns} rows={shown} rowKey={(w) => w.id} selectable loading={loading} emptyState={<div className="o-empty">Chưa có lượt chơi nào.</div>} />

      <div className="gm-pager">
        <span className="o-muted">
          {filtered.length ? `${cur * size + 1}-${Math.min(filtered.length, cur * size + size)} trên ${filtered.length} mục` : "0 mục"}
        </span>
        <span style={{ flex: 1 }} />
        <select className="o-input" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} aria-label="Số dòng mỗi trang">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / trang</option>)}
        </select>
        <Button variant="link" icon={ChevronLeft} disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Trang trước" />
        <span>{cur + 1}/{pages}</span>
        <Button variant="link" icon={ChevronRight} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Trang sau" />
      </div>
    </div>
  );
}

/** Trang riêng: CRM › Trúng thưởng (mọi chiến dịch) */
export function WinnersPage() {
  return (
    <div className="o-card" style={{ padding: 16 }}>
      <WinnerList title="Danh sách trúng thưởng — mọi chiến dịch" />
    </div>
  );
}
