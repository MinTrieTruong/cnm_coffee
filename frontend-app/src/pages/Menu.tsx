import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api, type MenuResponse, type Product } from "../lib/api";
import { getTableId, getTakeawaySessionId, getUser } from "../lib/session";
import { ReviewList } from "../components/ReviewList";
import { useCustomerStore } from "../lib/customerStore";
import { logMenuSearch } from "../lib/searchLog";
import { formatVnd } from "../lib/site";
import { Crumbs, ProductCard, SectionHead, listPrice } from "../components/site/parts";

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

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (user?.customerId) q.append("customerId", String(user.customerId));
    // Ẩn món chi nhánh không bán / báo hết
    if (storeId) q.append("store", String(storeId));
    if (filters.search) q.append("search", filters.search);
    if (filters.categoryId !== "all") q.append("categoryId", String(filters.categoryId));
    if (filters.minPrice) q.append("minPrice", filters.minPrice);
    if (filters.maxPrice) q.append("maxPrice", filters.maxPrice);
    if (filters.tags.length > 0) q.append("tags", filters.tags.join(","));
    return `?${q.toString()}`;
  }, [user?.customerId, filters, storeId]);

  // Thống kê "khách tìm gì": chỉ ghi khi khách ngừng gõ 1,5 giây (không ghi từng ký tự)
  useEffect(() => {
    const q = filters.search;
    if (q.trim().length < 2) return;
    const t = window.setTimeout(() => logMenuSearch(q, storeId), 1500);
    return () => window.clearTimeout(t);
  }, [filters.search, storeId]);

  useEffect(() => {
    let cancelled = false;
    api<MenuResponse>(`/api/menu${qs}`)
      .then((m) => {
        if (!cancelled) {
          setData(m);
          setErr(null);
        }
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "Lỗi tải menu"));
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
  const query = filters.search;
  const hasFilter = !!(filters.search || filters.categoryId !== "all" || filters.minPrice || filters.maxPrice || filters.tags.length);
  const current = filters.categoryId === "all" ? null : categories.find((c) => c.id === filters.categoryId);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const priceOn = (r: (typeof PRICES)[number]) => filters.minPrice === r.min && filters.maxPrice === r.max;

  return (
    <div className="c-wrap c-menu">
      <Crumbs items={[{ to: "/menu", label: "Thực đơn" }, ...(current ? [{ label: current.name }] : [])]} />

      <div className="c-menu-layout">
        <aside className="c-menu-side" aria-label="Lọc thực đơn">
          <div className="c-side-box">
            <h2 className="c-side-h">Danh mục</h2>
            <ul className="c-side-cats">
              <li>
                <button type="button" className={filters.categoryId === "all" ? "is-on" : undefined} onClick={() => pickCategory("all")}>Tất cả món</button>
              </li>
              {categories.map((c) => (
                <li key={c.id} className={c.parentId ? "is-child" : undefined}>
                  <button type="button" className={filters.categoryId === c.id ? "is-on" : undefined} aria-pressed={filters.categoryId === c.id} onClick={() => pickCategory(c.id)}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="c-side-box">
            <h2 className="c-side-h">Mức giá</h2>
            <div className="c-side-chips">
              {PRICES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={priceOn(r) ? "is-on" : undefined}
                  aria-pressed={priceOn(r)}
                  onClick={() => setFilters((f) => (priceOn(r) ? { ...f, minPrice: "", maxPrice: "" } : { ...f, minPrice: r.min, maxPrice: r.max }))}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="c-side-box">
            <h2 className="c-side-h">Kiểu món</h2>
            <div className="c-side-chips">
              {TAGS.map((t) => {
                const on = filters.tags.includes(t);
                return (
                  <button key={t} type="button" className={on ? "is-on" : undefined} aria-pressed={on} onClick={() => setFilters((f) => ({ ...f, tags: on ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))}>
                    {TAG_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>
          {hasFilter && <button type="button" className="c-linkish c-side-clear" onClick={clearAll}>Bỏ lọc</button>}
        </aside>

        <div className="c-menu-main">
          <div className="c-menu-head">
            <h1 className="c-sec-title">
              {current?.name ?? "Thực đơn"}
              <span className="c-sec-sub">— {takeawaySid ? "đơn mang về" : tableId ? `bạn đang ngồi ${tableName ?? `bàn #${tableId}`}` : "chọn món, quán pha liền tay"}</span>
            </h1>
          </div>

          <div className="c-menu-tools">
            <label className="c-menu-search">
              <Search size={18} aria-hidden />
              <span className="c-sr">Tìm món</span>
              <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Tìm theo tên món" />
              {filters.search && (
                <button type="button" onClick={() => setFilters((f) => ({ ...f, search: "" }))} aria-label="Xóa từ khóa"><X size={16} aria-hidden /></button>
              )}
            </label>
            <div className="c-seg" role="group" aria-label="Kiểu xem">
              <button type="button" className={view === "grid" ? "is-on" : undefined} aria-pressed={view === "grid"} onClick={() => changeView("grid")}>Lưới ảnh</button>
              <button type="button" className={view === "paper" ? "is-on" : undefined} aria-pressed={view === "paper"} onClick={() => changeView("paper")}>Menu giấy</button>
            </div>
          </div>

          {err && <p className="c-err">{err}</p>}
          {!data && !err && <p className="c-muted-txt">Đang tải thực đơn…</p>}
          {data && hasFilter && <p className="c-muted-txt c-menu-count">{total === 0 ? "Không có món nào khớp bộ lọc." : `${total} món`}</p>}

          {data && !hasFilter && data.favorites.length > 0 && view === "grid" && (
            <section className="c-menu-group">
              <SectionHead title="Món quen của bạn" sub="bạn hay gọi" />
              <div className="c-grid c-grid-3">{data.favorites.slice(0, 6).map((p) => <ProductCard key={p.id} p={p} line={catName.get(p.categoryId)} />)}</div>
            </section>
          )}

          {data && view === "grid" &&
            groups.map((c) => (
              <section key={c.id} className="c-menu-group" id={`cat-${c.id}`}>
                <SectionHead title={c.name} sub={`${c.list.length} món`} />
                <div className="c-grid c-grid-3">
                  {c.list.map((p) => <ProductCard key={p.id} p={p} line={catName.get(p.categoryId)} />)}
                </div>
              </section>
            ))}

          {data && view === "paper" && groups.length > 0 && (
            <div className="c-paper">
              <p className="c-paper-title">TD Coffee<span>— thực đơn treo tường</span></p>
              <div className="c-paper-cols">{groups.map((c) => <PaperGroup key={c.id} name={c.name} list={c.list} query={query} />)}</div>
              <p className="c-paper-note">Giá size M. Size S/L và tuỳ chọn đá, đường chọn ở trang món.</p>
            </div>
          )}

          {data && !hasFilter && (
            <section className="c-menu-reviews">
              <ReviewList title="Khách nói gì về quán" />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
