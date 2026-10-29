/* eTricks service worker: shows system notifications sent by the server (Web Push), even when the app is closed. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'eTricks', body: event.data ? event.data.text() : '' }; }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) w.postMessage({ type: 'push', id: data.id });
    // If the person is looking at eTricks right now, the page shows its own banner instead.
    if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(data.title || 'eTricks', {
      body: data.body || '',
      icon: '/img/icon-192.png',
      badge: '/img/favicon.png',
      tag: `etricks-${data.id || Date.now()}`, // same id never shows twice
      data: { link: data.link || '#/dashboard' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '#/dashboard';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if ('focus' in w) { await w.focus(); w.postMessage({ type: 'open', link }); return; }
    }
    await self.clients.openWindow(`/${link}`);
  })());
});
