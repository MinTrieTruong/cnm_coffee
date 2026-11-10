import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import type { BadgeKey } from "../../lib/navConfig";
import { matchRanges, recentEntries, searchLeaves, type SearchEntry, type SearchIndex } from "../../apps/sidebarSearch";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
export const SEARCH_SHORTCUT = IS_MAC ? "⌘ K" : "Ctrl K";

/** Đang gõ trong ô nhập / vùng soạn thảo → phím "/" là chữ, không phải phím tắt */
const isTyping = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

/** Nhãn với phần khớp tô đậm (so khớp trên chữ bỏ dấu, hiển thị chữ gốc) */
function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = query ? matchRanges(text, query) : [];
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], i) => {
    if (s > at) out.push(text.slice(at, s));
    out.push(<mark key={i}>{text.slice(s, e)}</mark>);
    at = e;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

type CoreProps = {
  index: SearchIndex;
  badges: Partial<Record<BadgeKey, number>>;
  currentKey: string;
  /** side: thả xuống dưới ô (sidebar) · dialog: bảng tìm nhanh · sheet: sheet "Thêm" trên điện thoại */
  variant: "side" | "dialog" | "sheet";
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** Báo chữ đang gõ (sheet: có chữ thì ẩn danh sách nhóm) */
  onQueryChange?: (q: string) => void;
  /** Đã chọn một mục (đóng bảng / sheet) */
  onPicked?: () => void;
  /** Esc khi ô đang trống (mặc định: bỏ focus) */
  onEscapeEmpty?: () => void;
};

/**
 * Lõi ô "Tìm chức năng…": ô nhập + danh sách kết quả (combobox ARIA). Dùng chung cho sidebar, bảng tìm nhanh, sheet điện thoại.
 * ↑ ↓ chọn dòng (vòng lại), Enter mở (mặc định dòng đầu), Esc lần 1 xóa chữ, lần 2 bỏ focus. Không đụng tới menu bên dưới.
 */
export function SearchCore({ index, badges, currentKey, variant, inputRef, autoFocus, onQueryChange, onPicked, onEscapeEmpty }: CoreProps) {
  const navigate = useNavigate();
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const listId = useId();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(!!autoFocus);
  const [active, setActive] = useState(0);

  const results = useMemo(() => searchLeaves(index, q), [index, q]);
  // Chưa gõ gì: tối đa 5 mục mở gần đây (trừ trang đang mở); sheet điện thoại vẫn hiện danh sách nhóm như cũ
  const recent = useMemo(() => (q || variant === "sheet" || !focused ? [] : recentEntries(index).filter((e) => e.leaf.key !== currentKey)), [index, q, variant, focused, currentKey]);
  const rows: SearchEntry[] = q ? results : recent;
  const open = variant === "dialog" ? true : variant === "sheet" ? !!q : focused && (!!q || recent.length > 0);

  const setQuery = (v: string) => {
    setQ(v);
    setActive(0);
    onQueryChange?.(v);
  };

  const pick = (e: SearchEntry) => {
    setQuery("");
    ref.current?.blur();
    navigate(e.leaf.to);
    onPicked?.();
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!rows.length) return;
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % rows.length : (a - 1 + rows.length) % rows.length));
    } else if (e.key === "Enter") {
      const hit = rows[active] ?? rows[0];
      if (hit) {
        e.preventDefault();
        pick(hit);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (q) return setQuery("");
      if (onEscapeEmpty) onEscapeEmpty();
      else ref.current?.blur();
    }
  };

  const optionId = (i: number) => `${listId}-o${i}`;
  const badgeOf = (e: SearchEntry) => (e.leaf.badge ? badges[e.leaf.badge] ?? 0 : 0);

  return (
    <div className={`o-side-search is-${variant}`}>
      <div className="o-side-search-box">
        <Search size={16} strokeWidth={1.75} className="o-side-search-icon" aria-hidden />
        <input
          ref={ref}
          className="o-side-search-input"
          type="text"
          role="combobox"
          aria-label="Tìm chức năng"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows.length ? optionId(Math.min(active, rows.length - 1)) : undefined}
          placeholder="Tìm chức năng…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {q ? (
          <button type="button" className="o-side-search-clear" aria-label="Xóa chữ" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); ref.current?.focus(); }}>
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          variant !== "sheet" && <kbd className="o-side-search-kbd" aria-hidden>{SEARCH_SHORTCUT}</kbd>
        )}
      </div>

      {open && (
        <div className="o-side-search-pop">
          {!q && recent.length > 0 && <div className="o-side-search-title">Gần đây</div>}
          {q && !rows.length ? (
            <div className="o-side-search-empty" role="status">
              <div>Không tìm thấy chức năng nào cho “{q.trim()}”</div>
              <div className="o-side-search-hint">Thử gõ không dấu hoặc từ ngắn hơn</div>
            </div>
          ) : !q && !rows.length ? (
            <div className="o-side-search-empty"><div className="o-side-search-hint">Gõ tên màn hình, VD: “bảng lương”, “voucher”, “mã qr”</div></div>
          ) : null}
          <ul id={listId} role="listbox" aria-label="Kết quả tìm chức năng" className="o-side-search-list" hidden={!rows.length}>
            {rows.map((e, i) => {
              const Icon = e.leaf.icon;
              const n = badgeOf(e);
              const sel = i === Math.min(active, rows.length - 1);
              return (
                <li
                  key={e.leaf.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={sel}
                  className={sel ? "o-side-search-opt is-active" : "o-side-search-opt"}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onMouseMove={() => active !== i && setActive(i)}
                  onClick={() => pick(e)}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <span className="o-side-search-label"><Highlight text={e.leaf.label} query={q} /></span>
                  {e.leaf.key === currentKey && <span className="o-side-search-here" title="Đang mở"><span aria-hidden />Đang mở</span>}
                  {n > 0 && <span className="o-side-badge">{n > 99 ? "99+" : n}</span>}
                  <span className="o-side-search-group">{e.groupLabel}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Bảng tìm nhanh giữa màn hình (sidebar thu gọn / trang toàn màn hình). Esc / bấm nền mờ → đóng, trả focus về chỗ cũ */
function QuickSearch({ onClose, ...core }: Omit<CoreProps, "variant" | "autoFocus" | "onPicked" | "onEscapeEmpty"> & { onClose: () => void }) {
  const back = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus ô khi mở, trả focus về chỗ cũ khi đóng (StrictMode chạy effect 2 lần → focus lại ô ở lần mount sau)
  useEffect(() => {
    const prev = back.current;
    inputRef.current?.focus();
    return () => {
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
    };
  }, []);
  return createPortal(
    <div className="o-side-search-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="o-side-search-dialog" role="dialog" aria-modal="true" aria-label="Tìm chức năng">
        <SearchCore {...core} variant="dialog" inputRef={inputRef} autoFocus onPicked={onClose} onEscapeEmpty={onClose} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * Ô "Tìm chức năng…" ở đầu sidebar desktop (dưới chọn chi nhánh). Thu gọn: nút kính lúp mở bảng tìm nhanh.
 * Phím tắt toàn khu quản trị: Ctrl+K / ⌘+K; "/" (bỏ qua khi đang gõ, tắt ở trang có ô nhập riêng như POS / KDS).
 */
export function SidebarSearch({
  index,
  badges,
  currentKey,
  collapsed,
  disableSlash,
}: {
  index: SearchIndex;
  badges: Partial<Record<BadgeKey, number>>;
  currentKey: string;
  collapsed: boolean;
  disableSlash?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [quick, setQuick] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !disableSlash && !isTyping(document.activeElement);
      if (!combo && !slash) return;
      // Sidebar ẩn (điện thoại) → không có ô tìm để focus
      if (window.matchMedia("(max-width: 768px)").matches) return;
      e.preventDefault();
      if (collapsed) setQuick(true);
      else inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, disableSlash]);

  useEffect(() => setQuick(false), [currentKey]);

  return (
    <>
      {collapsed ? (
        <button type="button" className="o-side-search-btn" onClick={() => setQuick(true)} aria-label={`Tìm chức năng (${SEARCH_SHORTCUT})`} title={`Tìm chức năng (${SEARCH_SHORTCUT})`}>
          <Search size={18} strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <SearchCore index={index} badges={badges} currentKey={currentKey} variant="side" inputRef={inputRef} />
      )}
      {quick && <QuickSearch index={index} badges={badges} currentKey={currentKey} onClose={() => setQuick(false)} />}
    </>
  );
}
