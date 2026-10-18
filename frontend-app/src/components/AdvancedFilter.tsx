import { useEffect, useState, type JSX } from "react";
import { Search, X, Filter } from "lucide-react";

export type FilterState = {
  search: string;
  categoryId: number | "all";
  minPrice: string;
  maxPrice: string;
  tags: string[];
};

export const PREDEFINED_TAGS = ["🔥 Best Seller", "☕ Nóng", "🧊 Đá", "🆕 Món Mới", "⭐ Đề cử"];

interface AdvancedFilterProps {
  categories: { id: number; name: string }[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClear: () => void;
}

export function AdvancedFilter({ categories, filters, onChange, onClear }: AdvancedFilterProps): JSX.Element {
  const [localSearch, setLocalSearch] = useState(filters.search);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (localSearch !== filters.search) {
        onChange({ ...filters, search: localSearch });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [localSearch, filters, onChange]);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const toggleTag = (tag: string) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    onChange({ ...filters, tags: newTags });
  };

  return (
    <div style={{
      background: "var(--surface2)",
      borderRadius: 16,
      padding: "1.25rem",
      marginBottom: "1.5rem",
      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
      border: "1px solid var(--border)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Filter size={18} /> Bộ lọc đa chiều
        </h3>
        <button 
          type="button" 
          onClick={onClear}
          style={{ 
            background: "none", border: "none", color: "var(--muted)", cursor: "pointer", 
            fontSize: "0.85rem", textDecoration: "underline" 
          }}
        >
          Xóa bộ lọc
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={16} color="#78716c" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="search"
            placeholder="Tên món..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{
              width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text)", padding: "0.6rem 2rem 0.6rem 2.2rem",
              fontSize: "0.9rem", outline: "none"
            }}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => setLocalSearch("")}
              style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category */}
        <div>
          <select
            value={filters.categoryId}
            onChange={(e) => onChange({ ...filters, categoryId: e.target.value === "all" ? "all" : Number(e.target.value) })}
            style={{
              width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text)", padding: "0.65rem 0.75rem",
              fontSize: "0.9rem", outline: "none"
            }}
          >
            <option value="all" style={{ color: "#000" }}>Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} style={{ color: "#000" }}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Price Range */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="number"
            placeholder="Giá từ..."
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            style={{
              width: "50%", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text)", padding: "0.6rem 0.75rem",
              fontSize: "0.9rem", outline: "none"
            }}
          />
          <input
            type="number"
            placeholder="Đến giá..."
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            style={{
              width: "50%", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text)", padding: "0.6rem 0.75rem",
              fontSize: "0.9rem", outline: "none"
            }}
          />
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {PREDEFINED_TAGS.map((tag) => {
          const active = filters.tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: 999,
                fontSize: "0.85rem",
                fontWeight: active ? 600 : 400,
                background: active ? "rgba(146,64,14,0.2)" : "#f5f5f4",
                color: active ? "var(--accent)" : "var(--text)",
                border: `1px solid ${active ? "rgba(146,64,14,0.4)" : "transparent"}`,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
