// Thin wrapper around fetch() for the VehicleCare REST API.
// Every call returns parsed JSON or throws an ApiError with a readable message.
(function () {
  'use strict';

  class ApiError extends Error {
    constructor(status, message, details) {
      super(message);
      this.status = status;
      this.details = details || null;
    }
  }

  const api = {
    ApiError,
    // Called when the server says the session has expired (set by app.js).
    onUnauthorized: null
  };

  async function request(method, url, body) {
    const options = {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    };
    if (method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body || {});
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      throw new ApiError(0, navigator.onLine
        ? 'Cannot reach the server. Make sure it is running and try again.'
        : 'You are offline. Reconnect to the internet and try again.');
    }

    let data = null;
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      data = await response.json().catch(() => null);
    }

    if (!response.ok) {
      const message = (data && data.error) || `Request failed (${response.status}).`;
      const error = new ApiError(response.status, message, data && data.details);
      if (response.status === 401 && typeof api.onUnauthorized === 'function') {
        api.onUnauthorized(error);
      }
      throw error;
    }
    return data;
  }

  // Builds "/path?key=value" skipping empty values.
  api.url = function (path, params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    });
    const qs = query.toString();
    return qs ? `${path}?${qs}` : path;
  };

  api.get = (url) => request('GET', url);
  api.post = (url, body) => request('POST', url, body);
  api.put = (url, body) => request('PUT', url, body);
  api.patch = (url, body) => request('PATCH', url, body);
  api.del = (url) => request('DELETE', url);

  window.api = api;
})();
