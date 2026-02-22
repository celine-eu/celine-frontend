import { api } from '$lib/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function flattenSubscription(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error('Push subscription is missing encryption keys.');
  return { endpoint: sub.endpoint, p256dh, auth };
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers not supported');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function requestAndSubscribeWebPush(): Promise<{ subscribed: boolean; message?: string }> {
  if (!('Notification' in window)) return { subscribed: false, message: 'Notifications not supported.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { subscribed: false, message: 'Permission not granted.' };

  const reg = await ensureServiceWorker();
  const { public_key } = await api.vapidPublicKey();

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await api.subscribeWebPush(flattenSubscription(existing));
    return { subscribed: true };
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(public_key)
  });
  await api.subscribeWebPush(flattenSubscription(sub));
  await api.enableNotifications();
  await reg.showNotification('Notifications enabled!', {
    body: 'You will now receive alerts from REC. If you change your mind, you can disable from the webapp or from the browser.',
    icon: '/favicon.png',
  });
  return { subscribed: true };
}

export async function unsubscribeWebPush(): Promise<{ ok: boolean }> {
  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  await sub.unsubscribe();
  await api.unsubscribeWebPush(sub.endpoint);
  return { ok: true };
}