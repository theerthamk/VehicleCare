// Small helpers for consistent JSON errors and async route handlers.

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wraps an async route so any thrown error reaches the error handler.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Parses a positive integer id from a URL parameter, or throws 400.
function parseId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `Invalid ${label}.`);
  }
  return id;
}

module.exports = { HttpError, asyncHandler, parseId };
