// Built-in vehicle-care knowledge. Used for:
//   - the Vehicle Health Score (always)
//   - care plans, chat answers and inspection reports when Gemini is not
//     configured or not reachable (so the demo works offline).

const DAY = 86400000;

function daysSince(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / DAY);
}

function isParked(v) {
  return v.status === 'parked' || v.status === 'stored';
}

// ---------------------------------------------------------------
// Vehicle Health Score: 0-100 with the reasons that lowered it.
// stats: { overdue_tasks, last_service, last_condition }
// ---------------------------------------------------------------
function healthScore(vehicle, stats = {}) {
  let score = 100;
  const reasons = [];
  const parkedDays = isParked(vehicle) ? daysSince(vehicle.parked_since) : null;
  const serviceDays = daysSince(stats.last_service);

  if (parkedDays !== null) {
    let penalty = 0;
    if (parkedDays > 120) penalty = 25;
    else if (parkedDays > 60) penalty = 18;
    else if (parkedDays > 30) penalty = 10;
    else if (parkedDays > 14) penalty = 5;
    if (penalty) {
      score -= penalty;
      reasons.push(`Parked for ${parkedDays} days`);
    }
  }

  if (serviceDays === null) {
    if (parkedDays !== null && parkedDays > 30) {
      score -= 15;
      reasons.push('No care recorded since it was parked');
    }
  } else if (serviceDays > 90) {
    score -= 20;
    reasons.push(`Last care was ${serviceDays} days ago`);
  } else if (serviceDays > 45) {
    score -= 10;
    reasons.push(`Last care was ${serviceDays} days ago`);
  }

  const overdue = Number(stats.overdue_tasks) || 0;
  if (overdue) {
    score -= Math.min(36, overdue * 12);
    reasons.push(`${overdue} overdue task${overdue === 1 ? '' : 's'}`);
  }

  if (stats.last_condition === 'poor') {
    score -= 25;
    reasons.push('Last inspection found serious problems');
  } else if (stats.last_condition === 'fair') {
    score -= 10;
    reasons.push('Last inspection found minor problems');
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'Good' : score >= 55 ? 'Fair' : 'Needs attention';
  return { score, label, reasons };
}

// ---------------------------------------------------------------
// Rule-based care plan.
// context: { last_service, open_task_titles: [] }
// Returns [{ title, description, due_in_days, priority, reason }]
// ---------------------------------------------------------------
function similarTitle(a, b) {
  const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);
  const wa = words(a);
  const wb = words(b);
  let common = 0;
  wa.forEach((w) => { if (wb.has(w)) common += 1; });
  return common >= 2 || (common === 1 && Math.min(wa.size, wb.size) === 1);
}

function rulesCarePlan(vehicle, context = {}) {
  const parked = isParked(vehicle) ? (daysSince(vehicle.parked_since) || 0) : 0;
  const twoWheeler = ['motorcycle', 'scooter'].includes(vehicle.vehicle_type);
  const items = [];
  const add = (title, description, dueInDays, priority, reason) =>
    items.push({ title, description, due_in_days: dueInDays, priority, reason });

  if (isParked(vehicle) || vehicle.status === 'in_service') {
    add('Start engine and run 15 minutes',
      twoWheeler ? 'Start the engine, let it idle 10–15 minutes and rev gently. Ride a short distance if possible.'
        : 'Start the engine, idle 15 minutes with the AC on briefly, and move the car a few feet so tyres do not rest on one spot.',
      2, parked > 30 ? 'high' : 'medium',
      'Batteries lose charge and seals dry out when an engine is not run for 2+ weeks.');
    add('Check tyre pressure',
      'Inflate to the pressure on the door sticker or manual. Look for flat spots and cracks.',
      7, 'medium', 'Parked vehicles lose about 1–2 psi a month and tyres can develop flat spots.');
  }
  if (parked > 21) {
    add(twoWheeler ? 'Clean and cover the vehicle' : 'Wash and fit a breathable cover',
      'Wash off dust and bird droppings, dry fully, then use a breathable (not plastic) cover.',
      10, 'low', 'Dust, bird droppings and humidity damage paint and rubber over time.');
  }
  if (parked > 30) {
    add('Battery health test',
      'Measure battery voltage (healthy is above 12.4 V). Charge or use a battery maintainer if low; clean the terminals.',
      3, 'high', `Parked for ${parked} days — batteries often go flat after a month.`);
    add('Rodent and wiring check',
      'Look under the bonnet and seats for chewed wires, nests or droppings. Use rodent repellent spray.',
      5, 'high', 'Rats chewing wiring is a common, expensive problem for parked vehicles.');
  }
  if (parked > 45 && !twoWheeler) {
    add('Check for fluid leaks and top up coolant',
      'Check the ground under the car for drips; check coolant, brake fluid and washer fluid levels.',
      10, 'medium', 'Seals can dry and start leaking when a vehicle stands for weeks.');
  }
  if (parked > 60) {
    add('Brake inspection for rust',
      'Check discs and drums for rust and make sure the brakes release fully before driving.',
      14, 'medium', 'Brake discs rust quickly in humid weather when the vehicle is not used.');
  }
  if (vehicle.vehicle_type === 'motorcycle') {
    add('Clean and lubricate chain', 'Clean the chain with chain cleaner, then lubricate evenly.',
      14, 'low', 'An unused chain rusts and stiffens, especially in humid weather.');
  }
  if (parked > 180) {
    add('Engine oil change before use',
      'Change the engine oil and filter before driving regularly again.',
      21, 'medium', 'Engine oil degrades over time even when the vehicle is not driven.');
  }
  if (vehicle.status === 'active') {
    add('Monthly general inspection',
      'Check tyres, lights, fluid levels and battery terminals.',
      14, 'low', 'A quick monthly check catches small problems early.');
  }

  const openTitles = context.open_task_titles || [];
  return items.filter((item) => !openTitles.some((t) => similarTitle(t, item.title)));
}

// ---------------------------------------------------------------
// Rule-based inspection report from the caretaker's notes.
// ---------------------------------------------------------------
const ISSUE_RULES = [
  { re: /\b(flat (tyre|tire)|(tyre|tire)s? (is |are |was |were |looks |looked )?flat|puncture|punctured|deflated)\b/i, issue: 'Flat or punctured tyre', severity: 'high', recommendation: 'Repair or replace the tyre before moving the vehicle.' },
  { re: /\b(\d{1,2})\s*psi\b/i, test: (m) => Number(m[1]) < 28, resolved: /inflated|re-?filled|pumped/i, issue: 'Low tyre pressure', severity: 'medium', recommendation: 'Inflate to the recommended pressure and re-check in a week for slow leaks.' },
  { re: /low (tyre|tire) pressure/i, resolved: /inflated|re-?filled|pumped/i, issue: 'Low tyre pressure', severity: 'medium', recommendation: 'Inflate to the recommended pressure and re-check in a week for slow leaks.' },
  { re: /\b(leak|leaking|drip|dripping)\b/i, issue: 'Fluid leak', severity: 'high', recommendation: 'Identify the fluid (oil, coolant, brake) and get it checked by a mechanic.' },
  { re: /\b(rat|rats|rodent|chewed|nest|droppings)\b/i, issue: 'Rodent activity', severity: 'high', recommendation: 'Inspect all wiring, remove nests and use rodent repellent.' },
  { re: /\b(dead|flat) battery|won'?t start|did not start|not starting|(\d{1,2}\.\d)\s*v\b/i, test: (m) => (m[2] ? Number(m[2]) < 12.3 : true), resolved: /charged|replaced|jump.?start(ed)?/i, issue: 'Weak or dead battery', severity: 'high', recommendation: 'Charge the battery fully; replace it if it does not hold charge.' },
  { re: /\b(rust|rusty|corrosion|corroded)\b/i, issue: 'Rust or corrosion', severity: 'medium', recommendation: 'Clean affected parts; check brake discs and battery terminals.' },
  { re: /\b(crack|cracked|scratch|dent)\b/i, issue: 'Body or glass damage', severity: 'medium', recommendation: 'Photograph and monitor; repair cracks before they spread.' },
  { re: /\b(mould|mold|fungus|smell|musty)\b/i, issue: 'Damp or mould inside', severity: 'medium', recommendation: 'Air out the cabin, use a moisture absorber and clean the AC vents.' }
];

function rulesInspectionReport(notes, photoCount = 0) {
  const text = String(notes || '');
  const issues = [];
  ISSUE_RULES.forEach((rule) => {
    const m = text.match(rule.re);
    // "resolved" words mean the caretaker already fixed it during the visit.
    if (m && (!rule.test || rule.test(m)) && !(rule.resolved && rule.resolved.test(text)) &&
        !issues.some((i) => i.issue === rule.issue)) {
      issues.push({ issue: rule.issue, severity: rule.severity, recommendation: rule.recommendation });
    }
  });
  const condition = issues.some((i) => i.severity === 'high') ? 'poor' : issues.length ? 'fair' : 'good';
  const summary = issues.length
    ? `Notes mention ${issues.map((i) => i.issue.toLowerCase()).join(', ')}.`
    : `No problems mentioned in the notes${photoCount ? ` (${photoCount} photo${photoCount === 1 ? '' : 's'} attached)` : ''}.`;
  return { condition, summary, issues };
}

// ---------------------------------------------------------------
// Rule-based chat answer.
// ---------------------------------------------------------------
const TOPICS = [
  { re: /batter/i, text: 'Battery: start the engine every 1–2 weeks for 15 minutes, or connect a battery maintainer. A healthy resting voltage is about 12.4–12.7 V; below 12.2 V it needs charging.' },
  { re: /tyre|tire|pressure|psi/i, text: 'Tyres: check pressure every 2–4 weeks and inflate to the door-sticker value. Moving the vehicle a few feet every couple of weeks prevents flat spots.' },
  { re: /rust|brake/i, text: 'Brakes: discs rust quickly in humid weather. Light surface rust wears off after a few gentle stops; heavy rust or sticking brakes need a mechanic.' },
  { re: /rat|rodent|wire|wiring/i, text: 'Rodents: check under the bonnet regularly, keep the area clean, use repellent spray or peppermint oil, and avoid parking near food waste.' },
  { re: /oil/i, text: 'Engine oil: change it every 6–12 months even if the vehicle is barely driven, because oil degrades with time.' },
  { re: /insur|pollution|puc|document|registration|rc\b/i, text: 'Documents: keep insurance and pollution certificate (PUC) valid even when parked — add renewal reminders as tasks with due dates.' },
  { re: /wash|cover|dust|paint/i, text: 'Body: wash before covering, and use a breathable cover rather than plastic, which traps moisture.' },
  { re: /fuel|petrol|diesel/i, text: 'Fuel: before long storage, fill the tank to reduce condensation; petrol can go stale after about 3 months.' }
];

function rulesChatReply(message, vehicles = []) {
  const parts = [];
  TOPICS.forEach((t) => { if (t.re.test(message)) parts.push(t.text); });

  const focus = vehicles.filter((v) => isParked(v)).sort((a, b) => (daysSince(b.parked_since) || 0) - (daysSince(a.parked_since) || 0));
  if (!parts.length || /what should|plan|advice|help|parked|long/i.test(message)) {
    if (focus.length) {
      const v = focus[0];
      const plan = rulesCarePlan(v, { open_task_titles: v.open_task_titles || [] }).slice(0, 4);
      parts.push(`Your ${v.make} ${v.model} has been parked for ${daysSince(v.parked_since) || 0} days.` +
        (plan.length ? ` Suggested next steps: ${plan.map((p) => p.title.toLowerCase()).join('; ')}.` : ' Its open tasks already cover the basics.'));
    } else {
      parts.push('For a vehicle that is not used regularly: start it every 1–2 weeks, check tyre pressure monthly, keep the battery charged, watch for rodents, and keep documents up to date.');
    }
  }
  return `${parts.join('\n\n')}\n\n(Built-in guidance — add a Gemini API key for full AI answers.)`;
}

module.exports = { healthScore, rulesCarePlan, rulesInspectionReport, rulesChatReply, daysSince, isParked };
