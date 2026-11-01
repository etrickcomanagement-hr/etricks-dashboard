/* eTricks front-end toolkit. Feature modules (public/modules/*.js) build on this and register pages. */
(() => {
  'use strict';
  const E = (window.Etricks = { user: null, settings: {}, pages: [], currentModule: null, enabled: new Set() });

  // ---------- safe templating: every ${value} is escaped unless it came from html`` / E.raw ----------
  class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const render = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(render).join('') : v === false || v == null ? '' : esc(v));
  const html = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));
  E.html = html; E.esc = esc; E.raw = (s) => new Safe(s);
  E.mount = (el, safe) => { el.innerHTML = safe instanceof Safe ? safe.s : esc(safe); return el; };
  E.$ = (sel, root = document) => root.querySelector(sel);
  E.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- API ----------
  E.api = async (method, url, body) => {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', 'X-Etricks': '1' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 && E.user && !url.startsWith('/api/auth/')) { E.user = null; E.toast('Your session has ended. Please sign in again.', 'bad'); E.boot(); }
      throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    }
    return data;
  };
  E.get = (url) => E.api('GET', url);
  E.post = (url, body = {}) => E.api('POST', url, body);
  E.put = (url, body = {}) => E.api('PUT', url, body);
  E.del = (url) => E.api('DELETE', url);
  E.qs = (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  E.download = (url) => { location.href = url; };

  // ---------- formatting ----------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  E.today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  E.addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  E.monthStart = () => E.today().slice(0, 8) + '01';
  E.fmt = {
    date: (s) => { if (!s) return '-'; const [y, m, d] = s.slice(0, 10).split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; },
    time: (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'),
    dateTime: (iso) => (iso ? `${E.fmt.date(new Date(iso).toLocaleDateString('en-CA'))} ${E.fmt.time(iso)}` : '-'),
    dur: (min) => (min == null ? '-' : `${Math.floor(min / 60)}h ${pad(Math.round(min % 60))}m`),
    num: (n) => (n == null ? '-' : Number(n).toLocaleString()),
    money: (n) => {
      if (n == null) return '-';
      try { return new Intl.NumberFormat([], { style: 'currency', currency: E.settings.currency || 'USD', maximumFractionDigits: 2 }).format(n); } catch { return Number(n).toFixed(2); }
    },
    pct: (n) => (n == null ? '-' : `${n}%`),
    label: (s) => (s ? String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '-'),
  };

  // ---------- small components ----------
  const BADGE = {
    present: 'ok', approved: 'ok', done: 'ok', active: 'ok', late: 'warn', pending: 'warn', half_day: 'warn', in_progress: 'info', todo: '',
    absent: 'bad', rejected: 'bad', blocked: 'bad', inactive: 'bad', terminated: 'bad', resigned: 'bad', cancelled: '', leave: 'info', urgent: 'bad', high: 'warn',
    medium: 'info', low: '', pending_approval: 'warn', changes_requested: 'info', in_review: 'info', resolved: 'ok', closed: '', open: 'warn',
  };
  E.badge = (value, kind) => html`<span class="badge ${kind ?? BADGE[value] ?? ''}">${E.fmt.label(value)}</span>`;
  E.meter = (pct, goodAt = 80, warnAt = 60) => {
    if (pct == null) return html`<span class="muted">-</span>`;
    const cls = pct >= goodAt ? '' : pct >= warnAt ? 'warn' : 'bad';
    return html`<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="meter ${cls}" style="flex:1"><i style="width:${Math.min(100, pct)}%"></i></div><span class="small nowrap">${pct}%</span></div>`;
  };
  E.stat = (label, value, { sub = '', cls = '' } = {}) => html`<div class="stat"><div class="k">${label}</div><div class="v ${cls}">${value}</div>${sub ? html`<div class="s">${sub}</div>` : ''}</div>`;
  E.pageHead = (title, subtitle, actions = '') => html`<div class="page-head"><div><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : ''}</div><div class="row">${actions}</div></div>`;

  // columns: [{ label, render?(row), key?, class? }]
  E.table = (columns, rows, empty = 'Nothing to show yet.') => {
    if (!rows.length) return html`<div class="tablewrap"><div class="empty">${empty}</div></div>`;
    return html`<div class="tablewrap"><table><thead><tr>${columns.map((c) => html`<th class="${c.class || ''}">${c.label}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr>${columns.map((c) => html`<td class="${c.class || ''}">${c.render ? c.render(r) : r[c.key] ?? '-'}</td>`)}</tr>`)}</tbody></table></div>`;
  };

  // Form field. type: text|number|date|time|password|email|textarea|select|checkbox
  E.field = ({ name, label, type = 'text', value = '', options = [], required = false, full = false, help = '', placeholder = '', attrs = '' }) => {
    const cls = full || type === 'textarea' ? 'full' : '';
    const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
    const a = E.raw(`${required ? ' required' : ''}${attrs ? ' ' + attrs : ''}`);
    if (type === 'checkbox') return html`<label class="check ${cls}"><input type="checkbox" name="${name}" ${value ? E.raw('checked') : ''}> ${label}</label>`;
    let control;
    if (type === 'textarea') control = html`<textarea name="${name}" placeholder="${placeholder}" ${a}>${value ?? ''}</textarea>`;
    else if (type === 'select') {
      control = html`<select name="${name}" ${a}>${opts.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value ?? '') ? E.raw('selected') : ''}>${o.label}</option>`)}</select>`;
    } else control = html`<input type="${type}" name="${name}" value="${value ?? ''}" placeholder="${placeholder}" ${a}>`;
    return html`<label class="${cls}">${label}${required ? ' *' : ''}${control}${help ? html`<span class="help">${help}</span>` : ''}</label>`;
  };

  E.readForm = (form) => {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      const val = el.type === 'checkbox' ? el.checked : el.value;
      const [a, b] = el.name.split('.');
      if (b) (out[a] ||= {})[b] = val; else out[a] = val;
    }
    return out;
  };

  // Admin-defined extra fields for an entity (employee | task | finance)
  E.customInputs = async (entity, values = {}) => {
    const defs = await E.get(`/api/custom-fields?entity=${entity}`);
    if (!defs.length) return { defs, html: '' };
    return {
      defs,
      html: html`<div class="sect">Additional details</div>${defs.map((d) => E.field({
        name: `custom.${d.key}`, label: d.label, type: d.type === 'select' ? 'select' : d.type, value: values[d.key] ?? '', required: d.required,
        options: d.type === 'select' ? ['', ...d.options] : [], full: d.type === 'textarea',
      }))}`,
    };
  };

  // Grey placeholder shown while a page loads (feels faster than a blank screen).
  E.skeleton = () => html`<div class="skel"><i></i><i></i><i></i><i></i></div>`;

  E.toast = (msg, kind = '') => {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    E.$('#toasts').append(t);
    setTimeout(() => t.remove(), 4200);
  };

  // Modal with a form. onSubmit(values, form) may throw; the message is shown inside the modal.
  E.modal = ({ title, body, submit = 'Save', onSubmit, wide = false, cancel = 'Cancel', onOpen }) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate><h3></h3><div class="mbody"></div><div class="error" hidden></div><div class="foot"></div></form>`;
    const form = E.$('form', overlay);
    E.$('h3', overlay).textContent = title;
    E.mount(E.$('.mbody', overlay), body);
    const foot = E.$('.foot', overlay);
    const close = () => overlay.remove();
    if (cancel) { const c = document.createElement('button'); c.type = 'button'; c.className = 'btn'; c.textContent = cancel; c.onclick = close; foot.append(c); }
    let ok;
    if (onSubmit) { ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = submit; foot.append(ok); }
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      const err = E.$('.error', overlay);
      err.hidden = true;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      ok.disabled = true;
      try { await onSubmit(E.readForm(form), { close, form }); } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { ok.disabled = false; }
    });
    document.body.append(overlay);
    const first = E.$('input:not([type=hidden]),select,textarea', form);
    if (first) first.focus();
    if (onOpen) onOpen(form, close);
    return { close, form };
  };

  E.confirm = (message, { yes = 'Confirm', danger = false } = {}) => new Promise((resolve) => {
    const { close, form } = E.modal({ title: 'Please confirm', body: html`<p>${message}</p>`, submit: yes, onSubmit: async (_, { close: c }) => { c(); resolve(true); } });
    const ok = E.$('.btn.primary', form);
    if (danger) ok.classList.add('danger');
    E.$('.btn:not(.primary)', form).addEventListener('click', () => resolve(false));
    form.closest('.overlay').addEventListener('mousedown', (e) => { if (e.target.classList.contains('overlay')) resolve(false); });
    void close;
  });

  // Delegated clicks: E.actions(el, { edit: (id, btn) => ... }) for <button data-act="edit" data-id="5">
  // Safe to call repeatedly on the same element: one listener, latest handlers win.
  E.actions = (el, handlers) => {
    el._acts = { ...el._acts, ...handlers };
    if (el._actsBound) return;
    el._actsBound = true;
    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !el.contains(btn) || !el._acts[btn.dataset.act]) return;
      if (btn.tagName === 'A') e.preventDefault();
      if (btn._busy) return;
      btn._busy = true; btn.classList.add('working');
      try { await el._acts[btn.dataset.act](btn.dataset.id, btn); } catch (ex) { E.toast(ex.message, 'bad'); } finally { btn._busy = false; btn.classList.remove('working'); }
    });
  };

  // Shows a one-time secret (e.g. a new PIN) so it can be handed to the employee.
  E.showPin = (name, pin) => E.modal({
    title: 'Personal PIN', cancel: 'Close',
    body: html`<p><b>${name}</b> signs in to the member portal with the team password and this PIN.</p>
      <div class="pin-box"><b>${pin}</b></div><p class="muted small">This PIN is shown only once. If it is lost, reset it from the employee's profile.</p>`,
  });

  // ---------- cached lookups ----------
  const cache = {};
  E.cached = (key, loader, ttl = 20000) => {
    const hit = cache[key];
    if (hit && Date.now() - hit.t < ttl) return hit.p;
    const p = loader();
    cache[key] = { t: Date.now(), p };
    p.catch(() => delete cache[key]);
    return p;
  };
  E.bust = (prefix = '') => Object.keys(cache).forEach((k) => k.startsWith(prefix) && delete cache[k]);
  E.departments = () => E.cached('departments', () => E.get('/api/departments'));
  E.teams = (deptId = '') => E.cached(`teams${deptId}`, () => E.get(`/api/teams${E.qs({ departmentId: deptId })}`));
  E.shifts = () => E.cached('shifts', () => E.get('/api/shifts'));
  E.employees = (deptId = '', status = 'active') => E.cached(`emps${deptId}${status}`, () => E.get(`/api/employees${E.qs({ departmentId: deptId, status })}`), 8000);

  const idOpts = (rows, blank) => [...(blank ? [{ value: '', label: blank }] : []), ...rows.map((r) => ({ value: r.id, label: r.name }))];
  E.idOptions = idOpts;
  E.isAdmin = () => E.user?.role === 'admin';
  E.isHead = () => E.user?.role === 'hod';
  E.isLeader = () => E.user?.role === 'leader';
  // Who can see more than one team: the admin and the head of department.
  E.seesAllTeams = () => E.user?.role === 'admin' || E.user?.role === 'hod';
  // Personal pages (my attendance, my leave ...) are open to members, team leaders and heads. Members see them ungrouped.
  E.SELF = ['hod', 'leader', 'member'];
  E.MANAGE = ['admin', 'hod', 'leader'];
  E.myGroup = (role) => (role === 'member' ? '' : 'My work');
  E.roleLabel = { admin: 'Admin', hod: 'Head of department', team_leader: 'Team leader', member: 'Team member' };

  // Standard "filters + results + export" page. load(filters) returns html; bind(resultsEl, refresh, filters) wires row actions.
  E.listPage = async (el, { title, subtitle = '', actions = '', filters = [], dept = false, csv, load, bind }) => {
    const defs = [...filters];
    if (dept && E.isAdmin()) {
      defs.unshift({ name: 'departmentId', label: 'Department', type: 'select', options: [{ value: '', label: 'All departments' }, ...idOpts(await E.departments())] });
    }
    E.mount(el, html`${E.pageHead(title, subtitle, html`${csv ? html`<button class="btn" type="button" data-x="export">⬇ Export CSV</button>` : ''}${actions}`)}
      <form class="filters">${defs.map((f) => E.field({ ...f, full: false }))}</form><div id="results">${E.skeleton()}</div>`);
    const form = E.$('.filters', el);
    const results = E.$('#results', el);
    const values = () => E.readForm(form);
    let seq = 0;
    const refresh = async () => {
      const mine = ++seq;
      results.classList.add('busy');
      try {
        const out = await load(values());
        if (mine !== seq) return;
        E.mount(results, out);
        if (bind) bind(results, refresh, values());
      } catch (ex) { if (mine === seq) E.mount(results, html`<div class="error">${ex.message}</div>`); } finally { if (mine === seq) results.classList.remove('busy'); }
    };
    let timer;
    form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 250); });
    form.addEventListener('submit', (e) => e.preventDefault());
    E.$('[data-x=export]', el)?.addEventListener('click', () => E.download(csv(values())));
    await refresh();
    return { refresh, values, results, form };
  };

  // ---------- page registry ----------
  // E.page({ id, title, icon, roles: ['admin','leader','member'], group, order, subtitle?, render(el) })
  E.page = (def) => E.pages.push({ order: 100, group: '', icon: '•', ...def, module: document.currentScript?.dataset.module || E.currentModule });

  // Logo: uses /img/logo.png when present, otherwise the built-in shield mark.
  E.logo = (big = false) => html`<span class="logo ${big ? 'big' : ''}"><img class="logo-img" src="/img/logo.png" alt="eTricks">
    <svg class="logo-svg" viewBox="0 0 150 130" role="img" aria-label="eTricks"><path d="M22 28V14l53-10 53 10v14M22 30v44c0 20 22 36 53 50 31-14 53-30 53-50V30" fill="none" stroke="#a8ff5a" stroke-width="5" stroke-linejoin="round"/>
    <text x="75" y="76" text-anchor="middle" font-family="'Brush Script MT','Segoe Script','Lucida Handwriting',cursive" font-style="italic" font-weight="700" font-size="40" fill="#a8ff5a">eTricks</text>
    <path d="M42 90q33-12 66-4" fill="none" stroke="#a8ff5a" stroke-width="5" stroke-linecap="round"/></svg></span>`;
  const probe = new Image();
  probe.onload = () => document.documentElement.classList.add('has-logo');
  probe.src = '/img/logo.png';
})();
