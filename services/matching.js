// Caretaker match score (0-100) used to rank providers and job bids.
//
//   Rating      45 pts  Bayesian average: new caretakers start near 4.0 instead of
//                       jumping to 5.0 after a single good review.
//   Distance    30 pts  Closer is better; 0 pts at the edge of their service radius.
//   Experience  15 pts  Completed jobs on the platform (capped at 20).
//   Skills      10 pts  Words in their "services offered" that match the job.

const PRIOR_RATING = 4.0;
const PRIOR_WEIGHT = 2;

function bayesianRating(avg, count) {
  const n = Number(count) || 0;
  const a = avg === null || avg === undefined ? PRIOR_RATING : Number(avg);
  return (a * n + PRIOR_RATING * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
}

function skillMatch(specialization, jobText) {
  if (!specialization || !jobText) return 0;
  const words = (s) => new Set((String(s).toLowerCase().match(/[a-z]{4,}/g) || []).map((w) => w.replace(/(ing|s)$/, '')));
  const skills = words(specialization);
  const job = words(jobText);
  let hits = 0;
  job.forEach((w) => { if (skills.has(w)) hits += 1; });
  return Math.min(1, hits / 2);
}

function matchScore(c, jobText) {
  const rating = (bayesianRating(c.avg_rating, c.review_count) / 5) * 45;
  let distance = 15; // unknown distance: neutral
  if (c.distance_km !== null && c.distance_km !== undefined) {
    const radius = Math.max(1, Number(c.service_radius_km) || 15);
    distance = Math.max(0, 1 - c.distance_km / radius) * 30;
  }
  const experience = (Math.min(20, Number(c.completed_jobs) || 0) / 20) * 15;
  const skills = skillMatch(c.specialization, jobText) * 10;
  return Math.round(rating + distance + experience + skills);
}

// "Top rated" badge: at least 3 reviews and an average of 4.5 or more.
function isTopRated(c) {
  return Number(c.review_count) >= 3 && Number(c.avg_rating) >= 4.5;
}

module.exports = { matchScore, isTopRated, bayesianRating };
