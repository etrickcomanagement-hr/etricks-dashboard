(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------------- activity log (admin: everything, leader: own department) ----------------
  E.page({
    id: 'activity-log', title: 'Activity Log', icon: '☰', roles: ['admin', 'leader'], group: 'Administration', order: 40,
    async render(el) {
      await E.listPage(el, {
        title: 'Activity log', subtitle: 'Who did what and when. Entries cannot be edited or deleted.', dept: true,
        filters: [
          { name: 'search', label: 'Search', placeholder: 'Person, action, details' },
          { name: 'from', label: 'From', type: 'date', value: E.addDays(E.today(), -7) }, { name: 'to', label: 'To', type: 'date', value: E.today() },
        ],
        csv: (f) => `/api/logs${E.qs({ ...f, format: 'csv', limit: 5000 })}`,
        load: async (f) => E.table([
          { label: 'Time', render: (l) => html`<span class="nowrap">${fmt.dateTime(l.ts)}</span>` },
          { label: 'Who', render: (l) => html`${l.actorName || 'Unknown'}<div class="muted small">${fmt.label(l.actorRole)}${l.departmentName ? ` · ${l.departmentName}` : ''}</div>` },
          { label: 'Action', render: (l) => html`<span class="badge ${/failed|delete|reject/.test(l.action) ? 'bad' : ''}">${fmt.label(l.action)}</span>` },
          { label: 'Details', class: 'wrap', render: (l) => l.details || '' }, { label: 'IP', render: (l) => html`<span class="muted small">${l.ip || ''}</span>` },
        ], await E.get(`/api/logs${E.qs({ ...f, limit: 300 })}`), 'No activity for these filters.'),
      });
    },
  });

  // ---------------- leader: own portal passwords ----------------
  E.page({
    id: 'my-security', title: 'Member Password', icon: '🔑', roles: ['leader'], group: 'Administration', order: 10,
    async render(el) {
      E.mount(el, html`${E.pageHead('Team member portal password', 'Change the department password your team uses to open the Team Member portal. Each person also has a personal PIN (reset it from their profile).')}
        <div class="card"><button class="btn primary" id="chg">Change member password</button></div>`);
      E.$('#chg', el).onclick = () => E.passwordForm(E.user.departmentId, E.user.label.replace('Team Leader - ', ''), false);
    },
  });

  // ---------------- admin: settings, security, backups, modules ----------------
  E.page({
    id: 'settings', title: 'Settings & Backups', icon: '⚙', roles: ['admin'], group: 'Administration', order: 50,
    async render(el) {
      const [s, backups, mods] = await Promise.all([E.get('/api/settings'), E.get('/api/backups'), E.get('/api/modules')]);
      const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
      E.mount(el, html`${E.pageHead('Settings & backups', 'Company preferences, security, data safety and modules.')}
        <div class="grid cols-2">
          <form class="card" id="settingsForm"><h3>Company settings</h3><div class="form">
            ${E.field({ name: 'companyName', label: 'Company name', value: s.companyName })}${E.field({ name: 'currency', label: 'Currency (3-letter code)', value: s.currency })}
            <div class="full"><div class="muted small" style="margin-bottom:6px">Weekly off days</div><div class="row">${DAYS.map((d, i) => html`<label class="row small"><input type="checkbox" name="off${i}" ${s.weeklyOff.includes(i) ? E.raw('checked') : ''}> ${d.slice(0, 3)}</label>`)}</div></div>
            ${E.field({ name: 'leaveTypes', label: 'Leave types (one per line)', type: 'textarea', value: s.leaveTypes.join('\n') })}
            ${E.field({ name: 'expenseCategories', label: 'Company expense / bill categories (one per line)', type: 'textarea', value: s.expenseCategories.join('\n') })}
            <div class="sect">Performance score weights</div>
            ${E.field({ name: 'wAtt', label: 'Attendance', type: 'number', value: s.scoreWeights.attendance })}${E.field({ name: 'wTask', label: 'Task completion', type: 'number', value: s.scoreWeights.tasks })}
            ${E.field({ name: 'wRate', label: 'Work ratings', type: 'number', value: s.scoreWeights.rating })}</div>
            <div class="foot" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary">Save settings</button></div></form>
          <div class="grid">
            <div class="card"><h3>Admin password</h3><p class="muted">Use a long, unique password. Department passwords are changed from the Departments page.</p><button class="btn" id="adminPw">Change admin password</button></div>
            <div class="card"><h3>Database backups <button class="btn sm primary" id="backupNow">Back up now</button></h3>
              <p class="muted small">A backup is created automatically every day and the newest 30 are kept. Download copies regularly and store them off this computer.</p>
              ${E.table([{ label: 'Backup', render: (b) => html`<span class="small">${b.name}</span>` }, { label: 'Size', render: (b) => size(b.size) }, { label: 'Created', render: (b) => fmt.dateTime(b.createdAt) },
                { label: '', class: 'right', render: (b) => html`<a class="btn sm" href="/api/backups/${b.name}/download">Download</a>` }], backups.slice(0, 8), 'No backups yet.')}</div></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>Modules</h3><p class="muted small">Switch optional features on or off. New modules (payroll, CRM, recruitment…) appear here automatically once added to the system.</p>
          ${E.table([{ label: 'Module', render: (m) => html`<b>${m.name}</b><div class="muted small">${m.description}</div>` },
            { label: 'Status', render: (m) => (m.core ? html`<span class="badge">Core</span>` : E.badge(m.enabled ? 'active' : 'inactive')) },
            { label: '', class: 'right', render: (m) => (m.core ? '' : html`<button class="btn sm" data-act="toggle" data-id="${m.id}">${m.enabled ? 'Disable' : 'Enable'}</button>`) }], mods)}</div>`);

      E.$('#settingsForm', el).onsubmit = async (ev) => {
        ev.preventDefault();
        const v = E.readForm(ev.target);
        try {
          await E.put('/api/settings', {
            companyName: v.companyName, currency: v.currency, leaveTypes: v.leaveTypes, expenseCategories: v.expenseCategories,
            weeklyOff: DAYS.map((_, i) => i).filter((i) => v[`off${i}`]),
            scoreWeights: { attendance: v.wAtt, tasks: v.wTask, rating: v.wRate },
          });
          E.toast('Settings saved');
        } catch (ex) { E.toast(ex.message, 'bad'); }
      };
      E.$('#backupNow', el).onclick = async () => { try { await E.post('/api/backups'); E.toast('Backup created'); E.pages.find((p) => p.id === 'settings').render(el); } catch (ex) { E.toast(ex.message, 'bad'); } };
      E.$('#adminPw', el).onclick = () => E.modal({
        title: 'Change admin password', submit: 'Change password',
        body: html`<div class="form">${E.field({ name: 'currentPassword', label: 'Current password', type: 'password', required: true, full: true })}${E.field({ name: 'newPassword', label: 'New password (min 8 characters)', type: 'password', required: true, full: true })}</div>`,
        onSubmit: async (v, { close }) => { await E.put('/api/auth/admin-password', v); E.toast('Admin password changed'); close(); },
      });
      E.actions(el, {
        toggle: async (id) => {
          const m = mods.find((x) => x.id === id);
          await E.put(`/api/modules/${id}`, { enabled: !m.enabled });
          E.toast(`${m.name} ${m.enabled ? 'disabled' : 'enabled'}. Reloading…`);
          setTimeout(() => location.reload(), 600);
        },
      });
    },
  });
})();
