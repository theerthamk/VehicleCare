// Shared "reviews for a caretaker" dialog. Usage: Reviews.open(caretakerId)
(function () {
  'use strict';

  let dialog;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'reviewsTitle');
    dialog.innerHTML =
      '<div class="dialog-head"><h2 id="reviewsTitle">Reviews</h2>' +
      `<button type="button" class="icon-btn" data-close aria-label="Close">${App.icon('x')}</button></div>` +
      '<div class="dialog-body" id="reviewsBody"></div>' +
      '<div class="dialog-foot"><button type="button" class="btn btn-ghost" data-close>Close</button></div>';
    document.body.appendChild(dialog);
    return dialog;
  }

  async function open(caretakerId) {
    const d = ensureDialog();
    const body = d.querySelector('#reviewsBody');
    body.innerHTML = '<div class="loading">Loading…</div>';
    App.openDialog(d);
    try {
      const data = await api.get(`/api/reviews?caretaker_id=${encodeURIComponent(caretakerId)}`);
      const c = data.caretaker;
      d.querySelector('#reviewsTitle').textContent = `Reviews for ${c.full_name}`;
      const total = c.review_count || 0;
      const bars = [5, 4, 3, 2, 1].map((n) => {
        const count = data.stars[n] || 0;
        return `<div class="bar-row"><span class="muted">${n} ★</span><div class="bar-track"><div class="bar-fill" style="width:${total ? (count / total) * 100 : 0}%;background:#f2a900"></div></div><span class="num">${count}</span></div>`;
      }).join('');
      body.innerHTML =
        `<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:14px">` +
        `<div><div style="font-size:2.2rem;font-weight:700;line-height:1">${c.avg_rating === null ? '–' : App.esc(c.avg_rating.toFixed(1))}</div>` +
        `<div>${App.stars(c.avg_rating)}</div><div class="small muted">${total} review${total === 1 ? '' : 's'}</div></div>` +
        `<div class="bars" style="flex:1;min-width:200px">${bars}</div></div>` +
        (data.reviews.length
          ? data.reviews.map((r) =>
            '<div class="record">' +
            `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">${App.stars(r.rating)}` +
            `<span class="small muted">${App.esc(r.owner_first_name)} · ${App.esc(App.fmtDate(r.created_at))}</span></div>` +
            `<div class="small muted" style="margin-top:4px">${App.esc(r.task_title)}</div>` +
            (r.comment ? `<p class="small" style="margin:6px 0 0">${App.esc(r.comment)}</p>` : '') +
            '</div>').join('')
          : '<p class="muted">No reviews yet.</p>');
    } catch (error) {
      body.innerHTML = App.emptyState('alert', error.message);
    }
  }

  window.Reviews = { open };
})();
