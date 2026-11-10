import { useEffect, useState } from "react";
import { Copy, Phone, X } from "lucide-react";
import { api, apiBase } from "../../lib/api";
import { useCustomerStore } from "../../lib/customerStore";
import { ChatWidget } from "../ChatWidget";
import { ContactStack, type PublicContact } from "./ContactStack";

const COLLAPSE_KEY = "fc.collapsed";

function readCollapsed() {
  try {
    return sessionStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Điện thoại / máy tính bảng (gọi được bằng tel:) */
const canDial = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Cụm nút liên hệ nổi góc phải trang khách: Gọi ngay, Zalo, Messenger… (theo cấu hình quản trị) và nút Chat ở cuối.
 * Link lấy từ GET /api/contact-buttons theo chi nhánh khách đang chọn — không có link nào trong code.
 */
export function FloatingContact() {
  const { storeId } = useCustomerStore();
  const [buttons, setButtons] = useState<PublicContact[]>([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [chatOpen, setChatOpen] = useState(false);
  const [dial, setDial] = useState<PublicContact | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<PublicContact[]>(`/api/contact-buttons${storeId ? `?storeId=${storeId}` : ""}`)
      .then((rows) => !cancelled && setButtons(rows))
      .catch(() => !cancelled && setButtons([]));
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  function toggle() {
    setCollapsed((v) => {
      try {
        sessionStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  }

  function log(b: PublicContact) {
    void fetch(`${apiBase()}/api/contact-clicks`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buttonId: b.id, storeId }),
    }).catch(() => undefined);
  }

  function press(b: PublicContact) {
    log(b);
    if (b.type !== "PHONE") return; // link mở tab mới theo href
    if (canDial()) window.location.href = b.href;
    else {
      setCopied(false);
      setDial(b);
    }
  }

  async function copy(num: string) {
    try {
      await navigator.clipboard.writeText(num);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <ContactStack
        buttons={buttons}
        collapsed={collapsed}
        hideButtons={chatOpen}
        onToggle={toggle}
        onPress={(b) => press(b)}
        chat={<ChatWidget embedded onOpenChange={setChatOpen} />}
      />
      {dial && (
        <div className="fc-dial" role="dialog" aria-label="Số điện thoại của quán">
          <button type="button" className="fc-dial-x" onClick={() => setDial(null)} aria-label="Đóng"><X size={16} aria-hidden /></button>
          <div className="fc-dial-label">{dial.label}</div>
          <div className="fc-dial-num">{dial.phoneDisplay}</div>
          <div className="fc-dial-row">
            <button type="button" className="fc-dial-btn" onClick={() => void copy(dial.phone ?? "")}>
              <Copy size={15} aria-hidden /> {copied ? "Đã sao chép" : "Sao chép số"}
            </button>
            <a className="fc-dial-btn ghost" href={dial.href}><Phone size={15} aria-hidden /> Gọi bằng ứng dụng</a>
          </div>
        </div>
      )}
    </>
  );
}
