// Login and registration page.
(function () {
  'use strict';

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');

  document.getElementById('brandMark').innerHTML = App.icon('logo');
  document.querySelectorAll('.feature-list li[data-icon]').forEach((li) => {
    li.insertAdjacentHTML('afterbegin', App.icon(li.dataset.icon));
  });

  // Only allow redirects to pages inside this app.
  function nextUrl(user) {
    const next = new URLSearchParams(location.search).get('next');
    if (next && next.startsWith('/pages/') && !next.startsWith('//')) return next;
    return App.HOME[user.role];
  }

  function showTab(which) {
    const isLogin = which === 'login';
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabRegister.setAttribute('aria-selected', String(!isLogin));
    document.getElementById('authTitle').textContent = isLogin ? 'Welcome back' : 'Create your account';
    document.getElementById('authSubtitle').textContent = isLogin
      ? 'Sign in to manage your vehicles or assigned work.'
      : 'Choose your role, then fill in your details.';
    App.clearErrors(isLogin ? loginForm : registerForm);
    const first = (isLogin ? loginForm : registerForm).querySelector('input:not([type=radio])');
    if (first) first.focus();
  }

  tabLogin.addEventListener('click', () => showTab('login'));
  tabRegister.addEventListener('click', () => showTab('register'));
  if (location.hash === '#register') showTab('register');

  App.bindForm(loginForm, async (values) => {
    const { user } = await api.post('/api/auth/login', { email: values.email, password: values.password });
    window.location.href = nextUrl(user);
  });

  App.bindForm(registerForm, async (values) => {
    if (values.password !== values.confirm_password) {
      throw new api.ApiError(400, 'Passwords do not match.', { confirm_password: 'Passwords do not match.' });
    }
    if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) {
      throw new api.ApiError(400, 'Password needs a letter and a number.', { password: 'Include at least one letter and one number.' });
    }
    const { user } = await api.post('/api/auth/register', {
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      role: values.role
    });
    // Caretakers start on their profile so owners can find them.
    window.location.href = user.role === 'caretaker' ? '/pages/profile.html?welcome=1' : App.HOME.owner;
  });

  // Already signed in? Go straight to the dashboard.
  api.get('/api/auth/me')
    .then(({ user }) => window.location.replace(nextUrl(user)))
    .catch(() => { /* not signed in: stay here */ });
})();
