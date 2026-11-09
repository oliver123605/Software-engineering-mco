// service-worker.js — runs in the background of the browser, even when the website is closed.
// It has only two jobs (FR-26, FR-27, FR-28):
//   1. "push": the server sent a notification -> show it on the screen.
//   2. "notificationclick": the user clicked it -> open the related page of the website.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Dan-New Boarding House', {
    body: data.body || '',
    data: { url: data.url || '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only open addresses inside this website.
  const url = new URL(event.notification.data.url, self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin + '/notifications';
  event.waitUntil(self.clients.openWindow(target));
});
