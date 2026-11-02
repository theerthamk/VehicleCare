// Distance helpers for "caretakers near me".

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function hasCoords(obj) {
  return obj && obj.latitude !== null && obj.latitude !== undefined &&
    obj.longitude !== null && obj.longitude !== undefined;
}

// Great-circle distance in km between two {latitude, longitude} points (haversine formula).
function distanceKm(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLon = toRad(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(Number(b.latitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  return Math.round(km * 10) / 10;
}

// Validation rules for a latitude / longitude pair (used with utils/validate).
const coordRules = {
  latitude: { type: 'number', min: -90, max: 90, label: 'Latitude' },
  longitude: { type: 'number', min: -180, max: 180, label: 'Longitude' }
};

// Latitude and longitude must be given together (or both left empty).
function checkCoordPair(data) {
  const { HttpError } = require('./http');
  const hasLat = data.latitude !== null && data.latitude !== undefined;
  const hasLng = data.longitude !== null && data.longitude !== undefined;
  if (hasLat !== hasLng) {
    throw new HttpError(400, 'Pick a point on the map (both latitude and longitude are needed).', {
      latitude: 'Location is incomplete.'
    });
  }
}

module.exports = { distanceKm, hasCoords, coordRules, checkCoordPair };
