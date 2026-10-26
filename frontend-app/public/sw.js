/* TD Coffee — Service Worker cho Web Push (thông báo nhân sự khi đã đóng tab)
 * Đăng ký ở src/lib/push.ts. Chỉ xử lý push + bấm thông báo — không cache trang (không làm offline).
 * Payload từ backend-node/src/lib/webPush.ts:
 *   { id, title, body, link, severity, type }  hoặc  { recall: id } (quản lý thu hồi)
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "TD Coffee", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      if (data.recall) {
        const list = await self.registration.getNotifications({ tag: `td-${data.recall}` });
        list.forEach((n) => n.close());
        return;
      }
      // App đang mở và đang nhìn thấy → app tự hiện thẻ nổi / hộp thoại, không hiện trùng
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === "visible")) return;
      const important = data.severity === "IMPORTANT";
      await self.registration.showNotification(important ? `Quan trọng: ${data.title}` : data.title || "TD Coffee", {
        body: data.body || "",
        icon: "/logo-td-coffee.png",
        badge: "/logo-td-coffee.png",
        tag: data.id ? `td-${data.id}` : undefined,
        // Thông báo quan trọng ở lại tới khi người dùng bấm
        requireInteraction: important,
        renotify: important,
        data: { id: data.id, link: data.link || "/app/overview/notifications" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/app/overview/notifications";
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Có tab app đang mở → đưa lên và chuyển trang; không thì mở tab mới
      const app = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (app) {
        await app.focus();
        if ("navigate" in app) return app.navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    })(),
  );
});
