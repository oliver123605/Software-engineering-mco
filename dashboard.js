// dashboard.js — one Dashboard page for both roles.
//   Owner  : totals for boarders, rooms, bills and payments, the "This month" box
//            (billed vs approved vs still unpaid) and the unpaid/overdue accounts.
//   Boarder: own room, rent share, balance and the bills still to pay.
// API used: GET /api/dashboard/owner[?period=2026-11] (Owner only), GET /api/dashboard/boarder (Boarder only),
//           POST /api/notifications/run-check (Owner button)

// One summary box. Clicking it opens the related page.
function stat(href, value, label, css = '') {
  return `<a class="stat ${css}" href="${href}"><span class="value">${value}</span><span class="label">${label}</span></a>`;
}

// ---------------- Owner ----------------

const ownerHtml = `
  <div class="stats" id="stats"></div>

  <section class="card">
    <div class="section-head">
      <h2 id="month-title">This month</h2>
      <div class="month-picker">
        <label for="month">Billing month</label>
        <input type="month" id="month">
      </div>
    </div>
    <div class="stats" id="month-stats"></div>
    <div class="progress" aria-hidden="true"><span id="month-bar"></span></div>
    <p class="hint" id="month-hint"></p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Boarder</th><th>Room</th><th class="number">Billed</th><th class="number">Approved</th>
          <th class="number">Waiting for review</th><th class="number">Still unpaid</th><th>Status</th></tr></thead>
        <tbody id="month-body"></tbody>
        <tfoot id="month-foot"></tfoot>
      </table>
    </div>
  </section>

  <section class="card">
    <div class="section-head">
      <h2>Unpaid and overdue accounts</h2>
      <div class="button-row">
        <button type="button" class="secondary small" id="run-check">Run reminder / overdue check now</button>
        <a class="button small" href="/billing">Open Billing</a>
      </div>
    </div>
    <p class="hint">The server checks due dates automatically every hour. The button runs the same check immediately (useful for demonstrations).</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Boarder</th><th>Room</th><th>Period</th><th>Due date</th><th class="number">Balance</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="unpaid-body"></tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>Quick actions</h2>
    <div class="button-row">
      <a class="button" href="/boarders#add">Create boarder account</a>
      <a class="button secondary" href="/rooms">Manage rooms</a>
      <a class="button secondary" href="/billing">Generate monthly bills</a>
      <a class="button secondary" href="/payments">Review payment proofs</a>
      <a class="button secondary" href="/reports">Reports</a>
    </div>
  </section>`;

// "October 2026" from "2026-10".
function monthName(period) {
  return new Date(`${period}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

// The "This month" box. Billed = Approved + Still unpaid, for every bill.
// "Waiting for review" is money a boarder uploaded that the Owner has not accepted yet;
// it is still counted in "Still unpaid" until it is accepted.
function showMonth(m) {
  document.getElementById('month-title').textContent = `Billing for ${monthName(m.period)}`;
  document.getElementById('month').value = m.period;
  document.getElementById('month-stats').innerHTML = [
    stat(`/billing?billingPeriod=${m.period}`, App.money(m.totalBilled), `Total billed (${m.billCount} bill${m.billCount === 1 ? '' : 's'})`),
    stat('/payments?status=APPROVED', App.money(m.totalApproved), 'Approved GCash payments'),
    stat('/payments?status=FOR_VERIFICATION', App.money(m.totalWaiting), 'Waiting for your review', m.totalWaiting ? 'warn' : ''),
    stat(`/billing?billingPeriod=${m.period}`, App.money(m.totalUnpaid), 'Still unpaid this month', m.totalUnpaid ? 'alert' : ''),
    stat(`/billing?billingPeriod=${m.period}`, `${m.paidCount} / ${m.billCount}`, 'Bills fully paid'),
  ].join('');
  document.getElementById('month-bar').style.width = `${m.percentCollected}%`;
  document.getElementById('month-hint').textContent = m.billCount
    ? `${m.percentCollected}% collected: ${App.money(m.totalApproved)} approved out of ${App.money(m.totalBilled)} billed.`
    : 'No bills for this month yet. Use Billing → Generate bills.';

  App.fillTable(document.getElementById('month-body'), m.bills, (b) => `
    <tr>
      <td>${App.escape(b.boarderName)}</td>
      <td>${App.escape(b.roomName)}</td>
      <td class="number">${App.money(b.amount)}</td>
      <td class="number">${App.money(b.approved)}</td>
      <td class="number">${b.waiting ? App.money(b.waiting) : '—'}</td>
      <td class="number">${App.money(b.balance)}</td>
      <td>${App.status(b.status)}</td>
    </tr>`, 'No bills for this month.');
  document.getElementById('month-foot').innerHTML = m.billCount ? `
    <tr>
      <th colspan="2">Total</th>
      <th class="number">${App.money(m.totalBilled)}</th>
      <th class="number">${App.money(m.totalApproved)}</th>
      <th class="number">${App.money(m.totalWaiting)}</th>
      <th class="number">${App.money(m.totalUnpaid)}</th>
      <th></th>
    </tr>` : '';
}

async function loadOwnerDashboard() {
  const period = document.getElementById('month').value;
  const d = await App.get(`/api/dashboard/owner${period ? `?period=${encodeURIComponent(period)}` : ''}`);
  document.getElementById('stats').innerHTML = [
    stat('/boarders', d.totalBoarders, 'Active boarders'),
    stat('/rooms', d.availableSpaces, `Available spaces (in ${d.roomsWithSpace} room${d.roomsWithSpace === 1 ? '' : 's'})`),
    stat('/rooms', `${d.occupiedRooms} / ${d.totalRooms}`, 'Occupied rooms'),
    stat('/billing?status=UNPAID', d.unpaidBills, 'Unpaid bills', d.unpaidBills ? 'warn' : ''),
    stat('/billing?status=OVERDUE', d.overdueBills, 'Overdue bills', d.overdueBills ? 'alert' : ''),
    stat('/payments', d.paymentsAwaitingReview, 'Payment proofs awaiting review', d.paymentsAwaitingReview ? 'warn' : ''),
    stat('/rooms#requests', d.pendingRoomRequests, 'Pending room-change requests', d.pendingRoomRequests ? 'warn' : ''),
    stat('/chat', d.unreadMessages, 'Unread messages'),
    stat('/reports', App.money(d.outstandingTotal), 'Still unpaid (all months)'),
  ].join('');
  showMonth(d.month);

  App.fillTable(document.getElementById('unpaid-body'), d.unpaidAccounts, (a) => `
    <tr>
      <td>${App.escape(a.boarderName)}</td>
      <td>${App.escape(a.roomName)}</td>
      <td>${App.escape(a.billingPeriod)}</td>
      <td>${App.date(a.dueDate)}</td>
      <td class="number">${App.money(a.balance)}</td>
      <td>${App.status(a.status)}</td>
      <td><div class="button-row">
        <a class="button small secondary" href="/billing?billId=${a.billId}">View bill</a>
        <a class="button small secondary" href="/chat?boarderId=${a.boarderId}">Chat</a>
      </div></td>
    </tr>`, 'All bills are paid.');
}

async function setUpOwner() {
  await loadOwnerDashboard();
  document.getElementById('month').addEventListener('change', () => loadOwnerDashboard().catch(App.showError));
  document.getElementById('run-check').addEventListener('click', async (event) => {
    await App.run(event.currentTarget, () => App.post('/api/notifications/run-check'));
    loadOwnerDashboard().catch(App.showError);
  });
}

// ---------------- Boarder ----------------

const boarderHtml = `
  <div class="stats" id="stats"></div>

  <section class="card">
    <div class="section-head">
      <h2>Bills to pay</h2>
      <a class="button small secondary" href="/billing">All my bills</a>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Period</th><th>Room</th><th>Due date</th><th class="number">Balance</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="bills-body"></tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>Need something?</h2>
    <div class="button-row">
      <a class="button" href="/payments">Upload GCash payment proof</a>
      <a class="button secondary" href="/chat">Chat with the Owner</a>
      <a class="button secondary" href="/rooms">Request a room change</a>
      <a class="button secondary" href="/notifications">Turn on payment reminders</a>
      <a class="button secondary" href="/profile">Edit my profile</a>
    </div>
  </section>`;

async function setUpBoarder() {
  const d = await App.get('/api/dashboard/boarder');
  document.getElementById('page-title').textContent = `Welcome, ${d.fullName}`;
  document.getElementById('page-subtitle').textContent = 'Your room, bills and payments at a glance.';
  document.getElementById('stats').innerHTML = [
    stat('/rooms', App.escape(d.roomName || 'No room'), 'My room'),
    stat('/rooms', App.money(d.rentShare), 'My current monthly rent share'),
    stat('/billing', App.money(d.outstandingBalance), 'Outstanding balance', d.outstandingBalance > 0 ? 'warn' : ''),
    stat('/payments', d.paymentsAwaitingReview, 'Payments awaiting Owner review'),
    stat('/notifications', d.unreadNotifications, 'Unread notifications'),
    stat('/chat', d.unreadMessages, 'Unread messages'),
  ].join('');
  App.fillTable(document.getElementById('bills-body'), d.openBills, (b) => `
    <tr>
      <td>${App.escape(b.billingPeriod)}</td>
      <td>${App.escape(b.roomName)}</td>
      <td>${App.date(b.dueDate)}</td>
      <td class="number">${App.money(b.balance)}</td>
      <td>${App.status(b.status)}${b.pendingPayments ? ' ' + App.status('FOR_VERIFICATION') : ''}</td>
      <td>${b.pendingPayments ? '<span class="muted">Waiting for Owner</span>' : `<a class="button small" href="/payments?billId=${b.id}">Pay / upload proof</a>`}</td>
    </tr>`, 'You have no unpaid bills.');
}

// ---------------- The page ----------------

App.mount({
  title: 'Dashboard',
  subtitle: 'Today\'s summary of boarders, rooms, bills and payments.',
  role: 'ANY',
  render: (user) => (user.role === 'OWNER' ? ownerHtml : boarderHtml),
  after: (user) => (user.role === 'OWNER' ? setUpOwner() : setUpBoarder()),
});
