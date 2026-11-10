import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SearchX, Sparkles } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Kpi, Modal, RecordList, errMsg, fmtDateTime, type Tone } from "../../components/erp";
import { useResource } from "../shared";
import { MenuDraftModal, useMenuDraftEnabled } from "./MenuDraft";

export type TermStatus = "AVAILABLE" | "NOT_SOLD_HERE" | "MISSING";

export type TermRow = {
  term: string;
  display: string;
  variants: { text: string; count: number }[];
  searches: number;
  searchers: number;
  rate: number;
  zeroSearches: number;
  zeroSearchers: number;
  zeroRate: number;
  prevSearchers: number;
  lastAt: string;
  status: TermStatus;
  products: { id: number; name: string }[];
  notSoldStores: { id: number; name: string }[];
  typoOf: { id: number; name: string } | null;
  dismissed: boolean;
  suggested: boolean;
  topStoreId: number | null;
  proposal: { id: number; status: string } | null;
};

export type Insights = {
  days: number;
  storeId: number | null;
  thresholds: { minCustomers: number; minPercent: number };
  summary: { searches: number; searchers: number; zeroSearches: number; zeroSearchers: number; zeroRate: number; prevSearchers: number };
  terms: TermRow[];
};

export const TERM_STATUS: Record<TermStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Có món", tone: "success" },
  NOT_SOLD_HERE: { label: "Chi nhánh chưa bán", tone: "warning" },
  MISSING: { label: "Quán chưa có", tone: "danger" },
};

const PERIODS = [7, 30, 90] as const;
const pct = (n: number) => `${n.toLocaleString("vi-VN")}%`;

/** Xu hướng số khách so với kỳ trước cùng độ dài */
export function trend(now: number, prev: number) {
  if (!prev) return now ? { text: "mới", tone: "info" as Tone } : { text: "—", tone: "neutral" as Tone };
  const d = Math.round(((now - prev) / prev) * 100);
  return { text: `${d > 0 ? "↑ +" : d < 0 ? "↓ " : ""}${d}%`, tone: (d > 0 ? "warning" : "neutral") as Tone };
}

export function useInsights(days: number | null) {
  return useResource<Insights | null>(`/api/search-insights${days ? `?days=${days}` : ""}`, null);
}

async function dismiss(term: string, undo = false) {
  await staffApi("/api/search-insights/dismiss", { method: "POST", body: JSON.stringify({ term, undo }) });
}

/** Bán hàng › Khách tìm kiếm — mọi từ khóa khách tìm gần đây: số lượt, số khách, tỷ lệ, tình trạng món */
export function SearchInsights() {
  const [days, setDays] = useState<number | null>(null);
  const { data, loading, error, reload } = useInsights(days);
  const [open, setOpen] = useState<TermRow | null>(null);
  const [drafting, setDrafting] = useState<TermRow | null>(null);
  const aiOn = useMenuDraftEnabled();
  const s = data?.summary;
  const period = data?.days ?? days ?? 30;
  return (
    <>
      <RecordList
        crumbs={[{ label: "Khách tìm kiếm" }]}
        rows={data?.terms ?? []}
        rowKey={(t) => t.term}
        loading={loading}
        error={error}
        onOpen={setOpen}
        actions={
          <select className="o-input" style={{ width: "auto" }} value={period} onChange={(e) => setDays(Number(e.target.value))} aria-label="Khoảng thời gian">
            {PERIODS.map((d) => <option key={d} value={d}>{d} ngày gần nhất</option>)}
          </select>
        }
        top={s && (
          <div className="o-kpis">
            <Kpi label="Lượt tìm" value={s.searches.toLocaleString("vi-VN")} />
            <Kpi label={`Khách dùng ô tìm kiếm (kỳ trước ${s.prevSearchers})`} value={s.searchers.toLocaleString("vi-VN")} />
            <Kpi label="Khách tìm mà không ra món" value={`${s.zeroSearchers} · ${pct(s.zeroRate)}`} tone="warning" />
            <Kpi label={`Gợi ý món mới (≥ ${data!.thresholds.minCustomers} khách, ≥ ${pct(data!.thresholds.minPercent)})`} value={data!.terms.filter((t) => t.suggested).length} tone="danger" />
          </div>
        )}
        columns={[
          { key: "term", label: "Từ khóa", value: (t) => t.display, render: (t) => <strong style={{ fontWeight: 500 }}>{t.display}</strong> },
          { key: "searches", label: "Lượt", value: (t) => t.searches, numeric: true },
          { key: "searchers", label: "Khách", value: (t) => t.searchers, numeric: true },
          { key: "rate", label: "% khách tìm", value: (t) => t.rate, numeric: true, render: (t) => pct(t.rate) },
          { key: "zero", label: "Không ra món", value: (t) => t.zeroRate, numeric: true, render: (t) => (t.zeroSearchers ? `${t.zeroSearchers} khách · ${pct(t.zeroRate)}` : "—") },
          { key: "trend", label: "So kỳ trước", value: (t) => t.searchers - t.prevSearchers, render: (t) => { const x = trend(t.searchers, t.prevSearchers); return <Badge tone={x.tone}>{x.text}</Badge>; }, optional: true },
          { key: "status", label: "Tình trạng", value: (t) => TERM_STATUS[t.status].label, render: (t) => <TermBadges t={t} /> },
          { key: "last", label: "Tìm gần nhất", value: (t) => t.lastAt, render: (t) => fmtDateTime(t.lastAt), optional: true },
          // Từ khóa quán chưa có món → AI phác thảo ngay từ danh sách (tắt MENU_DRAFT thì ẩn)
          ...(aiOn
            ? [{
                key: "ai", label: "", value: () => "",
                render: (t: TermRow) => (t.status === "MISSING" && !t.proposal && !t.dismissed ? (
                  <span onClick={(e) => e.stopPropagation()}><Button size="sm" icon={Sparkles} onClick={() => setDrafting(t)}>AI phác thảo</Button></span>
                ) : null),
              }]
            : []),
        ]}
        searchText={(t) => `${t.term} ${t.variants.map((v) => v.text).join(" ")}`}
        filters={[
          { id: "suggested", label: "Gợi ý món mới", test: (t) => t.suggested },
          { id: "MISSING", label: "Quán chưa có", test: (t) => t.status === "MISSING" && !t.dismissed },
          { id: "NOT_SOLD_HERE", label: "Chi nhánh chưa bán", test: (t) => t.status === "NOT_SOLD_HERE" },
          { id: "AVAILABLE", label: "Có món", test: (t) => t.status === "AVAILABLE" },
          { id: "dismissed", label: "Đã bỏ qua", test: (t) => t.dismissed },
        ]}
        groupBys={[{ id: "status", label: "Tình trạng", key: (t) => TERM_STATUS[t.status].label }]}
        exportName="khach-tim-kiem"
        emptyState={<EmptyState icon={Search} title="Chưa có lượt tìm kiếm nào" hint="Số liệu ghi lại khi khách tìm món trên thực đơn online." />}
      />
      {open && <TermModal t={open} days={period} total={s?.searchers ?? 0} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void reload(); }} />}
      {drafting && <MenuDraftModal seed={draftSeed(drafting)} onClose={() => setDrafting(null)} onDone={() => { setDrafting(null); void reload(); }} />}
    </>
  );
}

function TermBadges({ t }: { t: TermRow }) {
  return (
    <span className="o-inline">
      <Badge tone={TERM_STATUS[t.status].tone}>{TERM_STATUS[t.status].label}</Badge>
      {t.suggested && <Badge tone="info">Gợi ý món mới</Badge>}
      {t.dismissed && <Badge>Đã bỏ qua</Badge>}
      {t.proposal && <Badge tone="info">Đã đề xuất</Badge>}
    </span>
  );
}

/** Từ khóa → đầu vào AI phác thảo (Chủ chuỗi xem toàn chuỗi: tồn kho theo chi nhánh có nhiều khách tìm nhất) */
const draftSeed = (t: TermRow) => ({ term: t.term, display: t.display, searchers: t.zeroSearchers, storeId: t.topStoreId });

/** Chi tiết từ khóa: cách gõ, món khớp, chi nhánh chưa bán, tạo đề xuất / bỏ qua */
export function TermModal({ t, days, total, onClose, onChanged }: { t: TermRow; days: number; total: number; onClose: () => void; onChanged: () => void }) {
  const [proposing, setProposing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const aiOn = useMenuDraftEnabled();
  async function toggleDismiss() {
    try {
      await dismiss(t.term, t.dismissed);
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  if (drafting) return <MenuDraftModal seed={draftSeed(t)} onClose={() => setDrafting(false)} onDone={onChanged} />;
  if (proposing) return <ProposeFromSearch t={t} days={days} onClose={() => setProposing(false)} onDone={onChanged} />;
  return (
    <Modal
      title={`Từ khóa "${t.display}"`}
      onClose={onClose}
      footer={
        <>
          {t.status === "MISSING" && <Button onClick={() => void toggleDismiss()}>{t.dismissed ? "Huỷ bỏ qua" : "Bỏ qua (không liên quan)"}</Button>}
          {t.status === "MISSING" && !t.proposal && aiOn && <Button icon={Sparkles} onClick={() => setDrafting(true)}>AI phác thảo</Button>}
          {t.status === "MISSING" && !t.proposal && <Button variant="primary" onClick={() => setProposing(true)}>Tạo đề xuất món</Button>}
          {t.proposal && <Button onClick={() => nav("/app/sales/proposals")}>Xem đề xuất</Button>}
        </>
      }
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <TermBadges t={t} />
        <div>
          Trong {days} ngày: <b>{t.searchers}</b> / {total} khách đã tìm ({pct(t.rate)}), {t.searches} lượt.
          {t.zeroSearchers > 0 && <> Trong đó <b>{t.zeroSearchers} khách</b> không tìm ra món ({pct(t.zeroRate)} khách dùng ô tìm kiếm).</>}
        </div>
        <div className="o-muted">Kỳ trước: {t.prevSearchers} khách · tìm gần nhất {fmtDateTime(t.lastAt)}</div>
        <Field label="Khách đã gõ">
          <div>{t.variants.map((v) => `"${v.text}" ×${v.count}`).join(", ")}</div>
        </Field>
        {t.products.length > 0 && <Field label="Món khớp trong thực đơn"><div>{t.products.map((p) => p.name).join(", ")}</div></Field>}
        {t.notSoldStores.length > 0 && (
          <Alert tone="warning">Chuỗi đã có món này nhưng {t.notSoldStores.map((s) => s.name).join(", ")} đang tắt hoặc báo hết — cân nhắc bật bán.</Alert>
        )}
        {t.typoOf && <Alert tone="info">Gần giống món đang có: <b>{t.typoOf.name}</b> — có thể khách gõ sai tên.</Alert>}
      </div>
    </Modal>
  );
}

/** Form đề xuất món điền sẵn từ từ khóa khách tìm (chưa cần công thức) */
function ProposeFromSearch({ t, days, onClose, onDone }: { t: TermRow; days: number; onClose: () => void; onDone: () => void }) {
  const cap = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const [name, setName] = useState(cap(t.display));
  const [description, setDescription] = useState(
    `Từ tìm kiếm của khách: ${t.zeroSearchers} khách tìm "${t.display}" mà quán chưa có (${pct(t.zeroRate)} khách dùng ô tìm kiếm, ${days} ngày).` +
      (t.variants.length > 1 ? `\nCách gõ: ${t.variants.map((v) => v.text).join(", ")}.` : ""),
  );
  const [recipe, setRecipe] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const owner = isOwnerRole(getStaffInfo()?.role);
  async function submit() {
    setBusy(true);
    try {
      await staffApi("/api/menu-proposals", {
        method: "POST",
        body: JSON.stringify({
          name, description, recipe, searchTerm: t.term,
          suggestedPrice: price ? Number(price.replace(/\D/g, "")) : undefined,
          // Chủ chuỗi xem toàn chuỗi: gắn đề xuất cho chi nhánh có nhiều khách tìm nhất
          storeId: owner ? t.topStoreId ?? undefined : undefined,
        }),
      });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Tạo đề xuất món từ tìm kiếm"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => void submit()}>Gửi đề xuất</Button></>}
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <Field label="Tên món" required full><input className="o-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Lý do / ý tưởng" full><textarea className="o-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Nguyên liệu & cách làm (có thể để pha chế bổ sung sau)" full><textarea className="o-input" rows={3} value={recipe} onChange={(e) => setRecipe(e.target.value)} /></Field>
        <Field label="Giá đề xuất" full><input className="o-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Khối đầu màn Đề xuất món: món khách tìm nhiều mà quán chưa có + món chi nhánh chưa bán */
export function SearchSuggestions({ onChanged }: { onChanged?: () => void }) {
  const nav = useNavigate();
  const { data, reload } = useInsights(null);
  const [open, setOpen] = useState<TermRow | null>(null);
  if (!data) return null;
  const suggested = data.terms.filter((t) => t.suggested && !t.proposal);
  const notSold = data.terms.filter((t) => t.status === "NOT_SOLD_HERE" && t.zeroSearchers >= data.thresholds.minCustomers);
  if (!suggested.length && !notSold.length) return null;
  const row = (t: TermRow, extra: string) => (
    <li key={t.term} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
      <span>
        <b>{t.display}</b> — {t.zeroSearchers} khách tìm không ra ({pct(t.zeroRate)}){" "}
        <Badge tone={trend(t.zeroSearchers, t.prevSearchers).tone}>{trend(t.zeroSearchers, t.prevSearchers).text}</Badge>
        <span className="o-muted"> {extra}</span>
      </span>
      <Button size="sm" onClick={() => setOpen(t)}>Xem</Button>
    </li>
  );
  return (
    <div className="o-content" style={{ paddingBottom: 0 }}>
      <div className="o-card" style={{ padding: 14 }}>
        <div className="o-inline" style={{ justifyContent: "space-between" }}>
          <div className="o-section-title" style={{ margin: 0 }}><SearchX size={16} /> Khách tìm nhưng quán chưa có ({data.days} ngày)</div>
          <Button size="sm" onClick={() => nav("/app/sales/search")}>Tất cả từ khóa</Button>
        </div>
        {suggested.length > 0 && <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>{suggested.slice(0, 8).map((t) => row(t, t.typoOf ? `· gần giống "${t.typoOf.name}"` : ""))}</ul>}
        {notSold.length > 0 && (
          <>
            <div className="o-muted" style={{ marginTop: 10 }}>Chuỗi đã có món nhưng chi nhánh chưa bán:</div>
            <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>{notSold.slice(0, 5).map((t) => row(t, `· ${t.notSoldStores.map((s) => s.name).join(", ")}`))}</ul>
          </>
        )}
      </div>
      {open && <TermModal t={open} days={data.days} total={data.summary.searchers} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void reload(); onChanged?.(); }} />}
    </div>
  );
}
