// billing.js — the Billing page (FR-16, FR-17, FR-18, FR-19).
//   Owner  : generate monthly bills, create or correct one bill, filter all bills.
//   Boarder: see own bills and their status; a bill becomes Paid only after the Owner accepts the GCash proof.
// API used: GET/POST /api/billing, POST /api/billing/generate, PUT /api/billing/:id,
//           GET /api/billing/rent-share/:boarderId, GET /api/boarders

const ownerHtml = `
  <div class="grid grid-2">
    <section class="card">
      <h2>Generate monthly bills</h2>
      <p class="hint">Creates one bill for every active boarder with a room, using each boarder's current rent share. Boarders already billed for the period are skipped.</p>
      <form id="generate-form" novalidate>
        <div class="form-row">
          <div class="field"><label for="gen-period">Billing period</label><input id="gen-period" name="billingPeriod" type="month" required></div>
          <div class="field"><label for="gen-due">Due date</label><input id="gen-due" name="dueDate" type="date" required></div>
        </div>
        <button type="submit" id="generate-button">Generate bills</button>
      </form>
    </section>

    <section class="card" id="bill-form-card">
      <h2 id="bill-form-title">Create one bill</h2>
      <form id="bill-form" novalidate>
        <input type="hidden" name="id" id="bill-id">
        <div class="field" id="boarder-field"><label for="bill-boarder">Boarder</label><select id="bill-boarder" name="boarderId" required></select>
          <div class="hint" id="share-hint"></div></div>
        <div class="form-row">
          <div class="field" id="period-field"><label for="bill-period">Billing period</label><input id="bill-period" name="billingPeriod" type="month" required></div>
          <div class="field"><label for="bill-due">Due date</label><input id="bill-due" name="dueDate" type="date" required></div>
          <div class="field"><label for="bill-amount">Amount (₱)</label><input id="bill-amount" name="amount" type="number" min="0.01" step="0.01">
            <div class="hint">Filled in with the rent share. You may adjust it.</div></div>
        </div>
        <div class="button-row">
          <button type="submit" id="bill-submit">Create bill</button>
          <button type="button" class="secondary" id="bill-cancel" hidden>Cancel editing</button>
        </div>
      </form>
    </section>
  </div>

  <section class="card">
    <h2>All bills</h2>
    <form id="filter-form" class="filters">
      <div class="field"><label for="f-status">Status</label>
        <select id="f-status" name="status"><option value="">All</option><option value="UNPAID">Unpaid</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></select></div>
      <div class="field"><label for="f-period">Period</label><input id="f-period" name="billingPeriod" type="month"></div>
      <div class="field"><label for="f-boarder">Boarder</label><select id="f-boarder" name="boarderId"></select></div>
      <button type="submit">Filter</button>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Boarder</th><th>Period</th><th>Room billed</th><th class="number">Amount</th><th class="number">Balance</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="owner-bills-body"></tbody>
      </table>
    </div>
  </section>`;

const boarderHtml = `
  <section class="card">
    <h2>My bills</h2>
    <p class="hint">Billing amounts are set by the Owner. A bill becomes Paid only after the Owner accepts your GCash proof.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Period</th><th>Room</th><th class="number">Amount</th><th class="number">Balance</th><th>Due date</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="boarder-bills-body"></tbody>
      </table>
    </div>
  </section>`;

let bills = [];
const highlightId = Number(App.param('billId'));

function statusCell(b) {
  return App.status(b.status) + (b.pendingPayments ? ' ' + App.status('FOR_VERIFICATION') : '');
}

// ---------------- Owner ----------------

async function loadOwnerBills() {
  const filters = new URLSearchParams(App.formData(document.getElementById('filter-form')));
  bills = await App.get('/api/billing?' + filters.toString());
  App.fillTable(document.getElementById('owner-bills-body'), bills, (b) => `
    <tr class="${b.id === highlightId ? 'highlight' : ''}" id="bill-${b.id}">
      <td>${App.escape(b.boarderName)}</td>
      <td>${App.escape(b.billingPeriod)}</td>
      <td>${App.escape(b.roomName)}</td>
      <td class="number">${App.money(b.amount)}</td>
      <td class="number">${App.money(b.balance)}</td>
      <td>${App.date(b.dueDate)}</td>
      <td>${statusCell(b)}</td>
      <td><div class="button-row">
        ${b.status !== 'PAID' && !b.pendingPayments && b.balance === b.amount ? `<button type="button" class="small secondary" data-edit="${b.id}">Edit</button>` : ''}
        <a class="button small secondary" href="/payments?boarderId=${b.boarderId}">Payments</a>
      </div></td>
    </tr>`, 'No bills match the filter.');
  const row = document.getElementById(`bill-${highlightId}`);
  if (row) row.scrollIntoView({ block: 'center' });
}

async function showRentShare() {
  const boarderId = document.getElementById('bill-boarder').value;
  const hint = document.getElementById('share-hint');
  if (!boarderId) { hint.textContent = ''; return; }
  try {
    const share = await App.get(`/api/billing/rent-share/${boarderId}`);
    hint.textContent = `${share.roomName}: ${App.money(share.monthlyRent)} ÷ ${share.occupants} occupant(s) = ${App.money(share.rentShare)}`;
    document.getElementById('bill-amount').value = share.rentShare;
  } catch (error) {
    hint.textContent = error.message;
  }
}

function resetBillForm() {
  const form = document.getElementById('bill-form');
  form.reset();
  form.id.value = '';
  document.getElementById('bill-form-title').textContent = 'Create one bill';
  document.getElementById('bill-submit').textContent = 'Create bill';
  document.getElementById('bill-cancel').hidden = true;
  document.getElementById('boarder-field').hidden = false;
  document.getElementById('period-field').hidden = false;
  form.billingPeriod.value = App.today().slice(0, 7);
  showRentShare();
}

function startEditBill(billId) {
  const bill = bills.find((b) => b.id === Number(billId));
  const form = document.getElementById('bill-form');
  form.id.value = bill.id;
  form.dueDate.value = bill.dueDate;
  form.amount.value = bill.amount;
  document.getElementById('bill-form-title').textContent = `Edit ${bill.boarderName}'s ${bill.billingPeriod} bill`;
  document.getElementById('bill-submit').textContent = 'Save changes';
  document.getElementById('bill-cancel').hidden = false;
  document.getElementById('boarder-field').hidden = true;
  document.getElementById('period-field').hidden = true;
  document.getElementById('bill-form-card').scrollIntoView({ behavior: 'smooth' });
}

async function setUpOwner() {
  const boarders = await App.get('/api/boarders?status=ACTIVE');
  const withRoom = boarders.filter((b) => b.roomId);
  document.getElementById('bill-boarder').innerHTML = withRoom.length
    ? withRoom.map((b) => `<option value="${b.id}">${App.escape(b.fullName)} — ${App.escape(b.roomName)}</option>`).join('')
    : '<option value="">No active boarders with a room</option>';
  const allBoarders = await App.get('/api/boarders');
  document.getElementById('f-boarder').innerHTML = '<option value="">All boarders</option>' +
    allBoarders.map((b) => `<option value="${b.id}">${App.escape(b.fullName)}</option>`).join('');

  // Pre-fill filters from the address bar (e.g. links from the dashboard).
  if (App.param('status')) document.getElementById('f-status').value = App.param('status');
  if (App.param('boarderId')) document.getElementById('f-boarder').value = App.param('boarderId');
  if (App.param('billingPeriod')) document.getElementById('f-period').value = App.param('billingPeriod');
  document.getElementById('gen-period').value = App.today().slice(0, 7);
  resetBillForm();
  await loadOwnerBills();

  document.getElementById('bill-boarder').addEventListener('change', showRentShare);
  document.getElementById('bill-cancel').addEventListener('click', resetBillForm);
  document.getElementById('filter-form').addEventListener('submit', (event) => {
    event.preventDefault();
    loadOwnerBills().catch(App.showError);
  });
  document.getElementById('owner-bills-body').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    if (edit) startEditBill(edit.dataset.edit);
  });

  const generateForm = document.getElementById('generate-form');
  generateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = App.formData(generateForm);
    if (!App.confirm(`Generate ${data.billingPeriod} bills for all active boarders, due on ${data.dueDate}?`)) return;
    const result = await App.run(document.getElementById('generate-button'), () => App.post('/api/billing/generate', data));
    if (result) await loadOwnerBills();
  });

  const billForm = document.getElementById('bill-form');
  billForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = App.formData(billForm);
    const editing = Boolean(data.id);
    if (!App.confirm(editing ? 'Save the new amount and due date?' : `Create a ${data.billingPeriod} bill of ₱${data.amount}?`)) return;
    const result = await App.run(document.getElementById('bill-submit'),
      () => (editing ? App.put(`/api/billing/${data.id}`, data) : App.post('/api/billing', data)));
    if (result) { resetBillForm(); await loadOwnerBills(); }
  });
}

// ---------------- Boarder ----------------

async function setUpBoarder() {
  bills = await App.get('/api/billing');
  App.fillTable(document.getElementById('boarder-bills-body'), bills, (b) => `
    <tr class="${b.id === highlightId ? 'highlight' : ''}" id="bill-${b.id}">
      <td>${App.escape(b.billingPeriod)}</td>
      <td>${App.escape(b.roomName)}</td>
      <td class="number">${App.money(b.amount)}</td>
      <td class="number">${App.money(b.balance)}</td>
      <td>${App.date(b.dueDate)}</td>
      <td>${statusCell(b)}</td>
      <td>${b.status === 'PAID' ? '<span class="muted">Paid</span>'
        : b.pendingPayments ? '<span class="muted">Waiting for Owner</span>'
        : `<a class="button small" href="/payments?billId=${b.id}">Pay / upload proof</a>`}</td>
    </tr>`, 'You have no bills yet.');
  const row = document.getElementById(`bill-${highlightId}`);
  if (row) row.scrollIntoView({ block: 'center' });
}

App.mount({
  title: 'Billing',
  subtitle: 'Each bill is one boarder\'s rent share for one billing period. An unpaid bill becomes Overdue after its due date.',
  role: 'ANY',
  render: (user) => (user.role === 'OWNER' ? ownerHtml : boarderHtml),
  after: (user) => (user.role === 'OWNER' ? setUpOwner() : setUpBoarder()),
});
