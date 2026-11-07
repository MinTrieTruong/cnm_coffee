import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api, type MenuResponse, type Product } from "../lib/api";
import { getTableId, getTakeawaySessionId, getUser } from "../lib/session";
import { ReviewList } from "../components/ReviewList";
import { useCustomerStore } from "../lib/customerStore";
import { logMenuSearch } from "../lib/searchLog";
import { formatVnd } from "../lib/site";
import { useLang } from "../lib/i18n";
import { Crumbs, ProductCard, SectionHead, listPrice } from "../components/site/parts";
import { QuickOrderMic, openQuickOrder, useQuickOrder } from "../components/site/QuickOrder";
import { looksLikeOrder } from "../lib/voiceOrder";

type FilterState = { search: string; categoryId: number | "all"; minPrice: string; maxPrice: string; tags: string[] };
type View = "grid" | "paper";

/** Nhãn món trong CSDL có kèm emoji ("🔥 Best Seller") — giữ giá trị gốc để lọc, chỉ hiển thị phần chữ */
const TAGS = ["🔥 Best Seller", "☕ Nóng", "🧊 Đá", "🆕 Món Mới", "⭐ Đề cử"];
const TAG_LABEL: Record<string, string> = { "🔥 Best Seller": "Bán chạy", "☕ Nóng": "Uống nóng", "🧊 Đá": "Uống đá", "🆕 Món Mới": "Món mới", "⭐ Đề cử": "Quán đề cử" };
const PRICES: { label: string; min: string; max: string }[] = [
  { label: "Dưới 30.000đ", min: "", max: "29999" },
  { label: "30.000 – 50.000đ", min: "30000", max: "50000" },
  { label: "Trên 50.000đ", min: "50001", max: "" },
];
const EMPTY: FilterState = { search: "", categoryId: "all", minPrice: "", maxPrice: "", tags: [] };
const VIEW_KEY = "c-menu-view";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function highlightMatch(name: string, query: string) {
  const nq = normalize(query);
  const idx = normalize(name).indexOf(nq);
  if (!nq || idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <mark className="c-mark">{name.slice(idx, idx + nq.length)}</mark>
      {name.slice(idx + nq.length)}
    </>
  );
}
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "paper" ? "paper" : "grid";
  } catch {
    return "grid";
  }
}

/** Một nhóm món kiểu menu treo tường: tên ……… giá */
function PaperGroup({ name, list, query }: { name: string; list: Product[]; query: string }) {
  return (
    <section className="c-paper-group">
      <h3 className="c-paper-h">{name}</h3>
      <ul className="c-paper-list">
        {list.map((p) => {
          const off = p.discountPercent && p.discountPercent > 0;
          return (
            <li key={p.id}>
              <Link to={`/product/${p.id}`} className="c-paper-row">
                <span className="c-paper-name">{query ? highlightMatch(p.name, query) : p.name}</span>
                {off ? <span className="c-stamp c-paper-stamp">-{p.discountPercent}%</span> : null}
                <span className="c-paper-dots" aria-hidden />
                <span className="c-paper-price">
                  {off ? <span className="c-price-old">{formatVnd(p.sellPrice)}</span> : null} {formatVnd(listPrice(p))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Menu() {
  const { t } = useLang();
  const quick = useQuickOrder();
  const [data, setData] = useState<MenuResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>(readView);

  // ?category=<id> (pop up / liên kết ngoài) → lọc sẵn danh mục; ?q= từ ô tìm kiếm trên header
  const [params, setParams] = useSearchParams();
  const catParam = params.get("category");
  const qParam = params.get("q") ?? "";
  const [filters, setFilters] = useState<FilterState>({
    ...EMPTY,
    search: qParam,
    categoryId: catParam && /^\d+$/.test(catParam) ? Number(catParam) : "all",
  });
  useEffect(() => {
    setFilters((f) => ({ ...f, categoryId: catParam && /^\d+$/.test(catParam) ? Number(catParam) : "all" }));
  }, [catParam]);
  useEffect(() => {
    if (qParam) setFilters((f) => ({ ...f, search: qParam }));
  }, [qParam]);

  const user = getUser();
  const { storeId, tableName } = useCustomerStore();
  const tableId = getTableId();
  const takeawaySid = getTakeawaySessionId();

  // Câu gọi món ("2 bạc xỉu ít đá…") dành cho Đặt nhanh: không lọc thực đơn, không ghi thống kê tìm kiếm
  const search = quick.enabled && looksLikeOrder(filters.search) ? "" : filters.search;

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (user?.customerId) q.append("customerId", String(user.customerId));
    // Ẩn món chi nhánh không bán / báo hết
    if (storeId) q.append("store", String(storeId));
    if (search) q.append("search", search);
    if (filters.categoryId !== "all") q.append("categoryId", String(filters.categoryId));
    if (filters.minPrice) q.append("minPrice", filters.minPrice);
    if (filters.maxPrice) q.append("maxPrice", filters.maxPrice);
    if (filters.tags.length > 0) q.append("tags", filters.tags.join(","));
    return `?${q.toString()}`;
  }, [user?.customerId, filters.categoryId, filters.minPrice, filters.maxPrice, filters.tags, search, storeId]);

  // Thống kê "khách tìm gì": chỉ ghi khi khách ngừng gõ 1,5 giây (không ghi từng ký tự)
  useEffect(() => {
    const q = search;
    if (q.trim().length < 2) return;
    const t = window.setTimeout(() => logMenuSearch(q, storeId), 1500);
    return () => window.clearTimeout(t);
  }, [search, storeId]);

  useEffect(() => {
    let cancelled = false;
    api<MenuResponse>(`/api/menu${qs}`)
      .then((m) => {
        if (!cancelled) {
          setData(m);
          setErr(null);
        }
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : t("Lỗi tải menu")));
    return () => {
      cancelled = true;
    };
  }, [qs]);

  function pickCategory(id: number | "all") {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("category");
    else next.set("category", String(id));
    setParams(next, { replace: true });
  }
  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* chế độ riêng tư */
    }
  }
  function clearAll() {
    setFilters(EMPTY);
    setParams(new URLSearchParams(), { replace: true });
  }

  const categories = data?.categories ?? [];
  const byCat = new Map<number, Product[]>();
  for (const p of data?.products ?? []) byCat.set(p.categoryId, [...(byCat.get(p.categoryId) ?? []), p]);
  const groups = categories.map((c) => ({ ...c, list: byCat.get(c.id) ?? [] })).filter((c) => c.list.length);
  const total = groups.reduce((s, c) => s + c.list.length, 0);
  const query = search;
  const hasFilter = !!(filters.search || filters.categoryId !== "all" || filters.minPrice || filters.maxPrice || filters.tags.length);
  const current = filters.categoryId === "all" ? null : categories.find((c) => c.id === filters.categoryId);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const priceOn = (r: (typeof PRICES)[number]) => filters.minPrice === r.min && filters.maxPrice === r.max;

  const roots = categories.filter((c) => !c.parentId);
  // Danh mục cha đang chọn (chọn danh mục con thì vẫn mở hàng con của cha nó)
  const activeRoot = current ? (current.parentId ? categories.find((c) => c.id === current.parentId) ?? null : current) : null;
  const children = activeRoot ? categories.filter((c) => c.parentId === activeRoot.id) : [];
  const priceKey = PRICES.findIndex(priceOn);

  return (
    <div className="c-wrap c-menu">
      <Crumbs items={[{ to: "/menu", label: "Thực đơn" }, ...(current ? [{ label: current.name }] : [])]} />
      <div className="c-menu-head">
        <h1 className="c-sec-title">
          {current?.name ?? t("Thực đơn")}
          <span className="c-sec-sub">— {takeawaySid ? t("đơn mang về") : tableId ? t("bạn đang ngồi {table}", { table: tableName ?? `#${tableId}` }) : t("chọn món, quán pha liền tay")}</span>
        </h1>
      </div>

      {/* Bộ lọc ngang, dính dưới thanh điều hướng */}
      <div className="c-filter" role="search" aria-label={t("Lọc thực đơn")}>
        <div className="c-filter-cats">
          <button type="button" className={filters.categoryId === "all" ? "is-on" : undefined} aria-pressed={filters.categoryId === "all"} onClick={() => pickCategory("all")}>{t("Tất cả")}</button>
          {roots.map((c) => (
            <button key={c.id} type="button" className={activeRoot?.id === c.id ? "is-on" : undefined} aria-pressed={activeRoot?.id === c.id} onClick={() => pickCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        {children.length > 0 && (
          <div className="c-filter-subs">
            <button type="button" className={current?.id === activeRoot?.id ? "is-on" : undefined} onClick={() => activeRoot && pickCategory(activeRoot.id)}>{t("Tất cả {name}", { name: activeRoot?.name.toLowerCase() ?? "" })}</button>
            {children.map((c) => (
              <button key={c.id} type="button" className={current?.id === c.id ? "is-on" : undefined} aria-pressed={current?.id === c.id} onClick={() => pickCategory(c.id)}>{c.name}</button>
            ))}
          </div>
        )}
        <div className="c-filter-row">
          <label className="c-menu-search">
            <Search size={18} aria-hidden />
            <span className="c-sr">{t("Tìm món")}</span>
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => {
                // Câu gọi món ("2 bạc xỉu ít đá…") + Enter → Đặt nhanh; gõ tên món thì vẫn là tìm kiếm
                if (e.key === "Enter" && quick.enabled && looksLikeOrder(filters.search)) {
                  e.preventDefault();
                  openQuickOrder({ text: filters.search });
                }
              }}
              placeholder={quick.enabled ? t("Tìm món, hoặc nói / gõ món bạn muốn") : t("Tìm theo tên món")}
            />
            {filters.search && (
              <button type="button" onClick={() => setFilters((f) => ({ ...f, search: "" }))} aria-label={t("Xóa từ khóa")}><X size={16} aria-hidden /></button>
            )}
            <QuickOrderMic />
          </label>
          <label className="c-filter-sel">
            <span className="c-sr">{t("Mức giá")}</span>
            <select
              className="c-input"
              value={priceKey}
              onChange={(e) => {
                const r = PRICES[Number(e.target.value)];
                setFilters((f) => ({ ...f, minPrice: r?.min ?? "", maxPrice: r?.max ?? "" }));
              }}
            >
              <option value={-1}>{t("Mọi mức giá")}</option>
              {PRICES.map((r, i) => <option key={r.label} value={i}>{t(r.label)}</option>)}
            </select>
          </label>
          <label className="c-filter-sel">
            <span className="c-sr">{t("Kiểu món")}</span>
            <select className="c-input" value={filters.tags[0] ?? ""} onChange={(e) => setFilters((f) => ({ ...f, tags: e.target.value ? [e.target.value] : [] }))}>
              <option value="">{t("Mọi kiểu món")}</option>
              {TAGS.map((tag) => <option key={tag} value={tag}>{t(TAG_LABEL[tag])}</option>)}
            </select>
          </label>
          {hasFilter && <button type="button" className="c-linkish c-filter-clear" onClick={clearAll}>{t("Bỏ lọc")}</button>}
          <div className="c-seg" role="group" aria-label={t("Kiểu xem")}>
            <button type="button" className={view === "grid" ? "is-on" : undefined} aria-pressed={view === "grid"} onClick={() => changeView("grid")}>{t("Lưới ảnh")}</button>
            <button type="button" className={view === "paper" ? "is-on" : undefined} aria-pressed={view === "paper"} onClick={() => changeView("paper")}>{t("Menu giấy")}</button>
          </div>
        </div>
        {quick.enabled && looksLikeOrder(filters.search) && (
          <div className="qo-quick-row">
            <button type="button" className="c-btn qo-quick-btn" onClick={() => openQuickOrder({ text: filters.search })}>{t("Đặt nhanh")}</button>
            <span>“{filters.search.trim()}”</span>
          </div>
        )}
        {quick.enabled && !filters.search && (
          <p className="qo-try">
            {quick.mic ? t("Thử nói:") : t("Thử gõ:")}{" "}
            <button type="button" onClick={() => openQuickOrder(quick.mic ? { mic: true } : { text: t("Hai bạc xỉu ít đá") })}>“{t("Hai bạc xỉu ít đá")}”</button>
          </p>
        )}
      </div>

      {err && <p className="c-err">{err}</p>}
      {!data && !err && <p className="c-muted-txt">{t("Đang tải thực đơn…")}</p>}
      {data && hasFilter && <p className="c-muted-txt c-menu-count">{total === 0 ? t("Không có món nào khớp bộ lọc.") : t("{n} món", { n: total })}</p>}

      {data && !hasFilter && data.favorites.length > 0 && view === "grid" && (
        <section className="c-menu-group">
          <SectionHead title="Món quen của bạn" sub="bạn hay gọi" />
          <div className="c-grid">{data.favorites.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} line={catName.get(p.categoryId)} />)}</div>
        </section>
      )}

      {data && view === "grid" &&
        groups.map((c) => (
          <section key={c.id} className="c-menu-group" id={`cat-${c.id}`}>
            <SectionHead title={c.name} sub={t("{n} món", { n: c.list.length })} />
            <div className="c-grid">
              {c.list.map((p) => <ProductCard key={p.id} p={p} line={catName.get(p.categoryId)} />)}
            </div>
          </section>
        ))}

      {data && view === "paper" && groups.length > 0 && (
        <div className="c-paper">
          <p className="c-paper-title">TD Coffee<span>— {t("thực đơn treo tường")}</span></p>
          <div className="c-paper-cols">{groups.map((c) => <PaperGroup key={c.id} name={c.name} list={c.list} query={query} />)}</div>
          <p className="c-paper-note">{t("Giá size M. Size S/L và tuỳ chọn đá, đường chọn ở trang món.")}</p>
        </div>
      )}

      {data && !hasFilter && (
        <section className="c-menu-reviews">
          <ReviewList title="Khách nói gì về quán" />
        </section>
      )}
    </div>
  );
}
