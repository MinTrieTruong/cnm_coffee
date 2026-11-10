export * from "./primitives";
export * from "./ControlPanel";
export * from "./ListView";
export * from "./RecordList";
export * from "./FormView";
export * from "./dashboard";

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

/** Số lượng kho (có thể lẻ do trừ theo định mức): tối đa 2 chữ số thập phân */
export function fmtQty(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function fmtDate(s: string | null | undefined) {
  return s ? new Date(s).toLocaleDateString("vi-VN") : "";
}

export function fmtDateTime(s: string | null | undefined) {
  return s ? new Date(s).toLocaleString("vi-VN") : "";
}

export function errMsg(e: unknown, fallback = "Lỗi") {
  return e instanceof Error ? e.message : fallback;
}
