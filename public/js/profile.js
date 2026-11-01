// Profile page. Caretakers also edit their provider details.
(function () {
  'use strict';

  const form = document.getElementById('profileForm');

  (async function start() {
    const user = await App.init({
      page: 'profile',
      title: (u) => (u.role === 'owner' ? 'Profile' : 'Provider Profile'),
      roles: ['owner', 'caretaker']
    });
    const isCaretaker = user.role === 'caretaker';

    if (isCaretaker) {
      document.querySelectorAll('.caretaker-only').forEach((el) => el.classList.remove('hidden'));
      document.getElementById('pageHeading').textContent = 'Provider Profile';
      document.getElementById('pageIntro').textContent = 'Owners see these details in the service provider directory.';
      if (new URLSearchParams(location.search).get('welcome') === '1') {
        document.getElementById('welcome').classList.remove('hidden');
      }
    } else {
      // Hidden fields are not sent for owners.
      document.querySelectorAll('.caretaker-only input, .caretaker-only textarea').forEach((el) => { el.disabled = true; });
    }

    App.fillForm(form, user);
    form.elements.email_display.value = user.email;

    App.bindForm(form, async (values) => {
      const payload = { full_name: values.full_name, phone: values.phone, city: values.city };
      if (isCaretaker) {
        payload.specialization = values.specialization;
        payload.bio = values.bio;
      }
      const { user: updated } = await api.put('/api/auth/profile', payload);
      App.fillForm(form, updated);
      document.querySelector('.sidebar-foot .who').textContent = updated.full_name;
      App.toast('Profile saved.', 'success');
    });
  })();
})();
