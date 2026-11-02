// Small wrapper around Leaflet + OpenStreetMap.
//   VCMap.picker(container, { lat, lng, radiusKm, onChange })  -> pick a point by clicking,
//       "Use my location" or searching a place name.
//   VCMap.view(container, { center, markers, circles })        -> read-only map.
// If Leaflet or the map tiles cannot load (offline), the picker still works:
// clicks keep working on a grey map, and the coordinates can be typed in.
(function () {
  'use strict';

  const DEFAULT_CENTER = [8.5241, 76.9366]; // Thiruvananthapuram
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  function leafletReady() {
    return typeof window.L !== 'undefined';
  }

  function baseMap(el, center, zoom) {
    const map = L.map(el, { scrollWheelZoom: false }).setView(center, zoom);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    // Maps inside dialogs need a size refresh once visible.
    setTimeout(() => map.invalidateSize(), 60);
    return map;
  }

  const round6 = (n) => Math.round(n * 1e6) / 1e6;

  function picker(container, options) {
    const opts = Object.assign({ lat: null, lng: null, radiusKm: null, onChange: () => {} }, options);
    container.innerHTML =
      '<div class="map-tools">' +
      '<input type="search" class="map-search" placeholder="Search a place, e.g. Kowdiar, Thiruvananthapuram" aria-label="Search a place">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-map="search">Search</button>' +
      `<button type="button" class="btn btn-ghost btn-sm" data-map="locate">${App.icon('locate')}My location</button>` +
      '<button type="button" class="btn btn-ghost btn-sm" data-map="clear">Clear</button>' +
      '</div><div class="map-box"></div>' +
      '<div class="map-status small muted"></div>';
    const box = container.querySelector('.map-box');
    const statusEl = container.querySelector('.map-status');
    let current = opts.lat !== null && opts.lat !== '' && opts.lng !== null && opts.lng !== ''
      ? { lat: Number(opts.lat), lng: Number(opts.lng) } : null;
    let radiusKm = opts.radiusKm;
    let map = null;
    let marker = null;
    let circle = null;

    function describe() {
      statusEl.textContent = current
        ? `Selected: ${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}`
        : 'Click the map to set the location.';
    }

    function draw() {
      if (!map) return;
      if (marker) { marker.remove(); marker = null; }
      if (circle) { circle.remove(); circle = null; }
      if (!current) return;
      marker = L.circleMarker([current.lat, current.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1f5bd8', fillOpacity: 1 }).addTo(map);
      if (radiusKm) {
        circle = L.circle([current.lat, current.lng], { radius: radiusKm * 1000, color: '#1f5bd8', weight: 1.5, fillOpacity: 0.08 }).addTo(map);
      }
    }

    function set(point, { pan = true, notify = true } = {}) {
      current = point ? { lat: round6(point.lat), lng: round6(point.lng) } : null;
      draw();
      if (map && current && pan) {
        if (circle) map.fitBounds(circle.getBounds(), { padding: [10, 10] });
        else map.setView([current.lat, current.lng], Math.max(map.getZoom(), 14));
      }
      describe();
      if (notify) opts.onChange(current);
    }

    if (leafletReady()) {
      map = baseMap(box, current ? [current.lat, current.lng] : DEFAULT_CENTER, current ? 14 : 12);
      map.on('click', (e) => set(e.latlng, { pan: false }));
      draw();
      if (current && circle) map.fitBounds(circle.getBounds(), { padding: [10, 10] });
    } else {
      box.innerHTML = '<div class="empty">The map could not load. Use "My location" or search instead.</div>';
    }
    describe();

    container.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-map]');
      if (!btn) return;
      const action = btn.dataset.map;
      if (action === 'clear') set(null);
      if (action === 'locate') {
        if (!navigator.geolocation) { statusEl.textContent = 'This browser cannot share your location.'; return; }
        statusEl.textContent = 'Finding your location…';
        navigator.geolocation.getCurrentPosition(
          (pos) => set({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => { statusEl.textContent = 'Location permission was denied or unavailable.'; },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
      if (action === 'search') search();
    });
    container.querySelector('.map-search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); search(); }
    });

    async function search() {
      const q = container.querySelector('.map-search').value.trim();
      if (q.length < 3) { statusEl.textContent = 'Type at least 3 letters to search.'; return; }
      statusEl.textContent = 'Searching…';
      try {
        // OpenStreetMap Nominatim (free; please keep searches to button presses).
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, {
          headers: { Accept: 'application/json' }
        });
        const results = await res.json();
        if (!results.length) { statusEl.textContent = 'No place found. Try a nearby landmark or click the map.'; return; }
        set({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
      } catch (err) {
        statusEl.textContent = 'Search is unavailable (offline?). Click the map instead.';
      }
    }

    return {
      get value() { return current; },
      set(point) { set(point, { notify: false }); },
      setRadius(km) { radiusKm = km; draw(); if (circle && map) map.fitBounds(circle.getBounds(), { padding: [10, 10] }); },
      refresh() { if (map) map.invalidateSize(); }
    };
  }

  // markers: [{ lat, lng, color, label, popup (HTML, already escaped) }]
  // circles: [{ lat, lng, radiusKm, color }]
  function view(container, { center, markers = [], circles = [], zoom = 12 } = {}) {
    if (!leafletReady()) {
      container.innerHTML = '<div class="empty">Map unavailable offline.</div>';
      return null;
    }
    container.innerHTML = '';
    const map = baseMap(container, center ? [center.lat, center.lng] : DEFAULT_CENTER, zoom);
    const bounds = [];
    circles.forEach((c) => {
      const layer = L.circle([c.lat, c.lng], { radius: c.radiusKm * 1000, color: c.color || '#1f5bd8', weight: 1, fillOpacity: 0.05 }).addTo(map);
      bounds.push(layer.getBounds());
    });
    markers.forEach((m) => {
      const layer = L.circleMarker([m.lat, m.lng], {
        radius: m.size || 8, color: '#fff', weight: 2.5, fillColor: m.color || '#1f5bd8', fillOpacity: 1
      }).addTo(map);
      if (m.popup) layer.bindPopup(m.popup);
      if (m.label) layer.bindTooltip(m.label);
      bounds.push(L.latLngBounds([[m.lat, m.lng], [m.lat, m.lng]]));
    });
    if (bounds.length > 1) {
      const all = bounds.reduce((acc, b) => acc.extend(b), L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast()));
      map.fitBounds(all, { padding: [24, 24], maxZoom: 14 });
    }
    return map;
  }

  window.VCMap = { picker, view, DEFAULT_CENTER };
})();
