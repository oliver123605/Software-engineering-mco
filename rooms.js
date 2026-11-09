// rooms.js — the Rooms page (FR-10, FR-11, FR-14, FR-15, FR-16).
//   Owner  : add and edit rooms (capacity, rent, status), see occupants,
//            approve or reject room-change requests.
//   Boarder: see own room and rent share, see other rooms, send a room-change request.
// API used: GET/POST/PUT /api/rooms, GET /api/rooms/:id/occupants,
//           GET/POST /api/room-requests, POST /api/room-requests/:id/approve, .../reject

let rooms = [];

const ownerHtml = `
  <section class="card">
    <h2>Room occupancy</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Room</th><th class="number">Capacity</th><th class="number">Occupants</th><th class="number">Available</th>
          <th class="number">Monthly rent</th><th class="number">Current share</th><th>Availability</th><th>Actions</th></tr></thead>
        <tbody id="owner-rooms-body"></tbody>
      </table>
    </div>
    <div id="occupants-box" hidden>
      <h3 id="occupants-title">Occupants</h3>
      <ul id="occupants-list"></ul>
    </div>
  </section>

  <section class="card" id="room-form-card">
    <h2 id="room-form-title">Add a room</h2>
    <form id="room-form" novalidate>
      <input type="hidden" name="id" id="room-id">
      <div class="form-row">
        <div class="field"><label for="roomName">Room name / number</label><input id="roomName" name="roomName" required></div>
        <div class="field"><label for="capacity">Capacity (max occupants)</label><input id="capacity" name="capacity" type="number" min="1" step="1" required></div>
        <div class="field"><label for="monthlyRent">Total monthly rent (₱)</label><input id="monthlyRent" name="monthlyRent" type="number" min="0" step="0.01" required></div>
        <div class="field" id="status-field" hidden><label for="room-status">Status</label>
          <select id="room-status" name="status"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
      </div>
      <div class="field"><label for="description">Description (optional)</label><input id="description" name="description" placeholder="e.g. 2nd floor, with window, own CR"></div>
      <div class="button-row">
        <button type="submit" id="room-submit">Add room</button>
        <button type="button" class="secondary" id="room-cancel" hidden>Cancel editing</button>
      </div>
    </form>
  </section>

  <section class="card" id="requests">
    <h2>Room-change requests</h2>
    <p class="hint">Approving moves the boarder and updates both rooms' occupancy. The boarder's current bill is not changed; the new room's share applies from the next billing period.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Submitted</th><th>Boarder</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Review</th></tr></thead>
        <tbody id="owner-requests-body"></tbody>
      </table>
    </div>
  </section>`;

const boarderHtml = `
  <section class="card">
    <h2>My room</h2>
    <dl class="detail-list" id="my-room"></dl>
    <p class="hint">Room assignments are managed by the Owner. To move, submit a room-change request below.</p>
  </section>

  <section class="card">
    <h2>Available rooms</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Room</th><th>Description</th><th class="number">Capacity</th><th class="number">Available spaces</th>
          <th class="number">Monthly rent</th><th class="number">Your share if you move</th><th>Action</th></tr></thead>
        <tbody id="boarder-rooms-body"></tbody>
      </table>
    </div>
  </section>

  <section class="card" id="request-card" hidden>
    <h2>Request a room change</h2>
    <form id="request-form" novalidate>
      <input type="hidden" name="requestedRoomId" id="requestedRoomId">
      <p>Requested room: <strong id="requested-room-name"></strong></p>
      <div class="field"><label for="reason">Reason (optional)</label><textarea id="reason" name="reason" maxlength="300"></textarea></div>
      <div class="button-row">
        <button type="submit" id="request-submit">Submit request</button>
        <button type="button" class="secondary" id="request-cancel">Cancel</button>
      </div>
    </form>
  </section>

  <section class="card">
    <h2>My room-change requests</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Submitted</th><th>From</th><th>To</th><th>Status</th><th>Reviewed</th><th>Owner remarks</th></tr></thead>
        <tbody id="boarder-requests-body"></tbody>
      </table>
    </div>
  </section>`;

// ---------------- Owner ----------------

async function loadOwnerRooms() {
  rooms = await App.get('/api/rooms');
  App.fillTable(document.getElementById('owner-rooms-body'), rooms, (r) => `
    <tr>
      <td><strong>${App.escape(r.roomName)}</strong><br><small>${App.escape(r.description)}</small></td>
      <td class="number">${r.capacity}</td>
      <td class="number">${r.occupants}</td>
      <td class="number">${r.availableSpaces}</td>
      <td class="number">${App.money(r.monthlyRent)}</td>
      <td class="number">${r.currentRentShare === null ? '—' : App.money(r.currentRentShare)}</td>
      <td>${App.status(r.availability)}</td>
      <td><div class="button-row">
        <button type="button" class="small secondary" data-edit="${r.id}">Edit</button>
        <button type="button" class="small secondary" data-occupants="${r.id}">Occupants</button>
      </div></td>
    </tr>`, 'No rooms yet. Add the first room below.');
}

async function loadOwnerRequests() {
  const requests = await App.get('/api/room-requests');
  App.fillTable(document.getElementById('owner-requests-body'), requests, (q) => `
    <tr>
      <td>${App.dateTime(q.requestDate)}</td>
      <td>${App.escape(q.boarderName)}</td>
      <td>${App.escape(q.currentRoomName || '—')}</td>
      <td>${App.escape(q.requestedRoomName)}</td>
      <td>${App.escape(q.reason || '—')}</td>
      <td>${App.status(q.status)}</td>
      <td>${q.status === 'PENDING'
        ? `<div class="button-row"><button type="button" class="small success" data-approve="${q.id}">Approve</button>
           <button type="button" class="small danger" data-reject="${q.id}">Reject</button></div>`
        : `${App.dateTime(q.reviewDate)}<br><small>${App.escape(q.reviewRemarks || '')}</small>`}</td>
    </tr>`, 'No room-change requests.');
}

function resetRoomForm() {
  const form = document.getElementById('room-form');
  form.reset();
  form.id.value = '';
  document.getElementById('room-form-title').textContent = 'Add a room';
  document.getElementById('room-submit').textContent = 'Add room';
  document.getElementById('room-cancel').hidden = true;
  document.getElementById('status-field').hidden = true;
}

function startEditRoom(roomId) {
  const room = rooms.find((r) => r.id === Number(roomId));
  const form = document.getElementById('room-form');
  form.id.value = room.id;
  form.roomName.value = room.roomName;
  form.capacity.value = room.capacity;
  form.monthlyRent.value = room.monthlyRent;
  form.description.value = room.description;
  form.status.value = room.status;
  document.getElementById('room-form-title').textContent = `Edit ${room.roomName}`;
  document.getElementById('room-submit').textContent = 'Save changes';
  document.getElementById('room-cancel').hidden = false;
  document.getElementById('status-field').hidden = false;
  document.getElementById('room-form-card').scrollIntoView({ behavior: 'smooth' });
}

async function showOccupants(roomId) {
  const room = rooms.find((r) => r.id === Number(roomId));
  const occupants = await App.get(`/api/rooms/${roomId}/occupants`);
  document.getElementById('occupants-title').textContent = `Occupants of ${room.roomName} (${occupants.length}/${room.capacity})`;
  document.getElementById('occupants-list').innerHTML = occupants.length
    ? occupants.map((o) => `<li>${App.escape(o.fullName)} — ${App.escape(o.phone)} — share ${App.money(room.currentRentShare)}</li>`).join('')
    : '<li class="muted">Nobody is assigned to this room.</li>';
  document.getElementById('occupants-box').hidden = false;
}

async function setUpOwner() {
  await Promise.all([loadOwnerRooms(), loadOwnerRequests()]);
  if (window.location.hash === '#requests') document.getElementById('requests').scrollIntoView();

  const form = document.getElementById('room-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = App.formData(form);
    const editing = Boolean(data.id);
    if (editing && !App.confirm(`Save changes to ${data.roomName}?`)) return;
    const result = await App.run(document.getElementById('room-submit'),
      () => (editing ? App.put(`/api/rooms/${data.id}`, data) : App.post('/api/rooms', data)));
    if (result) { resetRoomForm(); await loadOwnerRooms(); }
  });
  document.getElementById('room-cancel').addEventListener('click', resetRoomForm);

  document.getElementById('owner-rooms-body').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    const occupants = event.target.closest('[data-occupants]');
    if (edit) startEditRoom(edit.dataset.edit);
    if (occupants) showOccupants(occupants.dataset.occupants).catch(App.showError);
  });

  document.getElementById('owner-requests-body').addEventListener('click', async (event) => {
    const approve = event.target.closest('[data-approve]');
    const reject = event.target.closest('[data-reject]');
    if (approve) {
      if (!App.confirm('Approve this room change? The boarder will be moved and both rooms\' occupancy will update.')) return;
      await App.run(approve, () => App.post(`/api/room-requests/${approve.dataset.approve}/approve`));
    } else if (reject) {
      const remarks = window.prompt('Reason for rejecting this request:');
      if (remarks === null) return;
      await App.run(reject, () => App.post(`/api/room-requests/${reject.dataset.reject}/reject`, { remarks }));
    } else {
      return;
    }
    await Promise.all([loadOwnerRooms(), loadOwnerRequests()]);
  });
}

// ---------------- Boarder ----------------

async function loadBoarderView() {
  const [profile, roomList, requests] = await Promise.all([
    App.get('/api/profile'), App.get('/api/rooms'), App.get('/api/room-requests'),
  ]);
  rooms = roomList;
  const myRoom = rooms.find((r) => r.roomName === profile.roomName);
  document.getElementById('my-room').innerHTML = myRoom ? `
    <dt>Room</dt><dd><strong>${App.escape(myRoom.roomName)}</strong> ${App.escape(myRoom.description)}</dd>
    <dt>Occupants</dt><dd>${myRoom.occupants} of ${myRoom.capacity}</dd>
    <dt>Total monthly rent</dt><dd>${App.money(myRoom.monthlyRent)}</dd>
    <dt>My rent share</dt><dd><strong>${App.money(profile.rentShare)}</strong> (${App.money(myRoom.monthlyRent)} ÷ ${myRoom.occupants})</dd>`
    : '<dt>Room</dt><dd>You have no room assignment. Please contact the Owner.</dd>';

  const hasPending = requests.some((q) => q.status === 'PENDING');
  const others = rooms.filter((r) => !myRoom || r.id !== myRoom.id);
  App.fillTable(document.getElementById('boarder-rooms-body'), others, (r) => `
    <tr>
      <td>${App.escape(r.roomName)}</td>
      <td>${App.escape(r.description || '—')}</td>
      <td class="number">${r.capacity}</td>
      <td class="number">${r.availableSpaces}</td>
      <td class="number">${App.money(r.monthlyRent)}</td>
      <td class="number">${r.rentShareIfOneMoreJoins === null ? '—' : App.money(r.rentShareIfOneMoreJoins)}</td>
      <td>${r.availableSpaces > 0 && myRoom && !hasPending
        ? `<button type="button" class="small" data-request="${r.id}">Request move</button>`
        : `<span class="muted">${r.availableSpaces === 0 ? 'Full' : hasPending ? 'Request pending' : '—'}</span>`}</td>
    </tr>`, 'There are no other rooms.');

  App.fillTable(document.getElementById('boarder-requests-body'), requests, (q) => `
    <tr>
      <td>${App.dateTime(q.requestDate)}</td>
      <td>${App.escape(q.currentRoomName || '—')}</td>
      <td>${App.escape(q.requestedRoomName)}</td>
      <td>${App.status(q.status)}</td>
      <td>${App.dateTime(q.reviewDate)}</td>
      <td>${App.escape(q.reviewRemarks || '—')}</td>
    </tr>`, 'You have not submitted any room-change request.');
}

async function setUpBoarder() {
  await loadBoarderView();
  const card = document.getElementById('request-card');
  document.getElementById('boarder-rooms-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-request]');
    if (!button) return;
    const room = rooms.find((r) => r.id === Number(button.dataset.request));
    document.getElementById('requestedRoomId').value = room.id;
    document.getElementById('requested-room-name').textContent =
      `${room.roomName} — your share would be ${App.money(room.rentShareIfOneMoreJoins)} per month`;
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('request-cancel').addEventListener('click', () => { card.hidden = true; });
  const requestForm = document.getElementById('request-form');
  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!App.confirm('Send this room-change request to the Owner?')) return;
    const result = await App.run(document.getElementById('request-submit'),
      () => App.post('/api/room-requests', App.formData(requestForm)));
    if (result) { card.hidden = true; requestForm.reset(); await loadBoarderView(); }
  });
}

App.mount({
  title: 'Rooms',
  subtitle: 'Rent share = monthly room rent ÷ number of approved occupants.',
  role: 'ANY',
  render: (user) => (user.role === 'OWNER' ? ownerHtml : boarderHtml),
  after: (user) => (user.role === 'OWNER' ? setUpOwner() : setUpBoarder()),
});
