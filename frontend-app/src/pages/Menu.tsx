import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl, type MenuResponse, type Product } from "../lib/api";
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
import { Search, X } from "lucide-react";

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

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const catSectionRefs = useRef<Record<number, HTMLElement | null>>({});

  const user = getUser();
  const guest = isGuestMode();
  const tableId = ctxTick >= 0 ? getTableId() : null;
  const takeawaySid = ctxTick >= 0 ? getTakeawaySessionId() : null;

  const qs = useMemo(() => {
    if (user?.customerId) return `?customerId=${user.customerId}`;
    return "";
  }, [user]);

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

  const q = normalize(query);

  const filteredCats = data.categories
    .map((c) => {
      let list = byCat.get(c.id) ?? [];
      if (q) list = list.filter((p) => normalize(p.name).includes(q));
      if (activeCat !== "all" && activeCat !== c.id) return null;
      if (!list.length) return null;
      return { ...c, list };
    })
    .filter(Boolean) as Array<{ id: number; name: string; list: Product[] }>;

  const totalResult = filteredCats.reduce((s, c) => s + c.list.length, 0);

  function scrollToCategory(catId: number) {
    setActiveCat(catId);
    setQuery("");
    setTimeout(() => {
      const el = catSectionRefs.current[catId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4 }}
      className="site-page"
      style={{ maxWidth: 800 }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title" style={{ marginBottom: "0.25rem", color: "var(--accent)" }}>Thực đơn</h1>
        <p className="subtle" style={{ margin: 0, color: "rgba(245,235,227,0.7)" }}>
          {guest || !user ? "Hãy chọn món bạn yêu thích" : `Xin chào, ${user.fullName}`}
        </p>
        {user && !guest && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "rgba(201,162,39,0.8)" }}>
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
          background: "rgba(255,255,255,0.03)", 
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
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10 }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }} onClick={() => {
              const n = Number(demoTable);
              if (!n || Number.isNaN(n) || n <= 0) return;
              setTakeawaySessionId(null); setTableId(n); setCtxTick((c) => c + 1);
            }}>Gán bàn</button>
            <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", borderColor: "rgba(255,255,255,0.1)" }} onClick={() => {
              setTakeawaySessionId(crypto.randomUUID()); setTableId(null); setCtxTick((c) => c + 1);
            }}>Mang về</button>
          </div>
        </div>
      )}

      {/* SEARCH BAR */}
      <div style={{ position: "relative", marginBottom: "1.25rem" }}>
        <Search size={18} color="rgba(255,255,255,0.4)" style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        <input
          ref={searchRef}
          id="menu-search"
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveCat("all"); }}
          placeholder="Tìm kiếm hương vị..."
          style={{
            width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999, color: "var(--text)", padding: "0.85rem 2.5rem 0.85rem 2.8rem",
            fontSize: "0.95rem", outline: "none", transition: "all 0.2s ease"
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(201,162,39,0.5)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        />
        {query && (
          <button
            type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}
            style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* PILL TABS */}
      <div style={{ position: "sticky", top: "60px", zIndex: 20, background: "rgba(26, 18, 13, 0.95)", backdropFilter: "blur(10px)", paddingTop: "0.5rem", paddingBottom: "0.5rem", marginLeft: "-1rem", marginRight: "-1rem", paddingLeft: "1rem", paddingRight: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem", scrollbarWidth: "thin", scrollbarColor: "rgba(201,162,39,0.5) transparent" }} className="menu-cat-scroll">
          <button
            type="button" onClick={() => { setActiveCat("all"); setQuery(""); }}
            style={{
              flexShrink: 0, padding: "0.5rem 1.2rem", borderRadius: 999, fontSize: "0.9rem", fontWeight: activeCat === "all" ? 600 : 400,
              background: activeCat === "all" ? "rgba(201,162,39,0.15)" : "transparent",
              color: activeCat === "all" ? "var(--accent)" : "rgba(245,235,227,0.6)",
              border: `1px solid ${activeCat === "all" ? "rgba(201,162,39,0.3)" : "rgba(255,255,255,0.1)"}`,
              transition: "all 0.2s", cursor: "pointer", whiteSpace: "nowrap"
            }}
          >
            Tất cả
          </button>
          {data.categories.map((c) => {
            const has = (byCat.get(c.id) ?? []).length > 0;
            if (!has) return null;
            const active = activeCat === c.id;
            return (
              <button
                key={c.id} type="button" onClick={() => scrollToCategory(c.id)}
                style={{
                  flexShrink: 0, padding: "0.5rem 1.2rem", borderRadius: 999, fontSize: "0.9rem", fontWeight: active ? 600 : 400,
                  background: active ? "rgba(201,162,39,0.15)" : "transparent",
                  color: active ? "var(--accent)" : "rgba(245,235,227,0.6)",
                  border: `1px solid ${active ? "rgba(201,162,39,0.3)" : "rgba(255,255,255,0.1)"}`,
                  transition: "all 0.2s", cursor: "pointer", whiteSpace: "nowrap"
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* MÓN QUEN */}
      {!query && activeCat === "all" && data.favorites.length > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", margin: "0 0 1rem", color: "var(--text)" }}>Món quen của bạn</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
            {data.favorites.map((p) => (
              <motion.div key={p.id} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
                <Link to={`/product/${p.id}`} style={{ display: "block", textDecoration: "none", color: "inherit", background: "rgba(255,255,255,0.02)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" }}>
                  <div style={{ aspectRatio: "1/1", background: "#1a120d", backgroundImage: mediaUrl(p.imageUrl) ? `url(${mediaUrl(p.imageUrl)})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                  <div style={{ padding: "0.85rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.3, marginBottom: "0.4rem", color: "var(--text)" }}>{p.name}</div>
                    <div style={{ color: "var(--accent)", fontWeight: 700 }}>{formatVnd(p.sellPrice)}</div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* TÌM KIẾM RESULT */}
      {query && (
        <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem" }}>
          {totalResult === 0 ? `Không tìm thấy món nào cho "${query}"` : `Tìm thấy ${totalResult} món cho "${query}"`}
        </p>
      )}

      {/* CATEGORY GRID */}
      {filteredCats.map((c) => (
        <section key={c.id} ref={(el) => { catSectionRefs.current[c.id] = el; }} style={{ marginBottom: "3rem", scrollMarginTop: "120px" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", margin: "0 0 1rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {c.name}
            <span style={{ fontSize: "0.75rem", fontWeight: 600, background: "rgba(201,162,39,0.15)", color: "var(--accent)", borderRadius: 999, padding: "0.15rem 0.6rem" }}>
              {c.list.length}
            </span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1.25rem" }}>
            {c.list.map((p) => (
              <motion.div key={p.id} whileHover={{ y: -4, transition: { duration: 0.2 } }} style={{ display: "flex" }}>
                <Link to={`/product/${p.id}`} style={{ display: "flex", flexDirection: "column", width: "100%", textDecoration: "none", color: "inherit", background: "rgba(255,255,255,0.02)", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.03)", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <div style={{ aspectRatio: "1/1", width: "100%", background: "#1a120d", backgroundImage: mediaUrl(p.imageUrl) ? `url(${mediaUrl(p.imageUrl)})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                  <div style={{ padding: "0.85rem", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.4, marginBottom: "0.5rem", color: "var(--text)" }}>
                      {query ? highlightMatch(p.name, query) : p.name}
                    </div>
                    <div style={{ color: "var(--accent)", fontWeight: 700 }}>{formatVnd(p.sellPrice)}</div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      ))}

      {/* ĐÁNH GIÁ */}
      {!query && activeCat === "all" && (
        <section style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
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
      <mark style={{ background: "rgba(201,162,39,0.3)", color: "var(--accent)", borderRadius: 4, padding: "0 2px" }}>
        {name.slice(idx, idx + nq.length)}
      </mark>
      {name.slice(idx + nq.length)}
    </>
  );
}
