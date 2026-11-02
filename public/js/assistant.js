// AI Assistant chat page.
(function () {
  'use strict';

  const { esc, formatAiText, sourceBadge } = App;
  const log = document.getElementById('log');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('message');
  const vehicleSelect = document.getElementById('vehicleSelect');
  let user;
  let busy = false;

  const SUGGESTIONS = {
    owner: [
      'Which of my vehicles needs attention first, and why?',
      'My car has been parked for 2 months. What should I check before driving it?',
      'How do I stop rats damaging the wiring of a parked car?',
      'Make a monthly care routine for my motorcycle.',
      'Roughly how much should battery charging cost?'
    ],
    caretaker: [
      'Plan my tasks for this week in a sensible order.',
      'What should I check when inspecting a car parked for 3 months?',
      'How do I tell if a battery needs replacing or just charging?',
      'What photos should I take during an inspection?'
    ]
  };

  function bubble(role, content, source) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (role === 'assistant') {
      div.innerHTML = formatAiText(content) + `<div class="meta">${sourceBadge(source)}</div>`;
    } else {
      div.textContent = content;
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function showWelcome() {
    log.innerHTML =
      '<div class="msg assistant"><p><strong>Hi! I\'m your VehicleCare assistant.</strong></p>' +
      `<p>${user.role === 'owner'
        ? 'I can see your vehicles, how long each has been parked, their health scores, open tasks and service history. Ask me what to do next, or try one of these:'
        : 'I can see the tasks assigned to you. Ask me how to plan or do the work, or try one of these:'}</p>` +
      '<div class="chips" id="chips">' +
      SUGGESTIONS[user.role].map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join('') +
      '</div></div>';
  }

  function setStatus(ai) {
    document.getElementById('aiStatus').innerHTML = ai && ai.configured
      ? sourceBadge('gemini')
      : `${sourceBadge('rules')} <span class="small muted">Add a Gemini key for full AI</span>`;
  }

  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true;
    const chips = document.getElementById('chips');
    if (chips) chips.remove();
    bubble('user', text);
    input.value = '';
    const typing = document.createElement('div');
    typing.className = 'msg assistant typing';
    typing.textContent = 'Thinking…';
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const data = await api.post('/api/ai/chat', { message: text, vehicle_id: vehicleSelect.value || null });
      typing.remove();
      bubble('assistant', data.reply.content, data.reply.source);
      setStatus(data.ai);
    } catch (error) {
      typing.remove();
      const div = bubble('assistant', `Sorry, I could not answer: ${error.message}`, 'rules');
      div.querySelector('.meta').remove();
    } finally {
      busy = false;
      button.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(input.value);
    }
  });
  log.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (chip) send(chip.textContent);
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    const ok = await App.confirm('Delete your chat history with the assistant?', { title: 'Clear chat', confirmText: 'Clear', danger: true });
    if (!ok) return;
    try {
      await api.del('/api/ai/messages');
      showWelcome();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  });

  (async function start() {
    user = await App.init({ page: 'assistant', title: 'AI Assistant', roles: ['owner', 'caretaker'] });
    if (user.role === 'owner') {
      try {
        const { vehicles } = await api.get('/api/vehicles');
        vehicleSelect.innerHTML = '<option value="">All my vehicles</option>' + vehicles.map((v) =>
          `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${esc(v.registration_number)}</option>`).join('');
        const preset = new URLSearchParams(location.search).get('vehicle_id');
        if (preset) vehicleSelect.value = preset;
      } catch (error) {
        App.toast(error.message, 'error');
      }
    } else {
      document.getElementById('contextBar').classList.add('hidden');
      document.getElementById('intro').textContent = 'Ask about the work assigned to you, inspection tips or how to fix common problems.';
    }

    try {
      const data = await api.get('/api/ai/messages');
      setStatus(data.ai);
      if (data.messages.length) {
        log.innerHTML = '';
        data.messages.forEach((m) => bubble(m.role, m.content, m.source));
      } else {
        showWelcome();
      }
    } catch (error) {
      showWelcome();
      App.toast(error.message, 'error');
    }
    const ask = new URLSearchParams(location.search).get('ask');
    if (ask) send(ask);
    else input.focus();
  })();
})();
