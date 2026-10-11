/* دوري — عامل الخدمة: يستقبل التنبيهات ويفتح التذكرة عند الضغط. لا تخزين مؤقّت للبيانات. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "دوري", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "دوري", {
      body: data.body || "",
      tag: data.tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 600],
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: data.url || "/" },
      dir: "auto",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname === url && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

// معالج fetch فارغ يجعل التطبيق قابلاً للتثبيت دون تخزين أيّ شيء
self.addEventListener("fetch", () => {});
