import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Lịch sử điều hướng TRONG app (khác window.history: không tính các trang trước khi vào app).
 * Dùng để nút "Quay lại" không thoát khỏi app khi mở thẳng URL hoặc sau khi đăng xuất (replace).
 */
let stack: string[] = [];

/** Đặt một lần bên trong <BrowserRouter> */
export function useTrackAppHistory() {
  const loc = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type === "PUSH") stack.push(loc.key);
    else if (type === "REPLACE") stack[Math.max(0, stack.length - 1)] = loc.key;
    else {
      // POP (nút back/forward của trình duyệt hoặc lần tải đầu)
      const i = stack.indexOf(loc.key);
      stack = i >= 0 ? stack.slice(0, i + 1) : [loc.key];
    }
  }, [loc.key, type]);
}

export function canGoBackInApp() {
  return stack.length > 1;
}
