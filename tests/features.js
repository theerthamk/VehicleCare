// End-to-end tests for the AI, map, job-pool, ratings and photo features.
// Start the server first (npm start), then run:  npm run test:features
// It registers new random users and cleans up its vehicles afterwards.
require('dotenv').config();

const BASE = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const stamp = Date.now();
// A real 16x16 JPEG, used to test photo uploads.
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDJooorxD7o/9k=';
let passed = 0;
let failed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  }
}

function client() {
  let cookie = '';
  async function call(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body || {});
    }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, type };
  }
  return call;
}

const isoDate = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function register(call, name, role) {
  const r = await call('POST', '/api/auth/register', {
    full_name: name, email: `${role}${stamp}${Math.random().toString(36).slice(2, 6)}@test.com`, password: 'Secret123', role
  });
  if (r.status !== 201) throw new Error(`Could not register ${name}: ${JSON.stringify(r.data)}`);
  return r.data.user;
}

async function main() {
  console.log(`Testing new features at ${BASE}\n`);
  const owner = client();
  const other = client();
  const near = client();
  const far = client();
  const anon = client();
  let r;

  const ownerUser = await register(owner, 'Feature Owner', 'owner');
  await register(other, 'Other Owner', 'owner');
  const nearUser = await register(near, 'Near Caretaker', 'caretaker');
  const farUser = await register(far, 'Far Caretaker', 'caretaker');

  r = await near('GET', '/api/ai/status');
  const aiExpected = r.data.configured ? 'gemini' : 'rules';
  console.log(`AI mode: ${r.data.configured ? `Gemini (${r.data.model})` : 'built-in rules (no GEMINI_API_KEY)'}\n`);

  console.log('Caretaker service areas');
  r = await near('PUT', '/api/auth/profile', { full_name: 'Near Caretaker', latitude: 8.5241 });
  check('Latitude without longitude -> 400', r.status === 400, r.data);
  r = await near('PUT', '/api/auth/profile', {
    full_name: 'Near Caretaker', city: 'Thiruvananthapuram', specialization: 'Battery and tyre checks, rodent proofing',
    latitude: 8.5241, longitude: 76.9366, service_radius_km: 15
  });
  check('Caretaker saves base location + radius', r.status === 200 && r.data.user.latitude === 8.5241 && r.data.user.service_radius_km === 15, r.data);
  r = await near('PUT', '/api/auth/profile', { full_name: 'Near Caretaker', phone: '+91 90000 11111' });
  check('Profile save without map keeps the location', r.status === 200 && r.data.user.latitude === 8.5241, r.data);
  r = await far('PUT', '/api/auth/profile', { full_name: 'Far Caretaker', city: 'Kochi', latitude: 9.9312, longitude: 76.2673, service_radius_km: 10 });
  check('Second caretaker based in Kochi', r.status === 200, r.data);
  r = await near('PUT', '/api/auth/profile', { full_name: 'Near Caretaker', service_radius_km: 500 });
  check('Radius over 200 km -> 400', r.status === 400, r.data);

  console.log('\nVehicles, health score and distance search');
  r = await owner('POST', '/api/vehicles', {
    make: 'Maruti', model: 'Alto', registration_number: `FT-${stamp % 100000}`, vehicle_type: 'car', status: 'parked',
    parked_since: isoDate(-70), latitude: 8.5300, longitude: 76.9400, location: 'Test garage'
  });
  check('Create vehicle with map location', r.status === 201 && r.data.vehicle.latitude === 8.53, r.data);
  const vehicle = r.data.vehicle;
  r = await owner('POST', '/api/vehicles', {
    make: 'Bajaj', model: 'Pulsar', registration_number: `FU-${stamp % 100000}`, vehicle_type: 'motorcycle', status: 'parked'
  });
  const noPin = r.data.vehicle;
  check('Create vehicle without map location', r.status === 201 && noPin.latitude === null, r.data);
  r = await owner('GET', '/api/vehicles');
  const listed = r.data.vehicles.find((v) => v.id === vehicle.id);
  check('Vehicles include a health score', listed && listed.health && listed.health.score < 100 && listed.health.reasons.length > 0, listed && listed.health);

  r = await owner('GET', `/api/services/providers?vehicle_id=${vehicle.id}`);
  const nearP = r.data.providers.find((p) => p.id === nearUser.id);
  const farP = r.data.providers.find((p) => p.id === farUser.id);
  check('Near caretaker covers the vehicle', nearP && nearP.covers === true && nearP.distance_km < 2, nearP);
  check('Kochi caretaker does not cover it', farP && farP.covers === false && farP.distance_km > 100, farP);
  check('Providers have a match score', nearP && typeof nearP.match_score === 'number', nearP);
  check('Caretaker home is rounded for privacy', nearP && nearP.latitude === 8.52, nearP && nearP.latitude);
  check('Sorted with covering caretakers first', r.data.providers.findIndex((p) => p.id === nearUser.id) < r.data.providers.findIndex((p) => p.id === farUser.id));

  console.log('\nJob pool');
  r = await owner('POST', '/api/jobs', { vehicle_id: noPin.id, title: 'Battery check' });
  check('Job for a vehicle without location -> 400', r.status === 400, r.data);
  r = await near('POST', '/api/jobs', { vehicle_id: vehicle.id, title: 'Nope' });
  check('Caretaker cannot post jobs -> 403', r.status === 403, r.data);
  r = await owner('POST', '/api/jobs', { vehicle_id: vehicle.id, title: 'Weekly battery start for a month', description: 'Keys with the watchman.', budget: 900, preferred_date: isoDate(3) });
  check('Owner posts a job', r.status === 201 && r.data.notified >= 1, r.data);
  const job = r.data.job;
  r = await near('GET', '/api/notifications?unread=1');
  check('Nearby caretaker is notified', r.data.notifications.some((n) => n.title === 'New job near you'), r.data.notifications.map((n) => n.title));
  r = await near('GET', '/api/jobs');
  const seen = r.data.jobs.find((j) => j.id === job.id);
  check('Nearby caretaker sees the job with distance', seen && seen.distance_km < 2, seen);
  check('Registration number hidden before acceptance', seen && seen.registration_number === null, seen);
  r = await far('GET', '/api/jobs');
  check('Far caretaker does not see it', !r.data.jobs.some((j) => j.id === job.id), r.data.jobs.length);
  r = await far('POST', `/api/jobs/${job.id}/bids`, { price: 500 });
  check('Far caretaker cannot bid -> 404', r.status === 404, r.data);
  r = await near('POST', `/api/jobs/${job.id}/bids`, { price: 800, message: 'Can start tomorrow' });
  check('Nearby caretaker bids', r.status === 201 && r.data.bid.status === 'pending', r.data);
  r = await near('POST', `/api/jobs/${job.id}/bids`, { price: 750, message: 'Updated price' });
  check('Caretaker updates the bid', r.status === 200 && Number(r.data.bid.price) === 750, r.data);
  r = await other('GET', `/api/jobs/${job.id}`);
  check("Another owner cannot see the job's bids -> 404", r.status === 404, r.data);
  r = await owner('GET', `/api/jobs/${job.id}`);
  const myBid = r.data.bids && r.data.bids.find((b) => b.caretaker_id === nearUser.id);
  check('Owner sees ranked bids with caretaker details', myBid && myBid.caretaker && typeof myBid.caretaker.match_score === 'number', r.data);
  r = await owner('POST', `/api/jobs/${job.id}/accept`, { bid_id: myBid.bid_id });
  check('Owner accepts the bid -> task created', r.status === 200 && r.data.job.status === 'assigned' && r.data.task_id, r.data);
  const taskId = r.data.task_id;
  r = await near('POST', `/api/jobs/${job.id}/bids`, { price: 700 });
  check('No more bids after assignment -> 409', r.status === 409, r.data);
  r = await near('GET', '/api/maintenance?status=open');
  check('Accepted job appears in caretaker tasks', r.data.tasks.some((t) => t.id === taskId), r.data.tasks.map((t) => t.id));
  r = await owner('POST', '/api/jobs', { vehicle_id: vehicle.id, title: 'Wash and cover' });
  const job2 = r.data.job;
  r = await owner('PATCH', `/api/jobs/${job2.id}/cancel`);
  check('Owner cancels an open job', r.status === 200 && r.data.job.status === 'cancelled', r.data);

  console.log('\nPhotos and AI inspection report');
  r = await near('POST', `/api/maintenance/${taskId}/records`, { record_type: 'inspection', service_date: isoDate(0), photos: ['data:text/plain;base64,aGVsbG8='] });
  check('Non-image upload -> 400', r.status === 400, r.data);
  r = await near('POST', `/api/maintenance/${taskId}/records`, { record_type: 'inspection', service_date: isoDate(0), photos: [JPEG, JPEG, JPEG, JPEG, JPEG] });
  check('More than 4 photos -> 400', r.status === 400, r.data);
  r = await near('POST', `/api/maintenance/${taskId}/records`, { record_type: 'inspection', service_date: isoDate(0), photos: ['data:image/jpeg;base64,aGVsbG8gd29ybGQ='] });
  check('Fake JPEG (wrong file bytes) -> 400', r.status === 400, r.data);
  r = await owner('POST', `/api/reviews`, { task_id: taskId, rating: 5 });
  check('Cannot rate before completion -> 409', r.status === 409, r.data);
  r = await near('POST', `/api/maintenance/${taskId}/records`, {
    record_type: 'maintenance', service_date: isoDate(0), cost: 750, mark_complete: true,
    notes: 'Front left tyre is flat. Rust on the brake discs. Battery charged.', photos: [JPEG, JPEG]
  });
  check('Complete with photos -> 201', r.status === 201 && r.data.task.status === 'completed', r.data);
  const record = r.data.record || {};
  check('Two photos stored', record.photos && record.photos.length === 2, record.photos);
  check(`AI report generated by ${aiExpected}`, record.ai_source === aiExpected && ['good', 'fair', 'poor'].includes(record.ai_condition), record);
  const report = typeof record.ai_report === 'string' ? JSON.parse(record.ai_report) : record.ai_report;
  check('Report lists issues', report && Array.isArray(report.issues) && report.issues.length > 0, report);
  if (aiExpected === 'rules') {
    check('Rules flag the flat tyre as serious', record.ai_condition === 'poor' && report.issues.some((i) => /tyre/i.test(i.issue)), report);
  }
  r = await owner('GET', '/api/notifications?unread=1');
  check('Owner told about problems found', r.data.notifications.some((n) => /Inspection found/.test(n.title)), r.data.notifications.map((n) => n.title));
  const photoId = record.photos && record.photos[0] && record.photos[0].id;
  r = await owner('GET', `/api/photos/${photoId}`);
  check('Owner can view the photo', r.status === 200 && r.type === 'image/jpeg', r.status);
  r = await near('GET', `/api/photos/${photoId}`);
  check('Caretaker who took it can view it', r.status === 200, r.status);
  r = await other('GET', `/api/photos/${photoId}`);
  check('Another owner cannot -> 404', r.status === 404, r.status);
  r = await far('GET', `/api/photos/${photoId}`);
  check('Another caretaker cannot -> 404', r.status === 404, r.status);
  r = await anon('GET', `/api/photos/${photoId}`);
  check('Logged-out user cannot -> 401', r.status === 401, r.status);

  console.log('\nRatings and reviews');
  r = await owner('POST', '/api/reviews', { task_id: taskId, rating: 6 });
  check('Rating 6 -> 400', r.status === 400, r.data);
  r = await other('POST', '/api/reviews', { task_id: taskId, rating: 1 });
  check("Another owner cannot rate someone else's job -> 404", r.status === 404, r.data);
  r = await near('POST', '/api/reviews', { task_id: taskId, rating: 5 });
  check('Caretaker cannot rate -> 403', r.status === 403, r.data);
  r = await owner('POST', '/api/reviews', { task_id: taskId, rating: 5, comment: 'Quick and careful.' });
  check('Owner rates 5 stars -> 201', r.status === 201, r.data);
  r = await owner('POST', '/api/reviews', { task_id: taskId, rating: 4, comment: 'Changed my mind slightly.' });
  check('Owner edits rating -> 200', r.status === 200 && r.data.review.rating === 4, r.data);
  r = await anon('GET', `/api/reviews?caretaker_id=${nearUser.id}`);
  check('Reviews need login -> 401', r.status === 401, r.status);
  r = await other('GET', `/api/reviews?caretaker_id=${nearUser.id}`);
  check('Average rating = 4.0 from 1 review', r.data.caretaker.avg_rating === 4 && r.data.caretaker.review_count === 1 && r.data.stars['4'] === 1, r.data);
  check("Reviewer shown by first name only", r.data.reviews[0].owner_first_name === 'Feature', r.data.reviews[0]);
  r = await owner('GET', `/api/maintenance/${taskId}`);
  check('Task shows the rating', r.data.task.review_rating === 4, r.data.task);
  r = await near('GET', '/api/notifications?unread=1');
  check('Caretaker notified of review', r.data.notifications.some((n) => /review/i.test(n.title)), r.data.notifications.map((n) => n.title));

  console.log('\nAI assistant and care plans');
  r = await owner('POST', '/api/ai/chat', { message: 'My Alto has been parked for 70 days. What should I do about the battery?', vehicle_id: vehicle.id });
  check(`Chat answer from ${aiExpected}`, r.status === 200 && r.data.reply.source === aiExpected && r.data.reply.content.length > 20, r.data);
  r = await owner('POST', '/api/ai/chat', { message: 'hi', vehicle_id: 999999 });
  check("Chat about someone else's vehicle -> 404", r.status === 404, r.data);
  r = await owner('POST', '/api/ai/chat', { message: '' });
  check('Empty message -> 400', r.status === 400, r.data);
  r = await owner('GET', '/api/ai/messages');
  check('Chat history saved (question + answer)', r.data.messages.length === 2 && r.data.messages[0].role === 'user', r.data.messages.length);
  r = await other('GET', '/api/ai/messages');
  check("Other users can't see this chat", r.data.messages.length === 0, r.data.messages.length);
  r = await owner('DELETE', '/api/ai/messages');
  r = await owner('GET', '/api/ai/messages');
  check('Clear chat history', r.data.messages.length === 0, r.data.messages.length);
  r = await near('POST', '/api/ai/chat', { message: 'How should I plan this week?' });
  check('Caretaker can use the assistant', r.status === 200 && r.data.reply.content.length > 10, r.data);
  r = await owner('POST', '/api/ai/care-plan', { vehicle_id: vehicle.id });
  check(`Care plan from ${aiExpected}`, r.status === 200 && r.data.source === aiExpected && r.data.tasks.length >= 1, r.data);
  const planOk = (r.data.tasks || []).every((t) => t.title && ['low', 'medium', 'high'].includes(t.priority) && t.due_in_days >= 0 && t.due_in_days <= 365);
  check('Plan items are well-formed', planOk, r.data.tasks);
  r = await near('POST', '/api/ai/care-plan', { vehicle_id: vehicle.id });
  check('Caretaker cannot generate owner care plans -> 403', r.status === 403, r.data);
  r = await other('POST', '/api/ai/care-plan', { vehicle_id: vehicle.id });
  check("Care plan for someone else's vehicle -> 404", r.status === 404, r.data);

  console.log('\nDashboards');
  r = await owner('GET', '/api/dashboard');
  check('Owner dashboard has average health', typeof r.data.stats.avg_health === 'number' && Array.isArray(r.data.health), r.data.stats);
  r = await near('GET', '/api/dashboard');
  check('Caretaker dashboard shows rating', r.data.stats.avg_rating === 4 && r.data.stats.review_count === 1, r.data.stats);

  console.log('\nCleanup');
  for (const v of [vehicle, noPin]) {
    r = await owner('DELETE', `/api/vehicles/${v.id}`);
  }
  r = await owner('GET', `/api/photos/${photoId}`);
  check('Photos removed with the vehicle', r.status === 404, r.status);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  void ownerUser;
}

main().catch((err) => {
  console.error('\nFeature test crashed:', err.message);
  process.exitCode = 1;
});
