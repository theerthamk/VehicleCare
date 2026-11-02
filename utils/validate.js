// Whitelist-based input validation.
// Only fields listed in `rules` are copied to the result, so a client
// can never set columns such as owner_id or role by adding extra fields.
const { HttpError } = require('./http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * @param {object} body     request body
 * @param {object} rules    { field: { type, required, label, max, min, values } }
 * @param {object} options  { partial: true } validates only fields that are present (for updates)
 * @returns {object} cleaned values (blank optional fields become null)
 */
function validate(body, rules, options = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const out = {};
  const errors = {};

  for (const [field, rule] of Object.entries(rules)) {
    const label = rule.label || field;
    const present = Object.prototype.hasOwnProperty.call(input, field);
    if (options.partial && !present) continue;

    let value = input[field];
    if (typeof value === 'string') value = value.trim();

    if (isBlank(value)) {
      if (rule.required) errors[field] = `${label} is required.`;
      else out[field] = null;
      continue;
    }

    switch (rule.type) {
      case 'string':
        value = String(value);
        if (rule.min && value.length < rule.min) errors[field] = `${label} must be at least ${rule.min} characters.`;
        else if (rule.max && value.length > rule.max) errors[field] = `${label} must be at most ${rule.max} characters.`;
        break;
      case 'email':
        value = String(value).toLowerCase();
        if (!EMAIL_RE.test(value) || value.length > 150) errors[field] = `${label} must be a valid email address.`;
        break;
      case 'enum':
        value = String(value);
        if (!rule.values.includes(value)) errors[field] = `${label} must be one of: ${rule.values.join(', ')}.`;
        break;
      case 'date':
        value = String(value);
        if (!isRealDate(value)) errors[field] = `${label} must be a valid date (YYYY-MM-DD).`;
        break;
      case 'int': {
        const n = Number(value);
        if (!Number.isInteger(n)) errors[field] = `${label} must be a whole number.`;
        else if (rule.min !== undefined && n < rule.min) errors[field] = `${label} must be at least ${rule.min}.`;
        else if (rule.max !== undefined && n > rule.max) errors[field] = `${label} must be at most ${rule.max}.`;
        value = n;
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) errors[field] = `${label} must be a number.`;
        else if (rule.min !== undefined && n < rule.min) errors[field] = `${label} must be at least ${rule.min}.`;
        else if (rule.max !== undefined && n > rule.max) errors[field] = `${label} must be at most ${rule.max}.`;
        value = Math.round(n * 1e6) / 1e6;
        break;
      }
      case 'money': {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) errors[field] = `${label} must be a positive amount.`;
        else if (n > 99999999) errors[field] = `${label} is too large.`;
        value = Math.round(n * 100) / 100;
        break;
      }
      default:
        throw new Error(`Unknown validation type "${rule.type}" for ${field}`);
    }
    out[field] = value;
  }

  if (Object.keys(errors).length) {
    throw new HttpError(400, Object.values(errors)[0], errors);
  }
  return out;
}

// Today's date as YYYY-MM-DD in the server's local time zone.
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { validate, today, isRealDate };
