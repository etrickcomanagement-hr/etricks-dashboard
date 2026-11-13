(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------------- activity log (admin: everything, head of department: own department) ----------------
  E.page({
    id: 'activity-log', title: 'Activity Log', icon: '☰', roles: ['admin', 'hod'], group: 'Administration', order: 40,
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

  // ---------------- admin: settings, security, backups, modules ----------------
  E.page({
    id: 'settings', title: 'Settings & Backups', icon: '⚙', roles: ['admin'], group: 'Administration', order: 50,
    async render(el) {
      const [s, backups, mods, gate, full, health] = await Promise.all([E.get('/api/settings'), E.get('/api/backups'), E.get('/api/modules'), E.get('/api/gate/status'), E.get('/api/backups/full'), E.get('/api/metrics').catch(() => null)]);
      const upFor = (n) => (n >= 86400 ? `${Math.floor(n / 86400)} d ${Math.floor((n % 86400) / 3600)} h` : n >= 3600 ? `${Math.floor(n / 3600)} h ${Math.floor((n % 3600) / 60)} min` : `${Math.floor(n / 60)} min`);
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
            ${E.field({ name: 'wRate', label: 'Work ratings', type: 'number', value: s.scoreWeights.rating })}
            <div class="sect">Exchange rates (daily reports in AUD, USD and GBP)</div>
            <p class="muted small full" style="margin:0">What 1 unit is worth in ${s.currency}. Totals that mix currencies are converted with these rates. Change them when the market moves.</p>
            ${E.field({ name: 'fxAUD', label: `1 AUD = ${s.currency}`, type: 'number', value: s.fxRates.AUD, attrs: 'step="any" min="0.0001"' })}${E.field({ name: 'fxUSD', label: `1 USD = ${s.currency}`, type: 'number', value: s.fxRates.USD, attrs: 'step="any" min="0.0001"' })}
            ${E.field({ name: 'fxGBP', label: `1 GBP = ${s.currency}`, type: 'number', value: s.fxRates.GBP, attrs: 'step="any" min="0.0001"' })}</div>
            <div class="foot" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary">Save settings</button></div></form>
          <div class="grid">
            <div class="card"><h3>Admin password</h3><p class="muted">Use a long, unique password. Heads of department are set from Departments, team leaders and team passwords from Teams.</p><button class="btn" id="adminPw">Change admin password</button></div>
            <div class="card"><h3>Website access password</h3>
              <p class="muted">Visitors must type this password before they can even see the departments or sign in. Only you can set, change or turn it off. A new password makes everyone who is not signed in type it again; people already signed in keep working.</p>
              <p>${gate.enabled ? html`<span class="badge ok">On</span> <span class="muted small">since ${fmt.dateTime(gate.setAt)}</span>` : html`<span class="badge warn">Off</span> <span class="muted small">anybody who opens the website sees the departments</span>`}</p>
              <div class="row"><button class="btn primary" id="gateSet">${gate.enabled ? 'Change the access password' : 'Set an access password'}</button>${gate.enabled ? html`<button class="btn danger" id="gateOff">Turn it off</button>` : ''}</div></div>
            <div class="card"><h3>Full backup <button class="btn sm primary" id="fullNow">Create full backup now</button></h3>
              <p class="muted small">Every ${full.days} days eTricks makes a complete copy of <b>everything</b> in the software: departments, people, attendance, leave, tasks, finance, sheets, chats and settings. You get an alert when it is ready. <b>Download it within ${full.graceDays} days. A backup that is not downloaded is deleted automatically.</b> After you have downloaded it you can delete it from the server.</p>
              <p class="small">${full.nextDue ? html`Next automatic backup: <b>${fmt.date(full.nextDue)}</b>` : ''}</p>
              ${E.table([
                { label: 'Backup', render: (b) => html`<span class="small"><b>${b.name}</b></span><div class="muted small">${fmt.dateTime(b.createdAt)} · ${fmt.num(b.tables)} tables · ${fmt.num(b.rows)} rows</div><div class="muted small" title="${b.sha256}">SHA-256 ${b.sha256.slice(0, 16)}…</div>` },
                { label: 'Size', render: (b) => size(b.size) },
                { label: 'Status', render: (b) => (b.status === 'ready' ? html`<span class="badge ${b.daysLeft <= 1 ? 'bad' : 'warn'}">Download within ${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'}</span><div class="muted small">then it is deleted</div>`
                  : b.status === 'downloaded' ? html`<span class="badge ok">Downloaded</span><div class="muted small">${fmt.dateTime(b.downloadedAt)}</div>`
                  : html`<span class="badge">Deleted</span><div class="muted small">${b.removedReason || ''}</div>`) },
                { label: '', class: 'right', render: (b) => (b.status === 'deleted' ? '' : html`<div class="actions"><a class="btn sm ${b.status === 'ready' ? 'primary' : ''}" data-dl href="/api/backups/full/${b.id}/download">${b.status === 'ready' ? 'Download' : 'Download again'}</a>${b.status === 'downloaded' ? html`<button class="btn sm danger" data-act="delfull" data-id="${b.id}">Delete from server</button>` : ''}</div>`) },
              ], full.items, 'No full backup yet. The first one is made automatically when the first period ends, or press "Create full backup now".')}</div>
            <div class="card"><h3>Daily safety copies <button class="btn sm" id="backupNow">Back up now</button></h3>
              <p class="muted small">A safety copy of the database is made automatically every day and the newest 30 are kept on the server (older ones are removed by themselves). They protect you against mistakes; the full backup above is the one to keep on your own computer.</p>
              ${E.table([{ label: 'Backup', render: (b) => html`<span class="small">${b.name}</span>` }, { label: 'Size', render: (b) => size(b.size) }, { label: 'Created', render: (b) => fmt.dateTime(b.createdAt) },
                { label: '', class: 'right', render: (b) => html`<a class="btn sm" href="/api/backups/${b.name}/download">Download</a>` }], backups.slice(0, 8), 'No backups yet.')}</div></div>
        </div>
        ${health ? html`<div class="card" style="margin-top:14px"><h3>Server health <button class="btn sm" id="healthReset">Start counting again</button></h3>
          <p class="muted small">What the server saw since it last started (${upFor(health.uptimeSeconds)} ago). If somebody says "it was slow" or "the page was blank", this is where to look. A request slower than ${health.slowLimitMs / 1000} seconds is also written to the server log.</p>
          <div class="stats">${E.stat('Requests', fmt.num(health.requests))}${E.stat('Failed', fmt.num(health.failed), { cls: health.failed > health.requests * 0.05 ? 'bad' : '' })}${E.stat('Slow requests', fmt.num(health.slowRequests), { cls: health.slowRequests ? 'bad' : 'accent' })}
            ${E.stat('Server was stuck (worst)', `${health.eventLoop.maxMs} ms`, { cls: health.eventLoop.maxMs > 500 ? 'bad' : 'accent', sub: `usually ${health.eventLoop.p99Ms} ms` })}${E.stat('Memory', `${health.memoryMb.rss} MB`)}${E.stat('Screens that failed in a browser', fmt.num(health.browserErrors.count), { cls: health.browserErrors.count ? 'bad' : 'accent' })}</div>
          ${E.table([{ label: 'Slowest in total', render: (r) => html`<span class="small">${r.route}</span>` }, { label: 'Calls', class: 'num', render: (r) => fmt.num(r.calls) }, { label: 'Average', class: 'num', render: (r) => `${r.avgMs} ms` }, { label: '95 of 100 are faster than', class: 'num', render: (r) => `${r.p95Ms} ms` }, { label: 'Slowest', class: 'num', render: (r) => `${r.maxMs} ms` }, { label: 'Errors', class: 'num', render: (r) => (r.serverErrors ? html`<span class="neg">${r.serverErrors}</span>` : r.errors) }], health.routes.slice(0, 6))}
          ${health.browserErrors.recent.length ? html`<h3 style="margin:16px 0 6px">Problems reported by the website itself</h3>${E.table([{ label: 'When', render: (r) => fmt.dateTime(r.at) }, { label: 'Who', render: (r) => r.role || 'visitor' }, { label: 'Screen', render: (r) => html`<span class="small">${r.page} ${r.where}</span>` }, { label: 'What', class: 'wrap', render: (r) => html`<span class="small">${r.message}</span>` }, { label: 'Browser', class: 'wrap', render: (r) => html`<span class="muted small">${r.agent}</span>` }], health.browserErrors.recent)}` : ''}</div>` : ''}
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
            fxRates: { AUD: v.fxAUD, USD: v.fxUSD, GBP: v.fxGBP },
          });
          E.toast('Settings saved');
        } catch (ex) { E.toast(ex.message, 'bad'); }
      };
      const hr = E.$('#healthReset', el); if (hr) hr.onclick = async () => { await E.post('/api/metrics/reset'); E.toast('Counting again from now'); E.pages.find((p) => p.id === 'settings').render(el); };
      E.$('#backupNow', el).onclick = async () => { try { await E.post('/api/backups'); E.toast('Backup created'); E.pages.find((p) => p.id === 'settings').render(el); } catch (ex) { E.toast(ex.message, 'bad'); } };
      const redraw = () => { E.pages.find((p) => p.id === 'settings').render(el); if (E.refreshBackupBar) E.refreshBackupBar(); };
      E.$('#fullNow', el).onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Making the backup…';
        try { const b = await E.post('/api/backups/full'); E.toast(`Full backup created (${b.tables} tables, ${b.rows} rows). Download it now.`); } catch (ex) { E.toast(ex.message, 'bad'); }
        redraw();
      };
      // The copy counts as downloaded when the whole file has arrived; look again a few seconds after the click.
      E.$$('a[data-dl]', el).forEach((a) => a.addEventListener('click', () => { E.toast('Download started. This page updates when it has finished.'); setTimeout(redraw, 6000); }));
      E.$('#gateSet', el).onclick = () => E.modal({
        title: gate.enabled ? 'Change the access password' : 'Set an access password', submit: 'Save password',
        body: html`<p class="muted">Share this password only with your team and clients. Use at least 8 characters.</p><div class="form">${E.field({ name: 'password', label: 'Access password', type: 'password', required: true, full: true, attrs: 'autocomplete="new-password"' })}${E.field({ name: 'again', label: 'Type it again', type: 'password', required: true, full: true, attrs: 'autocomplete="new-password"' })}</div>`,
        onSubmit: async (v, { close }) => {
          if (v.password !== v.again) throw new Error('The two passwords are not the same');
          await E.put('/api/gate', { password: v.password });
          E.toast('Access password saved'); close(); E.pages.find((p) => p.id === 'settings').render(el);
        },
      });
      const gateOff = E.$('#gateOff', el);
      if (gateOff) gateOff.onclick = async () => {
        if (!(await E.confirm('Turn the access password off? Anybody who opens the website will see the departments again.', { yes: 'Turn it off', danger: true }))) return;
        try { await E.del('/api/gate'); E.toast('Access password is off'); E.pages.find((p) => p.id === 'settings').render(el); } catch (ex) { E.toast(ex.message, 'bad'); }
      };
      E.$('#adminPw', el).onclick = () => E.modal({
        title: 'Change admin password', submit: 'Change password',
        body: html`<div class="form">${E.field({ name: 'currentPassword', label: 'Current password', type: 'password', required: true, full: true })}${E.field({ name: 'newPassword', label: 'New password (min 8 characters)', type: 'password', required: true, full: true })}</div>`,
        onSubmit: async (v, { close }) => { await E.put('/api/auth/admin-password', v); E.toast('Admin password changed'); close(); },
      });
      E.actions(el, {
        delfull: async (id) => {
          const b = full.items.find((x) => String(x.id) === id);
          if (!(await E.confirm(`Delete ${b.name} from the server? Make sure the downloaded file is saved safely on your computer. This cannot be undone.`, { yes: 'Delete from server', danger: true }))) return;
          try { await E.del(`/api/backups/full/${id}`); E.toast('Backup deleted from the server'); redraw(); } catch (ex) { E.toast(ex.message, 'bad'); }
        },
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
