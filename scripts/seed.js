// Fills the database with demo data for a presentation.
// Usage:  npm run db:seed          (asks for confirmation)
//         npm run db:seed -- --yes (no prompt)
// All dates are relative to today, so the demo always has
// upcoming, overdue and completed work.
const bcrypt = require('bcryptjs');
const { DB_NAME, connect, confirm, fail } = require('./lib');
const { rulesInspectionReport } = require('../services/careRules');

const DEMO_PASSWORD = 'Demo@1234';

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  const ok = await confirm(`This DELETES all users, vehicles and records in "${DB_NAME}" and loads demo data.`);
  if (!ok) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  const conn = await connect();
  try {
    // Clear existing data and restart IDs at 1 (TRUNCATE commits on its own,
    // so it runs before the transaction that inserts the demo data).
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['ai_messages', 'job_bids', 'job_posts', 'reviews', 'record_photos', 'notifications',
      'maintenance_records', 'service_requests', 'maintenance_tasks', 'vehicles', 'users']) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    await conn.beginTransaction();

    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const addUser = async (u) => {
      const [r] = await conn.execute(
        `INSERT INTO users (full_name, email, password_hash, role, phone, city, specialization, bio, latitude, longitude, service_radius_km)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.name, u.email, hash, u.role, u.phone || null, u.city || null, u.spec || null, u.bio || null,
          u.lat || null, u.lng || null, u.radius || 15]
      );
      return r.insertId;
    };

    const arun = await addUser({ name: 'Arun Nair', email: 'owner@demo.com', role: 'owner', phone: '+91 98470 11111', city: 'Thiruvananthapuram' });
    const meera = await addUser({ name: 'Meera Pillai', email: 'owner2@demo.com', role: 'owner', phone: '+91 98470 22222', city: 'Kochi' });
    const rahul = await addUser({
      name: 'Rahul Menon', email: 'caretaker@demo.com', role: 'caretaker', phone: '+91 94470 33333',
      city: 'Thiruvananthapuram', spec: 'Battery, tyre and engine-start checks',
      bio: 'Mobile mechanic with 8 years of experience looking after parked cars and bikes.',
      lat: 8.5006, lng: 76.9603, radius: 15
    });
    const sneha = await addUser({
      name: 'Sneha Kurian', email: 'caretaker2@demo.com', role: 'caretaker', phone: '+91 94470 44444',
      city: 'Kochi', spec: 'Long-term storage care and detailing',
      bio: 'Covers, cleaning, rodent checks and fluid top-ups for vehicles in storage.',
      lat: 10.0159, lng: 76.3419, radius: 20
    });
    const vishnu = await addUser({
      name: 'Vishnu Das', email: 'caretaker3@demo.com', role: 'caretaker', phone: '+91 94470 55555',
      city: 'Thiruvananthapuram', spec: 'Two-wheeler servicing, chain and battery care',
      lat: 8.5300, lng: 76.9370, radius: 10
    });
    const anjali = await addUser({
      name: 'Anjali Suresh', email: 'caretaker4@demo.com', role: 'caretaker', phone: '+91 94470 66666',
      city: 'Thiruvananthapuram', spec: 'Rodent-proofing, detailing and storage care',
      bio: 'Former service-centre technician. I visit weekly and send photos after every check.',
      lat: 8.5115, lng: 76.9785, radius: 12
    });

    const addVehicle = async (v) => {
      const [r] = await conn.execute(
        `INSERT INTO vehicles (owner_id, make, model, year, registration_number, vehicle_type, status, parked_since, location, notes, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.owner, v.make, v.model, v.year, v.reg, v.type, v.status, v.parked, v.location, v.notes || null, v.lat || null, v.lng || null]
      );
      return r.insertId;
    };

    const swift = await addVehicle({ owner: arun, make: 'Maruti Suzuki', model: 'Swift', year: 2019, reg: 'KL-01-AB-1234', type: 'car', status: 'parked', parked: daysFromToday(-64), location: 'Home garage, Kowdiar', notes: 'Owner working abroad until March.', lat: 8.5241, lng: 76.9608 });
    const enfield = await addVehicle({ owner: arun, make: 'Royal Enfield', model: 'Classic 350', year: 2021, reg: 'KL-01-CD-5678', type: 'motorcycle', status: 'stored', parked: daysFromToday(-130), location: 'Covered parking, Pattom', lat: 8.5190, lng: 76.9420 });
    const activa = await addVehicle({ owner: arun, make: 'Honda', model: 'Activa 6G', year: 2022, reg: 'KL-01-EF-9012', type: 'scooter', status: 'active', parked: null, location: 'Home, Kowdiar', lat: 8.5236, lng: 76.9615 });
    const creta = await addVehicle({ owner: meera, make: 'Hyundai', model: 'Creta', year: 2020, reg: 'KL-07-GH-3456', type: 'car', status: 'parked', parked: daysFromToday(-45), location: 'Apartment basement, Kakkanad', lat: 10.0120, lng: 76.3500 });
    await addVehicle({ owner: meera, make: 'Tata', model: 'Ace', year: 2018, reg: 'KL-07-JK-7890', type: 'van', status: 'in_service', parked: null, location: 'Workshop, Edappally', lat: 10.0261, lng: 76.3125 });

    const addTask = async (t) => {
      const [r] = await conn.execute(
        `INSERT INTO maintenance_tasks (vehicle_id, assigned_to, title, description, due_date, status, priority, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.vehicle, t.to || null, t.title, t.desc || null, t.due, t.status || 'pending', t.priority || 'medium',
          t.status === 'completed' ? `${t.done} 17:00:00` : null]
      );
      return r.insertId;
    };
    // Records with notes get the built-in condition report, like new records do.
    const addRecord = async (r) => {
      const report = r.notes ? rulesInspectionReport(r.notes) : null;
      const [res] = await conn.execute(
        `INSERT INTO maintenance_records (vehicle_id, task_id, performed_by, record_type, service_date, notes, cost, ai_condition, ai_report, ai_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.vehicle, r.task || null, r.by, r.type, r.date, r.notes, r.cost,
          report ? report.condition : null, report ? JSON.stringify({ summary: report.summary, issues: report.issues }) : null,
          report ? 'rules' : null]
      );
      return res.insertId;
    };
    const addReview = async (task, owner, caretaker, rating, comment, daysAgo) => {
      await conn.execute(
        'INSERT INTO reviews (task_id, owner_id, caretaker_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [task, owner, caretaker, rating, comment, `${daysFromToday(-daysAgo)} 18:00:00`]
      );
    };

    // Swift: fortnightly battery start (assigned, due soon), overdue tyre check, completed past work
    await addTask({ vehicle: swift, to: rahul, title: 'Start engine and run 15 minutes', desc: 'Keeps the battery charged. Check for warning lights.', due: daysFromToday(2), priority: 'high' });
    const swiftTyre = await addTask({ vehicle: swift, to: rahul, title: 'Check tyre pressure', desc: 'Inflate to 33 psi. Look for flat spots.', due: daysFromToday(-3), status: 'in_progress', priority: 'medium' });
    await addRecord({ vehicle: swift, task: swiftTyre, by: rahul, type: 'inspection', date: daysFromToday(-2), notes: 'Front left at 26 psi. Will re-check after valve replacement.', cost: 0 });
    const swiftWash = await addTask({ vehicle: swift, to: rahul, title: 'Wash and cover', due: daysFromToday(-30), status: 'completed', done: daysFromToday(-29), priority: 'low' });
    await addRecord({ vehicle: swift, task: swiftWash, by: rahul, type: 'maintenance', date: daysFromToday(-29), notes: 'Exterior wash, interior vacuum, breathable cover fitted.', cost: 650 });
    const swiftBattery = await addTask({ vehicle: swift, to: rahul, title: 'Battery health test', due: daysFromToday(-60), status: 'completed', done: daysFromToday(-58), priority: 'high' });
    await addRecord({ vehicle: swift, task: swiftBattery, by: rahul, type: 'maintenance', date: daysFromToday(-58), notes: 'Battery at 12.3 V. Charged overnight, terminals cleaned.', cost: 400 });

    // Enfield: owner-managed tasks
    await addTask({ vehicle: enfield, title: 'Renew insurance', desc: 'Policy expires next week.', due: daysFromToday(6), priority: 'high' });
    const enfieldChain = await addTask({ vehicle: enfield, title: 'Lubricate chain', due: daysFromToday(-95), status: 'completed', done: daysFromToday(-95), priority: 'low' });
    await addRecord({ vehicle: enfield, task: enfieldChain, by: arun, type: 'maintenance', date: daysFromToday(-95), notes: 'Cleaned and lubricated chain myself.', cost: 250 });
    await addRecord({ vehicle: enfield, by: arun, type: 'maintenance', date: daysFromToday(-150), notes: 'Engine oil change before storage.', cost: 1450 });

    // Creta: Meera's car looked after by Sneha
    await addTask({ vehicle: creta, to: sneha, title: 'Rodent and wiring check', due: daysFromToday(4), priority: 'high' });
    const cretaFluid = await addTask({ vehicle: creta, to: sneha, title: 'Top up coolant and washer fluid', due: daysFromToday(-20), status: 'completed', done: daysFromToday(-19) });
    await addRecord({ vehicle: creta, task: cretaFluid, by: sneha, type: 'maintenance', date: daysFromToday(-19), notes: 'Coolant topped up (0.5 L). Washer fluid refilled.', cost: 520 });

    // Older completed work, so caretakers have ratings
    const activaStart = await addTask({ vehicle: activa, to: rahul, title: 'Start engine and check battery', due: daysFromToday(-90), status: 'completed', done: daysFromToday(-90) });
    await addRecord({ vehicle: activa, task: activaStart, by: rahul, type: 'maintenance', date: daysFromToday(-90), notes: 'Started fine, battery terminals cleaned.', cost: 200 });
    const activaTyre = await addTask({ vehicle: activa, to: vishnu, title: 'Tyre pressure and brake check', due: daysFromToday(-40), status: 'completed', done: daysFromToday(-40) });
    await addRecord({ vehicle: activa, task: activaTyre, by: vishnu, type: 'maintenance', date: daysFromToday(-40), notes: 'Rear tyre at 22 psi, inflated. Brakes fine.', cost: 150 });

    await addReview(swiftWash, arun, rahul, 5, 'Very thorough, sent photos of the cover fitted. Will book again.', 28);
    await addReview(swiftBattery, arun, rahul, 4, 'Good work, came a day later than planned.', 57);
    await addReview(activaStart, arun, rahul, 5, 'Quick and professional.', 89);
    await addReview(activaTyre, arun, vishnu, 4, 'Found the low rear tyre. Polite.', 39);
    await addReview(cretaFluid, meera, sneha, 5, 'Reliable and explains everything clearly.', 18);

    // Service requests for Arun
    const acceptedTask = await addTask({ vehicle: swift, to: rahul, title: 'Brake inspection', desc: 'Car has not moved in 2 months; check for brake rust.', due: daysFromToday(9) });
    const insertRequest = async (q) => {
      await conn.execute(
        `INSERT INTO service_requests (vehicle_id, owner_id, provider_id, task_id, service_type, details, preferred_date, request_date, status, provider_note, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.vehicle, q.owner, q.provider, q.task || null, q.type, q.details || null, q.preferred || null,
          `${q.requested} 10:00:00`, q.status, q.note || null, q.cost === undefined ? null : q.cost]
      );
    };
    await insertRequest({ vehicle: swift, owner: arun, provider: rahul, task: acceptedTask, type: 'Brake inspection', details: 'Car has not moved in 2 months; check for brake rust.', preferred: daysFromToday(9), requested: daysFromToday(-3), status: 'accepted', note: 'Will bring a jack and inspect all four wheels.' });
    await insertRequest({ vehicle: swift, owner: arun, provider: rahul, task: swiftWash, type: 'Wash and cover', requested: daysFromToday(-33), status: 'completed', cost: 650 });
    await insertRequest({ vehicle: enfield, owner: arun, provider: rahul, type: 'Battery charging', details: 'Bike battery is probably flat after 4 months.', preferred: daysFromToday(5), requested: daysFromToday(-1), status: 'pending' });
    await insertRequest({ vehicle: enfield, owner: arun, provider: sneha, type: 'Detailing', requested: daysFromToday(-12), status: 'declined', note: 'Sorry, I only cover Kochi.' });

    // Open job in the job pool with two bids (Rahul has not bid yet, so he sees it in Find Jobs)
    const [job] = await conn.execute(
      `INSERT INTO job_posts (owner_id, vehicle_id, title, description, preferred_date, budget, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [arun, enfield, 'Monsoon rodent-proofing and underbody check',
        'Bike has been stored for 4 months in a covered parking. Check wiring for rodent damage, spray repellent and check the underbody for rust.',
        daysFromToday(4), 800, `${daysFromToday(-1)} 09:30:00`]
    );
    await conn.execute(
      'INSERT INTO job_bids (job_id, caretaker_id, price, message, created_at) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
      [job.insertId, vishnu, 700, 'I can come on Saturday morning. I service two-wheelers daily.', `${daysFromToday(-1)} 11:00:00`,
        job.insertId, anjali, 750, 'Includes repellent spray and photos of the wiring.', `${daysFromToday(-1)} 15:20:00`]
    );

    const addNote = async (user, title, message, link, readDaysAgo) => {
      await conn.execute(
        'INSERT INTO notifications (user_id, title, message, link, read_at) VALUES (?, ?, ?, ?, ?)',
        [user, title, message, link, readDaysAgo === undefined ? null : `${daysFromToday(-readDaysAgo)} 12:00:00`]
      );
    };
    await addNote(arun, 'Service request accepted', 'Rahul Menon accepted "Brake inspection" for Maruti Suzuki Swift (KL-01-AB-1234).', '/pages/services.html');
    await addNote(arun, 'Inspection recorded', 'Rahul Menon added an inspection for "Check tyre pressure" on Maruti Suzuki Swift (KL-01-AB-1234).', '/pages/maintenance.html');
    await addNote(arun, 'Maintenance completed', 'Rahul Menon completed "Wash and cover" on Maruti Suzuki Swift (KL-01-AB-1234). Total cost: 650.00.', '/pages/history.html', 28);
    await addNote(arun, 'New bid on your job', 'Anjali Suresh bid ₹750.00 for "Monsoon rodent-proofing and underbody check" (Royal Enfield Classic 350).', '/pages/jobs.html');
    await addNote(rahul, 'New job near you', '"Monsoon rodent-proofing and underbody check" for a Royal Enfield Classic 350, 2.9 km away, budget ₹800. Place a bid in Find Jobs.', '/pages/jobs.html');
    await addNote(rahul, 'New service request', 'Arun Nair requested "Battery charging" for Royal Enfield Classic 350 (KL-01-CD-5678).', '/pages/services.html');
    await addNote(sneha, 'New task assigned', 'Meera Pillai assigned "Rodent and wiring check" for Hyundai Creta (KL-07-GH-3456).', '/pages/maintenance.html');

    await conn.commit();
    console.log('Demo data loaded.\n');
    console.log(`  Password for every demo account: ${DEMO_PASSWORD}`);
    console.log('  Owner      owner@demo.com       (Arun Nair)');
    console.log('  Owner      owner2@demo.com      (Meera Pillai)');
    console.log('  Caretaker  caretaker@demo.com   (Rahul Menon)');
    console.log('  Caretaker  caretaker2@demo.com  (Sneha Kurian)');
    console.log('  Caretaker  caretaker3@demo.com  (Vishnu Das)');
    console.log('  Caretaker  caretaker4@demo.com  (Anjali Suresh)');
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch(fail);
