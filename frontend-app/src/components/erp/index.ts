export * from "./primitives";
export * from "./ControlPanel";
export * from "./ListView";
export * from "./RecordList";
export * from "./FormView";

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
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
