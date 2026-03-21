import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Product } from "../lib/api";
import { addToCart } from "../lib/cart";

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
      <div className="app-shell">
        <p>{err ?? "Đang tải…"}</p>
        <Link to="/menu">← Menu</Link>
      </div>
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
      quantity: 1,
      size,
      icePct,
      sugar,
      notes: noteParts.join(" · "),
    });
    nav("/cart");
  }

  return (
    <div className="app-shell">
      <div className="nav-top">
        <Link to="/menu" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
          ← Menu
        </Link>
      </div>

      <div
        className="card"
        style={{
          marginBottom: "1rem",
          aspectRatio: "16/10",
          background: "#1a120d",
          backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <h1 className="page-title">{p.name}</h1>
      <p className="subtle">{p.category?.name}</p>
      <p style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--accent)", marginTop: 0 }}>
        {formatVnd(unitPrice)}
      </p>

      <div className="card" style={{ padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <div className="label">Size</div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["S", "M", "L"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="btn"
              onClick={() => setSize(s)}
              style={{
                flex: 1,
                background: size === s ? "var(--accent)" : "transparent",
                color: size === s ? "#1a120d" : "var(--text)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="label">Đá</div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {([0, 50, 100] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="btn"
              onClick={() => setIcePct(v)}
              style={{
                flex: 1,
                background: icePct === v ? "var(--accent)" : "transparent",
                color: icePct === v ? "#1a120d" : "var(--text)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: "0.85rem",
              }}
            >
              {v}%
            </button>
          ))}
        </div>

        <div className="label">Đường</div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["0", "50", "100"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="btn"
              onClick={() => setSugar(v)}
              style={{
                flex: 1,
                background: sugar === v ? "var(--accent)" : "transparent",
                color: sugar === v ? "#1a120d" : "var(--text)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: "0.85rem",
              }}
            >
              {v}%
            </button>
          ))}
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="notes">
            Ghi chú thêm
          </label>
          <input
            id="notes"
            className="input"
            placeholder="Ít đá, thêm kem…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={onAdd}>
        Thêm vào giỏ hàng
      </button>
    </div>
  );
}
