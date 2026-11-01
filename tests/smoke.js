// End-to-end API smoke test. Start the server first (npm start), then run:
//   npm run test:smoke
// It registers new random users, so it does not touch the demo accounts.
// Note: it makes 2 deliberately failing login/register calls; the limit is 20 failures per 15 minutes.
require('dotenv').config();

const BASE = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const stamp = Date.now();
let passed = 0;
let failed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
  }
}

// A tiny client that keeps its own session cookie.
function client() {
  let cookie = '';
  return async function call(method, path, body, { raw = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (body !== undefined) {
      if (raw) {
        headers['Content-Type'] = 'text/plain';
        payload = body;
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
    } else if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      payload = '{}';
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: res.status, data };
  };
}

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log(`Testing ${BASE}\n`);
  const owner = client();
  const other = client();
  const care = client();
  const anon = client();
  let r;

  console.log('Health and static files');
  r = await anon('GET', '/api/health');
  check('GET /api/health reports database connected', r.status === 200 && r.data.database === 'connected', r.data);
  for (const page of ['/', '/pages/owner.html', '/pages/caretaker.html', '/manifest.json', '/sw.js', '/icons/icon-192.png']) {
    r = await anon('GET', page);
    check(`GET ${page} -> 200`, r.status === 200, r.status);
  }
  r = await anon('GET', '/no-such-page');
  check('Unknown page -> 404', r.status === 404, r.status);
  r = await anon('GET', '/api/nope');
  check('Unknown API route -> 404 JSON', r.status === 404 && r.data.error, r.data);

  console.log('\nAuthentication');
  const pw = 'Secret123';
  r = await owner('POST', '/api/auth/register', { full_name: 'Test Owner', email: `owner${stamp}@test.com`, password: pw, role: 'owner' });
  check('Register owner -> 201', r.status === 201 && r.data.user.role === 'owner', r.data);
  check('Password hash never returned', !JSON.stringify(r.data).includes('password'), r.data);
  r = await other('POST', '/api/auth/register', { full_name: 'Other Owner', email: `other${stamp}@test.com`, password: pw, role: 'owner' });
  check('Register second owner -> 201', r.status === 201, r.data);
  r = await care('POST', '/api/auth/register', { full_name: 'Test Caretaker', email: `care${stamp}@test.com`, password: pw, role: 'caretaker' });
  check('Register caretaker -> 201', r.status === 201 && r.data.user.role === 'caretaker', r.data);
  const caretakerId = r.data.user.id;
  r = await anon('POST', '/api/auth/register', { full_name: 'Dup', email: `owner${stamp}@test.com`, password: pw, role: 'owner' });
  check('Duplicate email -> 409', r.status === 409, r.data);
  r = await anon('POST', '/api/auth/register', { full_name: 'Weak', email: `weak${stamp}@test.com`, password: 'short', role: 'admin' });
  check('Invalid role / weak password -> 400', r.status === 400, r.data);
  r = await anon('POST', '/api/auth/login', { email: `owner${stamp}@test.com`, password: 'WrongPass1' });
  check('Wrong password -> 401', r.status === 401, r.data);
  r = await owner('POST', '/api/auth/login', { email: `owner${stamp}@test.com`, password: pw });
  check('Login -> 200', r.status === 200 && r.data.user.email === `owner${stamp}@test.com`, r.data);
  r = await owner('GET', '/api/auth/me');
  check('GET /api/auth/me returns user', r.status === 200 && r.data.user.full_name === 'Test Owner', r.data);
  r = await anon('GET', '/api/vehicles');
  check('Not logged in -> 401', r.status === 401, r.data);
  r = await owner('POST', '/api/vehicles', 'make=x', { raw: true });
  check('Non-JSON write -> 415', r.status === 415, r.data);

  console.log('\nProfile');
  r = await care('PUT', '/api/auth/profile', { full_name: 'Test Caretaker', phone: '+91 90000 00000', city: 'Testville', specialization: 'Batteries', bio: 'Hello' });
  check('Caretaker updates provider profile', r.status === 200 && r.data.user.city === 'Testville', r.data);
  r = await owner('GET', '/api/services/providers?q=Testville');
  check('Owner finds caretaker in provider directory', r.status === 200 && r.data.providers.some((p) => p.id === caretakerId), r.data);

  console.log('\nVehicles');
  r = await owner('POST', '/api/vehicles', { make: 'Maruti', model: 'Swift', year: 1500, registration_number: 'kl 01 ab 1', vehicle_type: 'car', status: 'parked' });
  check('Invalid year -> 400 with field details', r.status === 400 && r.data.details && r.data.details.year, r.data);
  r = await owner('POST', '/api/vehicles', { make: 'Maruti', model: 'Swift', year: 2019, registration_number: 'kl 01 ab 1', vehicle_type: 'car', status: 'parked', owner_id: 999 });
  check('Create vehicle -> 201', r.status === 201, r.data);
  const vehicle = r.data.vehicle;
  check('Registration normalised to upper case', vehicle && vehicle.registration_number === 'KL 01 AB 1', vehicle);
  check('parked_since defaults to today', vehicle && vehicle.parked_since === isoDate(0), vehicle);
  r = await owner('POST', '/api/vehicles', { make: 'Maruti', model: 'Swift', registration_number: 'KL 01 AB 1', vehicle_type: 'car', status: 'parked' });
  check('Duplicate registration -> 409', r.status === 409, r.data);
  r = await owner('PUT', `/api/vehicles/${vehicle.id}`, { ...vehicle, location: 'Garage 2', parked_since: isoDate(-10) });
  check('Update vehicle -> 200', r.status === 200 && r.data.vehicle.location === 'Garage 2', r.data);
  r = await owner('GET', '/api/vehicles');
  check('Owner lists own vehicle', r.data.vehicles.length === 1, r.data);
  r = await other('GET', '/api/vehicles');
  check("Other owner cannot list it", r.data.vehicles.length === 0, r.data);
  r = await other('GET', `/api/vehicles/${vehicle.id}`);
  check("Other owner GET -> 404", r.status === 404, r.data);
  r = await other('PUT', `/api/vehicles/${vehicle.id}`, { ...vehicle });
  check("Other owner PUT -> 404", r.status === 404, r.data);
  r = await other('DELETE', `/api/vehicles/${vehicle.id}`);
  check("Other owner DELETE -> 404", r.status === 404, r.data);
  r = await care('POST', '/api/vehicles', { make: 'X', model: 'Y', registration_number: 'ZZ1', vehicle_type: 'car', status: 'parked' });
  check('Caretaker cannot create vehicles -> 403', r.status === 403, r.data);
  r = await care('GET', '/api/vehicles');
  check('Caretaker sees no vehicles before assignment', r.data.vehicles.length === 0, r.data);

  console.log('\nMaintenance');
  r = await owner('POST', '/api/maintenance', { vehicle_id: vehicle.id, title: 'Battery check', due_date: isoDate(1), priority: 'high', assigned_to: caretakerId });
  check('Create assigned task -> 201', r.status === 201 && r.data.task.assigned_to === caretakerId, r.data);
  const task = r.data.task;
  r = await other('POST', '/api/maintenance', { vehicle_id: vehicle.id, title: 'Sneaky', due_date: isoDate(1), priority: 'low' });
  check("Other owner cannot add task to someone's vehicle -> 404", r.status === 404, r.data);
  r = await owner('POST', '/api/maintenance', { vehicle_id: vehicle.id, title: 'Bad assign', due_date: isoDate(1), priority: 'low', assigned_to: vehicle.owner_id });
  check('Assigning to a non-caretaker -> 400', r.status === 400, r.data);
  r = await care('GET', '/api/maintenance?status=open');
  check('Caretaker sees assigned task', r.data.tasks.some((t) => t.id === task.id), r.data);
  r = await care('GET', '/api/vehicles');
  check('Caretaker now sees the assigned vehicle', r.data.vehicles.length === 1 && r.data.vehicles[0].owner_name === 'Test Owner', r.data);
  r = await other('GET', `/api/maintenance/${task.id}`);
  check('Other owner cannot read task -> 404', r.status === 404, r.data);
  r = await care('PUT', `/api/maintenance/${task.id}`, { title: 'Hijack', due_date: isoDate(2), priority: 'low' });
  check('Caretaker cannot edit task -> 403', r.status === 403, r.data);
  r = await care('PATCH', `/api/maintenance/${task.id}/status`, { status: 'cancelled' });
  check('Caretaker cannot cancel task -> 400', r.status === 400, r.data);
  r = await care('PATCH', `/api/maintenance/${task.id}/status`, { status: 'in_progress' });
  check('Caretaker starts task', r.status === 200 && r.data.task.status === 'in_progress', r.data);
  r = await care('POST', `/api/maintenance/${task.id}/records`, { record_type: 'inspection', service_date: isoDate(1), notes: 'x' });
  check('Future service date -> 400', r.status === 400, r.data);
  r = await care('POST', `/api/maintenance/${task.id}/records`, { record_type: 'inspection', service_date: isoDate(0), notes: 'Battery at 12.1V', cost: 0 });
  check('Record inspection -> 201', r.status === 201 && r.data.task.status === 'in_progress', r.data);
  r = await care('POST', `/api/maintenance/${task.id}/records`, { record_type: 'maintenance', service_date: isoDate(0), notes: 'Charged battery', cost: 450.5, mark_complete: true });
  check('Complete task with cost -> 201', r.status === 201 && r.data.task.status === 'completed' && Number(r.data.task.total_cost) === 450.5, r.data);
  r = await care('POST', `/api/maintenance/${task.id}/records`, { record_type: 'inspection', service_date: isoDate(0) });
  check('Record on completed task -> 409', r.status === 409, r.data);
  r = await owner('DELETE', `/api/maintenance/${task.id}`);
  check('Completed task cannot be deleted -> 409', r.status === 409, r.data);

  r = await owner('POST', '/api/maintenance', { vehicle_id: vehicle.id, title: 'Tyre pressure', due_date: isoDate(5), priority: 'medium' });
  const ownTask = r.data.task;
  r = await owner('PUT', `/api/maintenance/${ownTask.id}`, { title: 'Tyre pressure check', due_date: isoDate(6), priority: 'low', assigned_to: caretakerId });
  check('Owner edits and assigns task', r.status === 200 && r.data.task.priority === 'low' && r.data.task.assigned_to === caretakerId, r.data);
  r = await owner('PATCH', `/api/maintenance/${ownTask.id}/status`, { status: 'cancelled' });
  check('Owner cancels task', r.status === 200 && r.data.task.status === 'cancelled', r.data);
  r = await owner('DELETE', `/api/maintenance/${ownTask.id}`);
  check('Owner deletes cancelled task', r.status === 200, r.data);

  console.log('\nService requests');
  r = await owner('POST', '/api/services/requests', { vehicle_id: vehicle.id, provider_id: caretakerId, service_type: 'Wash and cover', preferred_date: isoDate(3) });
  check('Owner creates request -> 201', r.status === 201 && r.data.request.status === 'pending', r.data);
  const req1 = r.data.request;
  r = await other('POST', '/api/services/requests', { vehicle_id: vehicle.id, provider_id: caretakerId, service_type: 'Not mine' });
  check("Other owner cannot request for someone's vehicle -> 404", r.status === 404, r.data);
  r = await owner('PATCH', `/api/services/requests/${req1.id}/status`, { status: 'accepted' });
  check('Owner cannot accept own request -> 400', r.status === 400, r.data);
  r = await care('GET', '/api/services/requests?status=pending');
  check('Caretaker sees incoming request', r.data.requests.some((q) => q.id === req1.id), r.data);
  r = await care('PATCH', `/api/services/requests/${req1.id}/status`, { status: 'accepted', provider_note: 'See you then' });
  check('Caretaker accepts -> task created', r.status === 200 && r.data.request.status === 'accepted' && r.data.request.task_id, r.data);
  const linkedTaskId = r.data.request.task_id;
  r = await care('PATCH', `/api/services/requests/${req1.id}/status`, { status: 'declined' });
  check('Cannot respond twice -> 409', r.status === 409, r.data);
  r = await care('POST', `/api/maintenance/${linkedTaskId}/records`, { record_type: 'maintenance', service_date: isoDate(0), notes: 'Washed', cost: 300, mark_complete: true });
  check('Completing linked task works', r.status === 201, r.data);
  r = await owner('GET', '/api/services/requests');
  const done = r.data.requests.find((q) => q.id === req1.id);
  check('Request auto-completed with cost', done && done.status === 'completed' && Number(done.cost) === 300, done);

  r = await owner('POST', '/api/services/requests', { vehicle_id: vehicle.id, provider_id: caretakerId, service_type: 'Detailing' });
  r = await care('PATCH', `/api/services/requests/${r.data.request.id}/status`, { status: 'declined', provider_note: 'Busy' });
  check('Caretaker declines request', r.status === 200 && r.data.request.status === 'declined', r.data);
  r = await owner('POST', '/api/services/requests', { vehicle_id: vehicle.id, provider_id: caretakerId, service_type: 'Brake check' });
  const req3 = r.data.request;
  r = await care('PATCH', `/api/services/requests/${req3.id}/status`, { status: 'accepted' });
  r = await owner('PATCH', `/api/services/requests/${req3.id}/status`, { status: 'cancelled' });
  check('Owner cancels accepted request', r.status === 200 && r.data.request.status === 'cancelled' && r.data.request.task_status === 'cancelled', r.data);
  r = await owner('POST', '/api/services/requests', { vehicle_id: vehicle.id, provider_id: caretakerId, service_type: 'Old date', preferred_date: isoDate(-2) });
  check('Past preferred date -> 400', r.status === 400, r.data);

  console.log('\nReports, dashboard, notifications');
  r = await owner('GET', '/api/reports/expenses');
  check('Owner expenses total = 750.50', r.status === 200 && Number(r.data.total) === 750.5, r.data);
  r = await owner('GET', `/api/reports/history?vehicle_id=${vehicle.id}`);
  check('Owner history has 3 records', r.status === 200 && r.data.records.length === 3, r.data.records && r.data.records.length);
  r = await other('GET', '/api/reports/history');
  check('Other owner history is empty', r.data.records.length === 0, r.data);
  r = await care('GET', '/api/reports/expenses');
  check('Caretaker billed total = 750.50', Number(r.data.total) === 750.5, r.data);
  r = await owner('GET', '/api/dashboard');
  check('Owner dashboard', r.status === 200 && r.data.role === 'owner' && r.data.stats.vehicles === 1, r.data);
  r = await care('GET', '/api/dashboard');
  check('Caretaker dashboard', r.status === 200 && r.data.role === 'caretaker' && r.data.stats.completed_this_month === 2, r.data);
  r = await owner('GET', '/api/notifications');
  check('Owner received notifications', r.status === 200 && r.data.unread > 0, r.data.unread);
  const first = r.data.notifications[0];
  r = await other('PATCH', `/api/notifications/${first.id}/read`);
  check("Cannot mark someone else's notification -> 404", r.status === 404, r.data);
  r = await owner('PATCH', `/api/notifications/${first.id}/read`);
  check('Mark one read', r.status === 200, r.data);
  r = await owner('PATCH', '/api/notifications/read-all');
  r = await owner('GET', '/api/notifications?unread=1');
  check('Mark all read -> 0 unread', r.data.unread === 0, r.data);

  console.log('\nReminders');
  r = await owner('POST', '/api/maintenance', { vehicle_id: vehicle.id, title: 'Reminder test', due_date: isoDate(1), priority: 'low' });
  const { sendDueReminders } = require('../services/reminderService');
  const sent = await sendDueReminders();
  const again = await sendDueReminders();
  check('Reminder sent for task due tomorrow', sent >= 1, sent);
  check('Reminder not sent twice', again === 0, again);
  r = await owner('GET', '/api/notifications?unread=1');
  check('Owner sees "due soon" reminder', r.data.notifications.some((n) => n.title === 'Maintenance due soon'), r.data);
  await require('../config/db').pool.end();

  console.log('\nCleanup');
  r = await owner('DELETE', `/api/vehicles/${vehicle.id}`);
  check('Delete vehicle', r.status === 200, r.data);
  r = await owner('GET', '/api/reports/history');
  check('History removed with vehicle', r.data.records.length === 0, r.data);
  r = await owner('POST', '/api/auth/logout');
  check('Logout', r.status === 200, r.data);
  r = await owner('GET', '/api/auth/me');
  check('After logout -> 401', r.status === 401, r.data);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err.message);
  if (err.cause && err.cause.code === 'ECONNREFUSED') console.error(`Is the server running at ${BASE}? Start it with: npm start`);
  process.exitCode = 1;
});
