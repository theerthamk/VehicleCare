// Serves inspection photos to the people allowed to see them:
// the vehicle's owner, the caretaker who took them, or the caretaker assigned to the task.
const express = require('express');
const fs = require('fs');
const { pool } = require('../config/db');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const photoStore = require('../services/photoStore');

const router = express.Router();

router.get('/:id', asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'photo id');
  const user = req.session.user;
  const [rows] = await pool.execute(
    `SELECT p.file_name, p.mime_type
     FROM record_photos p
     JOIN maintenance_records r ON r.id = p.record_id
     JOIN vehicles v ON v.id = r.vehicle_id
     LEFT JOIN maintenance_tasks t ON t.id = r.task_id
     WHERE p.id = ? AND (v.owner_id = ? OR r.performed_by = ? OR t.assigned_to = ?)`,
    [photoId, user.id, user.id, user.id]
  );
  if (!rows.length) throw new HttpError(404, 'Photo not found.');

  const file = photoStore.filePath(rows[0].file_name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Photo file is missing on the server.');
  res.set('Content-Type', rows[0].mime_type);
  res.set('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(file).pipe(res);
}));

module.exports = router;
