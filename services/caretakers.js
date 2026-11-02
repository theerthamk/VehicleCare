// Shared caretaker query + ranking used by the provider directory and job bids.
const { distanceKm } = require('../utils/geo');
const { matchScore, isTopRated } = require('./matching');

const CARETAKER_SELECT = `
  SELECT u.id, u.full_name, u.phone, u.city, u.specialization, u.bio,
         u.latitude, u.longitude, u.service_radius_km, u.created_at,
         (SELECT COUNT(*) FROM maintenance_tasks t WHERE t.assigned_to = u.id AND t.status = 'completed') AS completed_jobs,
         (SELECT COUNT(*) FROM maintenance_tasks t WHERE t.assigned_to = u.id AND t.status IN ('pending', 'in_progress')) AS open_jobs,
         (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.caretaker_id = u.id) AS avg_rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.caretaker_id = u.id) AS review_count
  FROM users u
  WHERE u.role = 'caretaker'`;

// Adds distance, coverage, match score and badge. Exact home coordinates are
// rounded to ~1 km before being sent to other users.
function decorate(c, origin, jobText) {
  const distance = origin ? distanceKm(origin, c) : null;
  const out = {
    ...c,
    avg_rating: c.avg_rating === null ? null : Number(c.avg_rating),
    distance_km: distance,
    covers: distance !== null ? distance <= Number(c.service_radius_km) : null,
    top_rated: isTopRated(c),
    latitude: c.latitude === null ? null : Math.round(Number(c.latitude) * 100) / 100,
    longitude: c.longitude === null ? null : Math.round(Number(c.longitude) * 100) / 100
  };
  out.match_score = matchScore(out, jobText);
  return out;
}

module.exports = { CARETAKER_SELECT, decorate };
