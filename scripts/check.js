// Static project check: verifies that every API call in the frontend
// matches a route the backend actually defines (method + path).
// Usage: npm run check      (does not need the database)
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'check-script-placeholder-secret';
const app = require('../server');

// ---- Collect backend routes ----
function mountPath(layer) {
  // Express 4 stores the mount path only as a regexp, e.g. /^\/api\/vehicles\/?(?=\/|$)/i
  return layer.regexp.source
    .replace('^', '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/');
}

const routes = [];
for (const layer of app._router.stack) {
  if (layer.route) {
    Object.keys(layer.route.methods).forEach((m) => routes.push({ method: m.toUpperCase(), path: layer.route.path }));
  } else if (layer.name === 'router' && layer.handle.stack) {
    const prefix = mountPath(layer);
    for (const sub of layer.handle.stack) {
      if (!sub.route) continue;
      Object.keys(sub.route.methods).forEach((m) =>
        routes.push({ method: m.toUpperCase(), path: (prefix + sub.route.path).replace(/\/$/, '') }));
    }
  }
}

function matches(route, method, url) {
  if (route.method !== method) return false;
  const pattern = new RegExp(`^${route.path.replace(/:[^/]+/g, '[^/]+')}$`);
  return pattern.test(url);
}

// ---- Collect frontend calls ----
const METHODS = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE' };
const jsDir = path.join(__dirname, '..', 'public', 'js');
const callRe = /api\.(get|post|put|patch|del)\(\s*(?:api\.url\(\s*)?(['`])([^'`]+)\2/g;

let problems = 0;
let checked = 0;
for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(jsDir, file), 'utf8');
  let m;
  while ((m = callRe.exec(source))) {
    const method = METHODS[m[1]];
    const url = m[3].split('?')[0].replace(/\$\{[^}]+\}/g, '123');
    checked += 1;
    if (!routes.some((r) => matches(r, method, url))) {
      problems += 1;
      console.log(`  MISSING  ${method} ${m[3]}   (in public/js/${file})`);
    }
  }
}

console.log(`Backend routes: ${routes.length}. Frontend API calls checked: ${checked}.`);
if (problems) {
  console.log(`${problems} frontend call(s) do not match any backend route.`);
  process.exitCode = 1;
} else {
  console.log('All frontend API calls match backend routes.');
}
// The pool is created lazily and never connected here, so the process can exit.
require('../config/db').pool.end().catch(() => {});
