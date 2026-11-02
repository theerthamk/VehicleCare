// Stores inspection photos on disk in uploads/records/.
// Photos arrive from the browser as base64 data URLs (already resized there).
// The file type is checked from the file's own bytes, not just its label,
// and files get random names so nobody can guess or overwrite them.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('../utils/http');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'records');
const MAX_PHOTOS = 4;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB per photo after decoding

const TYPES = {
  'image/jpeg': { ext: '.jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: '.png', check: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: '.webp', check: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' }
};

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Turns the request's `photos` array into validated { mime, buffer, base64 } items.
function decodePhotos(photos) {
  if (photos === undefined || photos === null) return [];
  if (!Array.isArray(photos)) throw new HttpError(400, 'Photos must be a list.');
  if (photos.length > MAX_PHOTOS) throw new HttpError(400, `You can attach at most ${MAX_PHOTOS} photos.`, { photos: `At most ${MAX_PHOTOS} photos.` });

  return photos.map((dataUrl, index) => {
    const m = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpError(400, `Photo ${index + 1} is not a JPEG, PNG or WebP image.`, { photos: 'Unsupported image.' });
    const buffer = Buffer.from(m[2], 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) {
      throw new HttpError(400, `Photo ${index + 1} is too large (max 3 MB).`, { photos: 'Photo too large.' });
    }
    if (!TYPES[m[1]].check(buffer)) {
      throw new HttpError(400, `Photo ${index + 1} is not a valid image file.`, { photos: 'Invalid image file.' });
    }
    return { mime: m[1], buffer, base64: m[2] };
  });
}

// Writes the photos and returns their new file names.
function savePhotos(decoded) {
  if (!decoded.length) return [];
  ensureDir();
  return decoded.map((p) => {
    const fileName = crypto.randomBytes(16).toString('hex') + TYPES[p.mime].ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, fileName), p.buffer, { flag: 'wx' });
    return { fileName, mime: p.mime, size: p.buffer.length };
  });
}

function removeFiles(fileNames) {
  fileNames.forEach((name) => {
    fs.rm(path.join(UPLOAD_DIR, path.basename(name)), { force: true }, () => {});
  });
}

function filePath(fileName) {
  return path.join(UPLOAD_DIR, path.basename(fileName));
}

module.exports = { decodePhotos, savePhotos, removeFiles, filePath, MAX_PHOTOS, UPLOAD_DIR };
