// app.js — shared code used by every page (loaded first on every page).
//
// HOW A PAGE WORKS (the same pattern as the BentaTrack prototype):
//
//   Each page file in /js/pages/ calls App.mount({ title, role, render, after }).
//     1. App.mount() asks the server who is logged in (GET /api/auth/me).
//        Not logged in -> the server answers 401 and we go to /login.
//     2. It draws the header and the navigation menu for that user's role.
//     3. It calls render(user): the page returns its HTML (forms, empty tables).
//     4. It calls after(user): the page loads its data from the API and
//        connects its buttons and forms.
//
// The browser never talks to the database. It only calls the backend API with
// fetch(); the SERVER checks the login and the role on every request, so hiding
// a menu link here is only for convenience, not for security.

const App = {
  user: null,

  // ---------- 1. Calling the backend API ----------

  // Sends a request and returns the JSON answer. Throws an Error with the
  // server's friendly message when something fails.
  async api(method, url, body) {
    const options = { method, headers: {} };
    if (body instanceof FormData) {
      options.body = body; // file uploads: the browser sets the content type
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      throw new Error('Cannot reach the server. Check that it is running and you are connected to the internet.');
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !url.startsWith('/api/auth/login')) {
      window.location.href = '/login'; // not logged in, or the session expired
      throw new Error(data.error || 'Please log in.');
    }
    if (!response.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  },

  get(url) { return App.api('GET', url); },
  post(url, body = {}) { return App.api('POST', url, body); },
  put(url, body = {}) { return App.api('PUT', url, body); },

  // ---------- 2. Navigation menu for each role ----------
  // [address, label, badge name]. The badge shows a number from /api/notifications/counts.

  navLinks: {
    OWNER: [
      ['/dashboard', 'Dashboard'], ['/boarders', 'Boarders'], ['/rooms', 'Rooms'], ['/billing', 'Billing'],
      ['/payments', 'Payments'], ['/chat', 'Chat', 'messages'], ['/notifications', 'Notifications', 'notifications'],
      ['/reports', 'Reports'], ['/profile', 'Profile'],
    ],
    BOARDER: [
      ['/dashboard', 'Dashboard'], ['/rooms', 'My Room'], ['/billing', 'My Bills'], ['/payments', 'Pay & History'],
      ['/chat', 'Chat with Owner', 'messages'], ['/notifications', 'Notifications', 'notifications'], ['/profile', 'My Profile'],
    ],
  },

  // ---------- 3. Drawing a page ----------

  // Used by every page that needs a login.
  //   title    : heading of the page (also the browser tab title)
  //   subtitle : one line under the heading
  //   role     : 'OWNER', 'BOARDER' or 'ANY' — who may open the page
  //   render   : function(user) that returns the page's HTML
  //   after    : async function(user) that loads data and connects the buttons
  async mount({ title, subtitle = '', role = 'ANY', render, after }) {
    document.title = `${title} · Dan-New Boarding House`;
    try {
      App.user = await App.get('/api/auth/me');
    } catch (error) {
      return; // App.api() already sent the browser to /login
    }
    const allowed = role === 'ANY' || App.user.role === role;
    document.body.innerHTML = `
      <header id="site-header"></header>
      <main class="container" id="page">
        <h1 id="page-title">${App.escape(title)}</h1>
        <p class="subtitle" id="page-subtitle">${App.escape(subtitle)}</p>
        <div id="message" hidden></div>
        ${allowed ? render(App.user) : App.noAccessHtml()}
      </main>`;
    App.buildHeader();
    App.refreshBadges();
    setInterval(App.refreshBadges, 30000);
    App.push.register(); // service worker, so push notifications can be shown and clicked
    if (!allowed) return;
    try {
      if (after) await after(App.user);
    } catch (error) {
      App.showError(error);
    }
    // Links like /boarders#add jump to that part of the page once it is drawn.
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
  },

  // Used by the pages that do NOT need a login (Log In and First-Time Setup).
  mountPublic({ title, render, after }) {
    document.title = `${title} · Dan-New Boarding House`;
    document.body.innerHTML = `<main class="auth-page"><section class="card auth-card">${render()}</section></main>`;
    if (after) after().catch(App.showError);
  },

  // Shown if someone opens a page meant for the other role. (The server already
  // redirects in that case; this is a second, friendly check.)
  noAccessHtml() {
    return `<section class="card"><h2>No access</h2>
      <p>This page is not available for your account.</p>
      <a class="button" href="/dashboard">Go to my dashboard</a></section>`;
  },

  buildHeader() {
    const header = document.getElementById('site-header');
    const current = window.location.pathname;
    const links = App.navLinks[App.user.role].map(([href, label, badge]) => {
      const badgeHtml = badge ? ` <span class="badge" data-badge="${badge}" hidden></span>` : '';
      const active = current === href ? ' class="active" aria-current="page"' : '';
      return `<a href="${href}"${active}>${label}${badgeHtml}</a>`;
    }).join('');
    header.innerHTML = `
      <div class="header-bar">
        <a class="brand" href="/dashboard">Dan-New <span>Boarding House</span></a>
        <button type="button" class="menu-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>
        <div class="user-box">
          <span class="user-name">${App.escape(App.user.fullName)} <small>${App.user.role === 'OWNER' ? 'Owner' : 'Boarder'}</small></span>
          <button type="button" class="button small ghost" id="logout-button">Log out</button>
        </div>
      </div>
      <nav id="main-nav" class="main-nav" aria-label="Main">${links}</nav>`;
    header.querySelector('#logout-button').addEventListener('click', App.logout);
    // Phones: the "Menu" button opens and closes the links as a column.
    header.querySelector('.menu-toggle').addEventListener('click', (event) => {
      const nav = document.getElementById('main-nav');
      const open = nav.classList.toggle('open');
      event.currentTarget.setAttribute('aria-expanded', String(open));
    });
  },

  // Small orange numbers in the menu (unread messages and notifications).
  async refreshBadges() {
    try {
      const counts = await App.get('/api/notifications/counts');
      document.querySelectorAll('[data-badge]').forEach((badge) => {
        const value = counts[badge.dataset.badge] || 0;
        badge.textContent = value;
        badge.hidden = value === 0;
      });
    } catch (error) { /* badges are optional; ignore errors */ }
  },

  async logout() {
    if (!App.confirm('Log out of Dan-New Boarding House?')) return;
    await App.post('/api/auth/logout');
    window.location.href = '/login';
  },

  // ---------- 4. Messages and confirmations ----------

  // Shows a green (success) or red (error) message under the page heading.
  showMessage(text, type = 'success') {
    const box = document.getElementById('message');
    box.className = `message ${type}`;
    box.textContent = text;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    clearTimeout(App.messageTimer);
    if (type === 'success') App.messageTimer = setTimeout(() => { box.hidden = true; }, 6000);
  },

  showError(error) {
    App.showMessage(error.message || String(error), 'error');
  },

  confirm(question) {
    return window.confirm(question);
  },

  // Runs an action, shows its result message, and disables the button meanwhile.
  async run(button, action) {
    if (button) button.disabled = true;
    try {
      const result = await action();
      if (result && result.message) App.showMessage(result.message);
      return result;
    } catch (error) {
      App.showError(error);
      return null;
    } finally {
      if (button) button.disabled = false;
    }
  },

  // ---------- 5. Formatting helpers ----------

  // Always escape text from the database before putting it into HTML (prevents XSS).
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  money(value) {
    if (value === null || value === undefined) return '—';
    return '₱' + Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  // "2026-10-18 14:05:00" -> "Oct 18, 2026, 2:05 PM"
  dateTime(text) {
    if (!text) return '—';
    const date = new Date(text.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? text : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  },

  date(text) {
    if (!text) return '—';
    const date = new Date(text + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('en-PH', { dateStyle: 'medium' });
  },

  today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  },

  statusLabels: {
    UNPAID: 'Unpaid', PAID: 'Paid', OVERDUE: 'Overdue',
    FOR_VERIFICATION: 'For Verification', APPROVED: 'Approved', REJECTED: 'Rejected', PENDING: 'Pending',
    ACTIVE: 'Active', INACTIVE: 'Inactive', Available: 'Available', Full: 'Full', Inactive: 'Inactive',
    'Up to date': 'Up to date', Unpaid: 'Unpaid', Overdue: 'Overdue',
  },

  // Colored status label, e.g. <span class="status status-overdue">Overdue</span>
  status(value) {
    const label = App.statusLabels[value] || value;
    const css = String(value).toLowerCase().replace(/[^a-z]+/g, '-');
    return `<span class="status status-${css}">${App.escape(label)}</span>`;
  },

  // Fills a <tbody> using a function that turns one record into a <tr>.
  fillTable(tbody, rows, rowToHtml, emptyText = 'No records found.') {
    const columns = tbody.closest('table').querySelectorAll('thead th').length || 1;
    tbody.innerHTML = rows.length
      ? rows.map(rowToHtml).join('')
      : `<tr><td colspan="${columns}" class="empty">${App.escape(emptyText)}</td></tr>`;
  },

  // Reads a value from the address bar, e.g. ?billId=5
  param(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  // Turns a <form> into a plain object: { fieldName: value }
  formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  },

  // ---------- 6. Push notifications (FR-26, FR-27) ----------
  // A push notification appears on the phone or computer even when the website is
  // closed. The browser's "service worker" (/service-worker.js) receives it from the
  // server, shows it, and opens the related page when it is clicked (FR-28).
  push: {
    supported() {
      return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    // Registers the service worker on every page, and re-links this browser to the
    // logged-in account (in case a different person logged in on the same browser).
    async register() {
      if (!App.push.supported()) return;
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') {
          await App.post('/api/push/subscribe', subscription.toJSON());
        }
      } catch (error) { /* push is optional; in-app notifications still work */ }
    },

    async isOn() {
      if (!App.push.supported()) return false;
      const registration = await navigator.serviceWorker.ready;
      return Boolean(await registration.pushManager.getSubscription());
    },

    // Called only when the user presses "Turn on push notifications".
    async turnOn() {
      if (!App.push.supported()) throw new Error('This browser does not support push notifications.');
      const { publicKey } = await App.get('/api/push/public-key');
      if (!publicKey) throw new Error('Push notifications are not set up on the server yet (run "npm run setup:env").');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: App.push.keyToBytes(publicKey),
      });
      return App.post('/api/push/subscribe', subscription.toJSON());
    },

    async turnOff() {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return { message: 'Push notifications are already off on this device.' };
      await subscription.unsubscribe();
      return App.post('/api/push/unsubscribe', { endpoint: subscription.endpoint });
    },

    // The server's public key is sent as base64url text; the browser needs bytes.
    keyToBytes(base64) {
      const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    },
  },
};
