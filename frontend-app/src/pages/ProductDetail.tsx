import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, mediaUrl, type Product } from "../lib/api";
import { addToCart } from "../lib/cart";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Minus, Plus, ShoppingBag } from "lucide-react";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<Product | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const [icePct, setIcePct] = useState<0 | 50 | 100>(100);
  const [sugar, setSugar] = useState<"0" | "50" | "100">("100");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const prod = await api<Product>(`/api/products/${id}`);
        if (!cancelled) setP(prod);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Lỗi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err || !p) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="site-page">
        <p style={{ color: "var(--danger)" }}>{err ?? "Đang tải…"}</p>
        <Link to="/menu" style={{ color: "var(--accent)", textDecoration: "none" }}>← Trở về Menu</Link>
      </motion.div>
    );
  }

  const priceAdj = size === "S" ? -3000 : size === "L" ? 5000 : 0;
  const unitPrice = Math.max(0, p.sellPrice + priceAdj);

  function onAdd() {
    if (!p) return;
    const lineProduct: Product = {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      costPrice: p.costPrice,
      sellPrice: unitPrice,
      isActive: p.isActive,
      imageUrl: p.imageUrl,
      category: p.category,
    };
    const noteParts = [`Size ${size}`, `Đá ${icePct}%`, `Đường ${sugar}%`];
    if (notes.trim()) noteParts.push(notes.trim());
    addToCart(lineProduct, {
      quantity: qty,
      size,
      icePct,
      sugar,
      notes: noteParts.join(" · "),
    });
    nav("/cart");
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4 }}
      className="site-page"
      style={{ maxWidth: 1000, padding: "1.5rem" }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <Link to="/menu" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)", textDecoration: "none", fontSize: "0.95rem", fontWeight: 500, transition: "color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted)"}>
          <ArrowLeft size={18} /> Menu
        </Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "3rem", alignItems: "flex-start" }}>
        {/* IMAGE COLUMN */}
        <div style={{ flex: "1 1 400px", maxWidth: "500px", margin: "0 auto" }}>
          <div style={{ 
            width: "100%", aspectRatio: "4/5", 
            borderRadius: 24, overflow: "hidden", 
            background: "#1a120d", 
            boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            position: "relative"
          }}>
            {p.imageUrl && (
              <img src={mediaUrl(p.imageUrl)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.8) 100%)" }} />
          </div>
        </div>

        {/* DETAILS COLUMN */}
        <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", margin: "0 0 0.5rem", lineHeight: 1.2 }}>{p.name}</h1>
            <p style={{ color: "var(--muted)", fontSize: "1.1rem", margin: "0 0 1rem" }}>{p.category?.name}</p>
            <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--accent)" }}>
              {formatVnd(unitPrice)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* SIZE */}
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>Kích cỡ</div>
              <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 999, padding: "0.25rem", border: "1px solid rgba(255,255,255,0.05)", position: "relative" }}>
                {(["S", "M", "L"] as const).map((s) => (
                  <button
                    key={s} type="button" onClick={() => setSize(s)}
                    style={{ flex: 1, position: "relative", zIndex: 1, background: "transparent", border: "none", padding: "0.75rem 0", color: size === s ? "#1a120d" : "var(--text)", fontWeight: size === s ? 700 : 500, fontSize: "1rem", cursor: "pointer", transition: "color 0.2s" }}
                  >
                    {size === s && (
                      <motion.div layoutId="size-bg" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", borderRadius: 999, zIndex: -1, boxShadow: "0 4px 12px rgba(201,162,39,0.3)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                    )}
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* ĐÁ */}
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>Lượng đá</div>
              <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 999, padding: "0.25rem", border: "1px solid rgba(255,255,255,0.05)", position: "relative" }}>
                {([0, 50, 100] as const).map((v) => (
                  <button
                    key={v} type="button" onClick={() => setIcePct(v)}
                    style={{ flex: 1, position: "relative", zIndex: 1, background: "transparent", border: "none", padding: "0.6rem 0", color: icePct === v ? "#1a120d" : "var(--text)", fontWeight: icePct === v ? 700 : 500, fontSize: "0.95rem", cursor: "pointer", transition: "color 0.2s" }}
                  >
                    {icePct === v && (
                      <motion.div layoutId="ice-bg" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", borderRadius: 999, zIndex: -1, boxShadow: "0 4px 12px rgba(201,162,39,0.3)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                    )}
                    {v}%
                  </button>
                ))}
              </div>
            </div>

            {/* ĐƯỜNG */}
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>Lượng đường</div>
              <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 999, padding: "0.25rem", border: "1px solid rgba(255,255,255,0.05)", position: "relative" }}>
                {(["0", "50", "100"] as const).map((v) => (
                  <button
                    key={v} type="button" onClick={() => setSugar(v)}
                    style={{ flex: 1, position: "relative", zIndex: 1, background: "transparent", border: "none", padding: "0.6rem 0", color: sugar === v ? "#1a120d" : "var(--text)", fontWeight: sugar === v ? 700 : 500, fontSize: "0.95rem", cursor: "pointer", transition: "color 0.2s" }}
                  >
                    {sugar === v && (
                      <motion.div layoutId="sugar-bg" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", borderRadius: 999, zIndex: -1, boxShadow: "0 4px 12px rgba(201,162,39,0.3)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                    )}
                    {v}%
                  </button>
                ))}
              </div>
            </div>

            {/* GHI CHÚ */}
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>Ghi chú thêm</div>
              <input
                className="input"
                placeholder="Ít đá, thêm kem, không ống hút…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1rem", color: "var(--text)", width: "100%", fontSize: "1rem" }}
              />
            </div>
          </div>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "0.5rem 0" }} />

          {/* SỐ LƯỢNG & MUA */}
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "0.25rem" }}>
              <button
                type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}
                style={{ width: 44, height: 44, borderRadius: "50%", background: "transparent", border: "none", color: qty <= 1 ? "rgba(255,255,255,0.2)" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: qty <= 1 ? "not-allowed" : "pointer", transition: "background 0.2s" }}
                onMouseEnter={(e) => { if(qty>1) e.currentTarget.style.background = "rgba(255,255,255,0.05)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <Minus size={20} />
              </button>
              <div style={{ width: 48, textAlign: "center", fontWeight: 700, fontSize: "1.1rem" }}>{qty}</div>
              <button
                type="button" onClick={() => setQty((q) => Math.min(20, q + 1))}
                style={{ width: 44, height: 44, borderRadius: "50%", background: "transparent", border: "none", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <Plus size={20} />
              </button>
            </div>
            
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button" className="btn btn-primary" onClick={onAdd}
              style={{ flex: 1, padding: "1.2rem", borderRadius: 999, fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", boxShadow: "0 10px 25px rgba(201,162,39,0.3)" }}
            >
              <ShoppingBag size={22} />
              {qty > 1
                ? `Thêm ${qty} ly — ${formatVnd(unitPrice * qty)}`
                : `Thêm vào giỏ hàng`}
            </motion.button>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
