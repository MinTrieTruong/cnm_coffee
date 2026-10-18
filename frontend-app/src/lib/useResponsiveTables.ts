import { useEffect, type RefObject } from "react";

/**
 * Tự gắn `data-label` (lấy từ <th> cùng cột) cho mọi <td> trong vùng chứa,
 * và đánh dấu bảng dạng danh sách bằng class `table-auto-cards`
 * để CSS biến bảng thành dạng thẻ (card list) trên màn hình nhỏ.
 *
 * Bỏ qua (giữ cuộn ngang): bảng có `data-no-cards`, bảng lồng bảng,
 * bảng không có <thead> hoặc ít hơn 4 cột.
 */
export function useResponsiveTables(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const label = () => {
      root.querySelectorAll("table").forEach((table) => {
        if (table.hasAttribute("data-no-cards") || table.querySelector("table") || table.closest("td")) return;
        const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
        if (!headRow || headRow.cells.length < 4) return;

        const headers: string[] = [];
        Array.from(headRow.cells).forEach((th) => {
          const text = (th.textContent ?? "").trim();
          for (let i = 0; i < (th.colSpan || 1); i++) headers.push(text);
        });

        Array.from(table.tBodies).forEach((tbody) => {
          Array.from(tbody.rows).forEach((tr) => {
            let col = 0;
            Array.from(tr.cells).forEach((td) => {
              const text = headers[col] ?? "";
              if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text);
              if (td.colSpan > 1) td.classList.add("td-span");
              col += td.colSpan || 1;
            });
          });
        });
        if (!table.classList.contains("table-auto-cards")) table.classList.add("table-auto-cards");
      });
    };

    label();
    let frame = 0;
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(label);
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, [ref]);
}
