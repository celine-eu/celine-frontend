self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'REC Notification';
  const options = {
    body: data.body || 'Open the app to see details.',
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const url = data.url || '/';
  const token = data.click_tracking_token;
  const action = event.action || 'default';

  event.waitUntil((async () => {
    if (token) {
      try {
        await fetch('/api/notifications/track-click', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            action,
          }),
        });
      } catch (_) {
        // Best-effort tracking.
      }
    }

    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        if ('navigate' in client && client.url !== url) {
          await client.navigate(url);
        }
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
