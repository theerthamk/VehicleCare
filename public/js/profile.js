// Profile page. Caretakers also edit their provider details, service area and see their ratings.
(function () {
  'use strict';

  const form = document.getElementById('profileForm');

  async function showRating(user) {
    const card = document.getElementById('ratingCard');
    try {
      const data = await api.get(`/api/reviews?caretaker_id=${user.id}`);
      const c = data.caretaker;
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
        `<div><h2>Your rating</h2><div style="margin-top:4px">${App.stars(c.avg_rating, c.review_count)}</div>` +
        `<div class="small muted">${c.review_count >= 3 && c.avg_rating >= 4.5
          ? 'You have the <strong>Top rated</strong> badge.'
          : 'Get 3 or more reviews averaging 4.5★ to earn the Top rated badge.'}</div></div>` +
        `<button type="button" class="btn btn-secondary btn-sm" id="myReviews"${c.review_count ? '' : ' disabled'}>Read reviews</button></div>`;
      document.getElementById('myReviews').addEventListener('click', () => Reviews.open(user.id));
    } catch (error) {
      card.innerHTML = App.emptyState('alert', error.message);
    }
  }

  (async function start() {
    const user = await App.init({
      page: 'profile',
      title: (u) => (u.role === 'owner' ? 'Profile' : 'Provider Profile'),
      roles: ['owner', 'caretaker']
    });
    const isCaretaker = user.role === 'caretaker';
    let picker = null;

    if (isCaretaker) {
      document.querySelectorAll('.caretaker-only').forEach((el) => el.classList.remove('hidden'));
      document.getElementById('pageHeading').textContent = 'Provider Profile';
      document.getElementById('pageIntro').textContent = 'Owners see these details when they look for caretakers, and job posts inside your service area reach you.';
      if (new URLSearchParams(location.search).get('welcome') === '1') {
        document.getElementById('welcome').classList.remove('hidden');
      }
      showRating(user);
    } else {
      // Hidden fields are not sent for owners.
      document.querySelectorAll('.caretaker-only input, .caretaker-only textarea, .caretaker-only select').forEach((el) => { el.disabled = true; });
    }

    App.fillForm(form, user);
    form.elements.email_display.value = user.email;

    if (isCaretaker && window.VCMap) {
      const radius = form.elements.service_radius_km;
      if (!Array.from(radius.options).some((o) => o.value === String(user.service_radius_km))) {
        radius.insertAdjacentHTML('beforeend', `<option value="${user.service_radius_km}">${user.service_radius_km} km</option>`);
      }
      radius.value = String(user.service_radius_km);
      picker = VCMap.picker(document.getElementById('areaMap'), {
        lat: user.latitude,
        lng: user.longitude,
        radiusKm: Number(radius.value)
      });
      radius.addEventListener('change', () => picker.setRadius(Number(radius.value)));
    }

    App.bindForm(form, async (values) => {
      const payload = { full_name: values.full_name, phone: values.phone, city: values.city };
      if (isCaretaker) {
        payload.specialization = values.specialization;
        payload.bio = values.bio;
        payload.service_radius_km = values.service_radius_km;
        if (picker) {
          const point = picker.value;
          payload.latitude = point ? point.lat : null;
          payload.longitude = point ? point.lng : null;
        }
      }
      const { user: updated } = await api.put('/api/auth/profile', payload);
      App.fillForm(form, updated);
      document.querySelector('.sidebar-foot .who').textContent = updated.full_name;
      App.toast(isCaretaker && updated.latitude === null
        ? 'Profile saved. Set your location on the map so owners and jobs nearby can find you.'
        : 'Profile saved.', 'success');
    });
  })();
})();
