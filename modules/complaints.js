(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const SEV_KIND = { low: '', medium: 'warn', high: 'bad' };
  const STATUS_KIND = { open: 'bad', under_review: 'warn', resolved: 'ok', dismissed: '' };
  const sevBadge = (s) => html`<span class="badge ${SEV_KIND[s]}">${fmt.label(s)}</span>`;
  const statusBadge = (s) => html`<span class="badge ${STATUS_KIND[s]}">${fmt.label(s)}</span>`;
  E.complaintBadges = { sevBadge, statusBadge };

  // ---------------- leader / admin ----------------
  async function fileForm(onSaved) {
    const [meta, emps] = await Promise.all([E.get('/api/complaints/meta'), E.employees(E.isAdmin() ? '' : E.user.departmentId)]);
    E.modal({
      title: 'File a complaint', wide: true, submit: 'File complaint',
      body: html`<div class="form">
        ${E.field({ name: 'employeeId', label: 'Person', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select a person…' }, ...emps.filter((e) => e.id !== E.user.employeeId).map((e) => ({ value: e.id, label: `${e.name} (${e.empCode})${e.role !== 'member' ? ` - ${E.roleLabel[e.role]}` : ''}${E.isAdmin() ? ` - ${e.departmentName}` : ''}` }))] })}
        ${E.field({ name: 'category', label: 'Category', type: 'select', required: true, options: meta.categories })}
        ${E.field({ name: 'severity', label: 'Severity', type: 'select', value: 'medium', options: meta.severities })}
        ${E.field({ name: 'incidentDate', label: 'Date it happened', type: 'date', value: E.today(), attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'description', label: 'What happened?', type: 'textarea', required: true })}</div>
        <p class="muted small">The person is notified and can see this complaint and reply to it. Their head of department (and the admin) are told too. It also appears in their performance report.</p>`,
      onSubmit: async (v, { close }) => { await E.post('/api/complaints', v); E.toast('Complaint filed. The member has been notified.'); close(); onSaved(); },
    });
  }

  async function updateForm(c, onSaved) {
    const meta = await E.get('/api/complaints/meta');
    E.modal({
      title: `Complaint about ${c.employeeName}`, wide: true, submit: 'Save',
      body: html`<p><b>${c.category}</b> · ${sevBadge(c.severity)} · filed by ${c.filedBy} on ${fmt.date(c.createdAt)}</p><p>${c.description}</p>
        ${c.memberResponse ? html`<div class="card" style="margin-bottom:12px"><div class="muted small">${c.employeeName}'s reply (${fmt.date(c.respondedAt)})</div>${c.memberResponse}</div>` : html`<p class="muted small">No reply from the member yet.</p>`}
        <div class="form">${E.field({ name: 'status', label: 'Status', type: 'select', value: c.status, options: meta.statuses.map((s) => ({ value: s, label: fmt.label(s) })) })}
          ${E.field({ name: 'severity', label: 'Severity', type: 'select', value: c.severity, options: meta.severities })}
          ${E.field({ name: 'resolutionNote', label: 'Resolution / action taken', type: 'textarea', value: c.resolutionNote })}</div>`,
      onSubmit: async (v, { close }) => { await E.put(`/api/complaints/${c.id}`, v); E.toast('Complaint updated'); close(); onSaved(); },
    });
  }

  E.page({
    id: 'complaints', title: 'Complaints', icon: '⚠', roles: E.MANAGE, group: 'People', order: 50,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Complaints', subtitle: 'Raise a complaint about somebody below you. They are notified and it is added to their report.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ File complaint</button>`,
        filters: [
          { name: 'search', label: 'Search', placeholder: 'Member or text' },
          { name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, 'open', 'under_review', 'resolved', 'dismissed'] },
          { name: 'severity', label: 'Severity', type: 'select', options: [{ value: '', label: 'Any' }, 'low', 'medium', 'high'] },
        ],
        csv: (f) => `/api/complaints${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          rows = await E.get(`/api/complaints${E.qs(f)}`);
          return E.table([
            { label: 'Filed', render: (c) => html`${fmt.date(c.createdAt)}<div class="muted small">${c.filedBy}</div>` },
            { label: 'About', render: (c) => html`<b>${c.employeeName}</b>${c.employeeRole !== 'member' ? html` <span class="badge ${c.employeeRole === 'hod' ? 'info' : 'ok'}">${E.roleLabel[c.employeeRole]}</span>` : ''}<div class="muted small">${c.empCode}${E.isAdmin() ? ` · ${c.departmentName}` : ''}</div>` },
            { label: 'Complaint', class: 'wrap', render: (c) => html`<b>${c.category}</b> ${sevBadge(c.severity)}<div>${c.description}</div>${c.memberResponse ? html`<div class="muted small">Member replied: “${c.memberResponse}”</div>` : ''}${c.resolutionNote ? html`<div class="muted small">Action: ${c.resolutionNote}</div>` : ''}` },
            { label: 'Status', render: (c) => statusBadge(c.status) },
            { label: '', class: 'right', render: (c) => html`<div class="actions">${c.canManage ? html`<button class="btn sm" data-act="edit" data-id="${c.id}">Update</button>` : ''}${E.isAdmin() ? html`<button class="btn sm danger" data-act="del" data-id="${c.id}">Delete</button>` : ''}</div>` },
          ], rows, 'No complaints found.');
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => updateForm(rows.find((c) => String(c.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this complaint permanently? It is recorded in the activity log.', { yes: 'Delete', danger: true })) { await E.del(`/api/complaints/${id}`); E.toast('Deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => fileForm(ctrl.refresh) });
    },
  });

  // ---------------- member: complaints about me ----------------
  E.page({
    id: 'my-complaints', title: 'Complaints About Me', icon: '⚠', roles: E.SELF, group: E.myGroup, order: 35,
    async render(el) {
      const rows = await E.get('/api/complaints/me');
      E.mount(el, html`${E.pageHead('Complaints about me', 'You can read each complaint and give your side of the story. The person who filed it, and your seniors, will see your reply.')}
        ${rows.length ? html`<div class="grid">${rows.map((c) => html`<div class="card">
          <h3><span>${c.category} ${sevBadge(c.severity)}</span>${statusBadge(c.status)}</h3>
          <div>${c.description}</div>
          <div class="muted small" style="margin-top:6px">Filed by ${c.filedBy} on ${fmt.date(c.createdAt)}${c.incidentDate ? ` · happened on ${fmt.date(c.incidentDate)}` : ''}</div>
          ${c.resolutionNote ? html`<div style="margin-top:8px"><b>Action taken:</b> ${c.resolutionNote}</div>` : ''}
          ${c.memberResponse ? html`<div class="card" style="margin-top:10px;background:var(--panel2)"><div class="muted small">Your reply (${fmt.date(c.respondedAt)})</div>${c.memberResponse}</div>` : ''}
          <div style="margin-top:10px"><button class="btn sm ${c.memberResponse ? '' : 'primary'}" data-act="reply" data-id="${c.id}">${c.memberResponse ? 'Change my reply' : 'Reply'}</button></div></div>`)}</div>`
          : html`<div class="card empty">No complaints. Keep it up!</div>`}`);
      E.actions(el, {
        reply: (id) => {
          const c = rows.find((x) => String(x.id) === id);
          E.modal({
            title: 'Reply to complaint', submit: 'Send reply',
            body: html`<p class="muted">${c.category}: ${c.description}</p><div class="form">${E.field({ name: 'response', label: 'Your reply', type: 'textarea', required: true, value: c.memberResponse })}</div>`,
            onSubmit: async (v, { close }) => { await E.post(`/api/complaints/${id}/respond`, v); E.toast('Reply sent'); close(); E.pages.find((p) => p.id === 'my-complaints').render(el); },
          });
        },
      });
    },
  });
})();
