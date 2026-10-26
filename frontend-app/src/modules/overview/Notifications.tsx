import { useState } from "react";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useNotifications } from "../../lib/notifications";
import { Button, EmptyState, PageHeader } from "../../components/erp";
import { NotificationRow, useOpenNotification } from "../../components/erp/Notifications";

/** Tổng quan › Thông báo — hộp thư đầy đủ của tôi */
export function NotificationsPage() {
  const { items, unread, hasMore, loadMore, markAllRead, loading, browser, enableBrowser, disableBrowser, pushActive } = useNotifications();
  const open = useOpenNotification();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState(false);
  const list = tab === "unread" ? items.filter((n) => !n.readAt) : items;

  return (
    <div className="o-dash">
      <PageHeader
        title="Thông báo"
        description={unread ? `${unread} thông báo chưa đọc` : "Bạn đã đọc hết thông báo"}
        actions={
          <>
            {(browser === "default" || browser === "off") && <Button icon={BellRing} onClick={() => void enableBrowser()}>Bật thông báo trên thiết bị này</Button>}
            {unread > 0 && <Button icon={CheckCheck} onClick={markAllRead}>Đánh dấu tất cả đã đọc</Button>}
          </>
        }
      />
      {browser === "denied" && (
        <p className="o-muted" style={{ margin: 0 }}>Trình duyệt đang chặn thông báo của trang này — mở cài đặt trang (biểu tượng ổ khóa) để cho phép.</p>
      )}
      {browser === "install" && (
        <p className="o-muted" style={{ margin: 0 }}>iPhone/iPad: bấm Chia sẻ → “Thêm vào MH chính”, rồi mở app từ màn hình chính để nhận thông báo khi đã đóng app.</p>
      )}
      {browser === "on" && (
        <div className="o-notif-device">
          <BellRing size={16} aria-hidden />
          <span>
            {pushActive
              ? "Thiết bị này nhận thông báo cả khi đã đóng tab (hệ điều hành hiện thông báo)."
              : "Thiết bị này chỉ nhận thông báo khi trình duyệt đang mở trang (trình duyệt không hỗ trợ Web Push hoặc chưa dùng HTTPS)."}
          </span>
          <Button variant="link" size="sm" onClick={() => void disableBrowser()}>Tắt trên thiết bị này</Button>
        </div>
      )}
      <div className="o-seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Tất cả</button>
        <button type="button" role="tab" aria-selected={tab === "unread"} className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>Chưa đọc{unread ? ` (${unread})` : ""}</button>
      </div>
      {!list.length ? (
        <EmptyState icon={Bell} title={loading ? "Đang tải…" : tab === "unread" ? "Không còn thông báo chưa đọc" : "Chưa có thông báo nào"} hint="Thông báo của quản lý và hệ thống (hết món, đơn giao mới, đơn từ…) sẽ hiện ở đây." />
      ) : (
        <section className="o-dcard o-notif-page">
          <ul className="o-notif-list is-page">{list.map((n) => <NotificationRow key={n.id} n={n} onOpen={open} />)}</ul>
          {hasMore && (
            <div style={{ textAlign: "center", paddingTop: 12 }}>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await loadMore().catch(() => {});
                  setBusy(false);
                }}
              >
                {busy ? "Đang tải…" : "Xem thêm"}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
