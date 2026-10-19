import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl, calculateFinalPrice, type MenuResponse, type Product } from "../lib/api";
import {
  getTableId,
  getTakeawaySessionId,
  getUser,
  isGuestMode,
  setTableId,
  setTakeawaySessionId,
} from "../lib/session";
import { ChatWidget } from "../components/ChatWidget";
import { ReviewList } from "../components/ReviewList";
import { motion } from "framer-motion";
import { AdvancedFilter, type FilterState } from "../components/AdvancedFilter";
import { StorePicker } from "../components/StorePicker";
import { useCustomerStore } from "../lib/customerStore";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function Menu() {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [demoTable, setDemoTable] = useState("");
  const [ctxTick, setCtxTick] = useState(0);

  const [filters, setFilters] = useState<FilterState>({
    search: "",
    categoryId: "all",
    minPrice: "",
    maxPrice: "",
    tags: []
  });
  
  const catSectionRefs = useRef<Record<number, HTMLElement | null>>({});

  const user = getUser();
  const guest = isGuestMode();
  const { storeId } = useCustomerStore();
  const tableId = ctxTick >= 0 ? getTableId() : null;
  const takeawaySid = ctxTick >= 0 ? getTakeawaySessionId() : null;

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (user?.customerId) params.append("customerId", String(user.customerId));
    // Ẩn món chi nhánh không bán / báo hết
    if (storeId) params.append("store", String(storeId));
    if (filters.search) params.append("search", filters.search);
    if (filters.categoryId !== "all") params.append("categoryId", String(filters.categoryId));
    if (filters.minPrice) params.append("minPrice", filters.minPrice);
    if (filters.maxPrice) params.append("maxPrice", filters.maxPrice);
    if (filters.tags.length > 0) params.append("tags", filters.tags.join(","));
    return `?${params.toString()}`;
  }, [user, filters, storeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await api<MenuResponse>(`/api/menu${qs}`);
        if (!cancelled) setData(m);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Lỗi tải menu");
      }
    })();
    return () => { cancelled = true; };
  }, [qs]);

  if (err) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="site-page">
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <Link to="/">Về trang chủ</Link>
      </motion.div>
    );
  }

  if (!data) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="site-page">
        <p className="subtle">Đang tải thực đơn…</p>
      </motion.div>
    );
  }

  const byCat = new Map<number, Product[]>();
  for (const p of data.products) {
    const arr = byCat.get(p.categoryId) ?? [];
    arr.push(p);
    byCat.set(p.categoryId, arr);
  }

  const query = filters.search;

  const filteredCats = data.categories
    .map((c) => {
      let list = byCat.get(c.id) ?? [];
      if (!list.length) return null;
      return { ...c, list };
    })
    .filter(Boolean) as Array<{ id: number; name: string; list: Product[] }>;

  const totalResult = filteredCats.reduce((s, c) => s + c.list.length, 0);

  // Checks if any filter is active
  const hasFilter = filters.search || filters.categoryId !== "all" || filters.minPrice || filters.maxPrice || filters.tags.length > 0;



  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4 }}
      className="site-page"
      style={{ maxWidth: 800 }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <StorePicker />
        <h1 className="page-title" style={{ marginBottom: "0.25rem", color: "var(--accent)" }}>Thực đơn</h1>
        <p className="subtle" style={{ margin: 0, color: "var(--text)" }}>
          {guest || !user ? "Hãy chọn món bạn yêu thích" : `Xin chào, ${user.fullName}`}
        </p>
        {user && !guest && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "rgba(146,64,14,0.8)" }}>
            {takeawaySid
              ? "Mang về (tích điểm khi thanh toán)"
              : tableId
                ? `Tại bàn #${tableId}`
                : "Chưa gán bàn / mang về"}
          </p>
        )}
      </div>

      {user && !guest && (
        <div style={{ 
          background: "var(--surface2)", 
          borderRadius: 16, 
          padding: "1rem", 
          marginBottom: "1.5rem",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)"
        }}>
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <label className="label" htmlFor="menu-demo-table" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Demo không QR — gán bàn</label>
            <input
              id="menu-demo-table"
              className="input"
              placeholder="Ví dụ: 3"
              value={demoTable}
              onChange={(e) => setDemoTable(e.target.value)}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }} onClick={() => {
              const n = Number(demoTable);
              if (!n || Number.isNaN(n) || n <= 0) return;
              setTakeawaySessionId(null); setTableId(n); setCtxTick((c) => c + 1);
            }}>Gán bàn</button>
            <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", borderColor: "var(--border)" }} onClick={() => {
              setTakeawaySessionId(crypto.randomUUID()); setTableId(null); setCtxTick((c) => c + 1);
            }}>Mang về</button>
          </div>
        </div>
      )}

      {/* ADVANCED FILTER */}
      <AdvancedFilter 
        categories={data.categories}
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters({
          search: "",
          categoryId: "all",
          minPrice: "",
          maxPrice: "",
          tags: []
        })}
      />

      {/* MÓN QUEN */}
      {!hasFilter && data.favorites.length > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", margin: "0 0 1rem", color: "var(--text)" }}>Món quen của bạn</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
            {data.favorites.map((p) => {
              const finalPrice = calculateFinalPrice(p.sellPrice, p.discountPercent);
              const hasDiscount = p.discountPercent && p.discountPercent > 0;
              return (
                <motion.div key={p.id} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
                  <Link to={`/product/${p.id}`} style={{ display: "block", textDecoration: "none", color: "inherit", background: "var(--surface2)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 15px rgba(0,0,0,0.2)", position: "relative" }}>
                    <div style={{ aspectRatio: "1/1", background: "var(--surface)", backgroundImage: mediaUrl(p.imageUrl) ? `url(${mediaUrl(p.imageUrl)})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                    {hasDiscount && (
                      <div style={{ position: "absolute", top: 8, right: 8, background: "linear-gradient(135deg, #e53e3e 0%, #c53030 100%)", color: "#fff", fontSize: "0.75rem", fontWeight: 800, padding: "0.2rem 0.6rem", borderRadius: 8, boxShadow: "0 2px 8px rgba(229, 62, 62, 0.4)" }}>
                        -{p.discountPercent}%
                      </div>
                    )}
                    <div style={{ padding: "0.85rem" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.3, marginBottom: "0.4rem", color: "var(--text)" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        {hasDiscount ? (
                          <>
                            <span style={{ color: "#e53e3e", fontWeight: 700 }}>{formatVnd(finalPrice)}</span>
                            <span style={{ fontSize: "0.8rem", color: "rgba(184,169,154,0.6)", textDecoration: "line-through" }}>{formatVnd(p.sellPrice)}</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--accent)", fontWeight: 700 }}>{formatVnd(finalPrice)}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* TÌM KIẾM RESULT */}
      {hasFilter && (
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }}>
          {totalResult === 0 ? `Không tìm thấy món nào phù hợp` : `Tìm thấy ${totalResult} món`}
        </p>
      )}

      {/* CATEGORY GRID */}
      {filteredCats.map((c) => (
        <section key={c.id} ref={(el) => { catSectionRefs.current[c.id] = el; }} style={{ marginBottom: "3rem", scrollMarginTop: "120px" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", margin: "0 0 1rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {c.name}
            <span style={{ fontSize: "0.75rem", fontWeight: 600, background: "rgba(146,64,14,0.15)", color: "var(--accent)", borderRadius: 999, padding: "0.15rem 0.6rem" }}>
              {c.list.length}
            </span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1.25rem" }}>
            {c.list.map((p) => {
              const finalPrice = calculateFinalPrice(p.sellPrice, p.discountPercent);
              const hasDiscount = p.discountPercent && p.discountPercent > 0;
              return (
                <motion.div key={p.id} whileHover={{ y: -4, transition: { duration: 0.2 } }} style={{ display: "flex" }}>
                  <Link to={`/product/${p.id}`} style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", textDecoration: "none", color: "inherit", background: "var(--surface2)", borderRadius: 18, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                    <div style={{ aspectRatio: "1/1", width: "100%", background: "var(--surface)", backgroundImage: mediaUrl(p.imageUrl) ? `url(${mediaUrl(p.imageUrl)})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                    {hasDiscount && (
                      <div style={{ position: "absolute", top: 8, right: 8, background: "linear-gradient(135deg, #e53e3e 0%, #c53030 100%)", color: "#fff", fontSize: "0.75rem", fontWeight: 800, padding: "0.2rem 0.6rem", borderRadius: 8, boxShadow: "0 2px 8px rgba(229, 62, 62, 0.4)" }}>
                        -{p.discountPercent}%
                      </div>
                    )}
                    <div style={{ padding: "0.85rem", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.4, marginBottom: "0.5rem", color: "var(--text)" }}>
                        {query ? highlightMatch(p.name, query) : p.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        {hasDiscount ? (
                          <>
                            <span style={{ color: "#e53e3e", fontWeight: 700 }}>{formatVnd(finalPrice)}</span>
                            <span style={{ fontSize: "0.8rem", color: "rgba(184,169,154,0.6)", textDecoration: "line-through" }}>{formatVnd(p.sellPrice)}</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--accent)", fontWeight: 700 }}>{formatVnd(finalPrice)}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}

      {/* ĐÁNH GIÁ */}
      {!hasFilter && (
        <section style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
          <ReviewList />
        </section>
      )}

      <ChatWidget />
    </motion.div>
  );
}

function highlightMatch(name: string, query: string) {
  const nq = normalize(query);
  const nn = normalize(name);
  const idx = nn.indexOf(nq);
  if (idx === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <mark style={{ background: "rgba(146,64,14,0.3)", color: "var(--accent)", borderRadius: 4, padding: "0 2px" }}>
        {name.slice(idx, idx + nq.length)}
      </mark>
      {name.slice(idx + nq.length)}
    </>
  );
}
