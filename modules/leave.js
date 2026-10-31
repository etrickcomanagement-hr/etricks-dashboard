(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const range = (r) => (r.fromDate === r.toDate ? fmt.date(r.fromDate) : `${fmt.date(r.fromDate)} → ${fmt.date(r.toDate)}`);

  // ---------------- member ----------------
  E.page({
    id: 'my-leave', title: 'My Leave', icon: '✈', roles: E.SELF, group: E.myGroup, order: 20,
    async render(el) {
      const rows = await E.get('/api/leave/me');
      E.mount(el, html`${E.pageHead('My leave', 'Request time off and track the decision.', html`<button class="btn primary" data-act="new">+ Request leave</button>`)}
        ${E.table([
          { label: 'Dates', render: range }, { label: 'Days', class: 'num', key: 'days' }, { label: 'Type', key: 'leaveType' }, { label: 'Reason', class: 'wrap', key: 'reason' },
          { label: 'Status', render: (r) => html`${E.badge(r.status)}${r.decidedBy ? html`<div class="muted small">${r.decidedBy}${r.decisionNote ? ` - ${r.decisionNote}` : ''}</div>` : ''}` },
          { label: '', class: 'right', render: (r) => (r.status === 'pending' ? html`<button class="btn sm danger" data-act="cancel" data-id="${r.id}">Cancel</button>` : '') },
        ], rows, 'You have not requested any leave yet.')}`);
      const reload = () => E.pages.find((p) => p.id === 'my-leave').render(el);
      E.actions(el, {
        cancel: async (id) => { if (await E.confirm('Cancel this leave request?')) { await E.post(`/api/leave/${id}/cancel`); reload(); } },
        new: async () => {
          const types = await E.get('/api/leave/types');
          E.modal({
            title: 'Request leave', submit: 'Send request',
            body: html`<div class="form">${E.field({ name: 'leaveType', label: 'Type', type: 'select', options: types, required: true })}<div></div>
              ${E.field({ name: 'fromDate', label: 'From', type: 'date', value: E.today(), required: true })}${E.field({ name: 'toDate', label: 'To', type: 'date', value: E.today(), required: true })}
              ${E.field({ name: 'reason', label: 'Reason', type: 'textarea', required: true })}</div>`,
            onSubmit: async (v, { close }) => { const r = await E.post('/api/leave', v); E.toast(`Request sent (${r.days} working day${r.days > 1 ? 's' : ''})`); close(); reload(); },
          });
        },
      });
    },
  });

  // ---------------- leader / admin ----------------
  const decideModal = (r, status, onDone) => E.modal({
    title: `${status === 'approved' ? 'Approve' : 'Reject'} leave - ${r.employeeName}`, submit: status === 'approved' ? 'Approve' : 'Reject',
    body: html`<p>${range(r)} · ${r.days} working day(s) · ${r.leaveType}</p><p class="muted">${r.reason}</p><div class="form">${E.field({ name: 'note', label: 'Note (optional)', full: true })}</div>`,
    onSubmit: async (v, { close }) => { await E.post(`/api/leave/${r.id}/decision`, { status, note: v.note }); E.toast(`Leave ${status}`); close(); onDone(); },
  });

  E.page({
    id: 'leave', title: 'Leave Requests', icon: '✈', roles: E.MANAGE, group: 'People', order: 30,
    async render(el) {
      let rows = [];
      await E.listPage(el, {
        title: 'Leave requests', subtitle: E.isLeader() ? 'Time-off requests from your team.' : E.isHead() ? 'Time-off requests from your team leaders and members. The admin decides on yours.' : 'Review and approve time-off requests.', dept: true,
        filters: [
          { name: 'status', label: 'Status', type: 'select', value: 'pending', options: [{ value: '', label: 'Any' }, 'pending', 'approved', 'rejected', 'cancelled'] },
          { name: 'search', label: 'Employee', placeholder: 'Name or code' },
          { name: 'from', label: 'From date', type: 'date' }, { name: 'to', label: 'To date', type: 'date' },
        ],
        csv: (f) => `/api/leave${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          rows = await E.get(`/api/leave${E.qs(f)}`);
          return E.table([
            { label: 'Employee', render: (r) => html`<b>${r.employeeName}</b>${r.role !== 'member' ? html` <span class="badge ${r.role === 'hod' ? 'info' : 'ok'}">${E.roleLabel[r.role]}</span>` : ''}<div class="muted small">${r.empCode} · ${r.teamName || 'No team'}${E.isAdmin() ? ` · ${r.departmentName}` : ''}</div>` },
            { label: 'Dates', render: range }, { label: 'Days', class: 'num', key: 'days' }, { label: 'Type', key: 'leaveType' }, { label: 'Reason', class: 'wrap', key: 'reason' },
            { label: 'Status', render: (r) => html`${E.badge(r.status)}${r.decidedBy ? html`<div class="muted small">${r.decidedBy}</div>` : ''}` },
            { label: '', class: 'right', render: (r) => (r.status === 'pending' ? (r.canDecide ? html`<div class="actions"><button class="btn sm primary" data-act="ok" data-id="${r.id}">Approve</button><button class="btn sm danger" data-act="no" data-id="${r.id}">Reject</button></div>` : html`<span class="muted small">Decided by the person above</span>`) : '') },
          ], rows, 'No leave requests found.');
        },
        bind: (box, refresh) => E.actions(box, {
          ok: (id) => decideModal(rows.find((r) => String(r.id) === id), 'approved', refresh),
          no: (id) => decideModal(rows.find((r) => String(r.id) === id), 'rejected', refresh),
        }),
      });
    },
  });
})();
