(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const place = (team, dept) => (team ? `${team} (${dept})` : 'No team');

  // Moves one member to another team and keeps their whole history.
  // emp: the member (a member asking for themselves passes null). onDone() runs after the request or the move.
  E.transferForm = async (emp, onDone = () => {}) => {
    const targets = (await E.get('/api/transfers/targets')).filter((t) => !emp || t.id !== emp.teamId);
    const self = !emp;
    const direct = E.isAdmin() || E.isHead();
    E.modal({
      title: self ? 'Ask to move to another team' : `${direct ? 'Transfer' : 'Ask for transfer of'} ${emp.name}`, submit: direct ? 'Transfer' : 'Send request',
      body: html`${self ? '' : html`<p class="muted">Now in: <b>${place(emp.teamName, emp.departmentName)}</b></p>`}
        <div class="form">${E.field({ name: 'toTeamId', label: 'Move to team', type: 'select', required: true, full: true,
          options: [{ value: '', label: 'Select the team…' }, ...targets.map((t) => ({ value: t.id, label: `${t.departmentName} · ${t.name}${t.leaderName ? ` (leader ${t.leaderName})` : ''}` }))] })}
        ${E.field({ name: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Why is the move needed?' })}</div>
        <p class="muted small">${self ? 'Your head of department (or the admin, for another department) decides. ' : ''}The profile, joining history, attendance, leave, tasks, orders, salary and complaints all move along with the person.${direct ? ' A move inside your own department happens at once.' : ''}</p>`,
      onSubmit: async (v, { close }) => {
        const r = await E.post('/api/transfers', { employeeId: emp?.id, toTeamId: Number(v.toTeamId), reason: v.reason || undefined });
        E.bust('emps'); E.bust('teams');
        close();
        if (r.status === 'done') {
          E.toast(r.summary || 'Transferred');
          if (r.pin) E.showPin(emp.name, r.pin);
        } else E.toast('Request sent. You will be notified when it is decided.');
        onDone();
      },
    });
  };

  const statusKind = { pending: 'warn', done: 'ok', rejected: 'bad', cancelled: '' };
  const statusText = { pending: 'Waiting for a decision', done: 'Moved', rejected: 'Declined', cancelled: 'Cancelled' };

  function decideModal(t, approve, onDone) {
    E.modal({
      title: `${approve ? 'Approve' : 'Decline'} transfer of ${t.employeeName}`, submit: approve ? 'Approve and move' : 'Decline',
      body: html`<p>${place(t.fromTeamName, t.fromDepartmentName)} → <b>${place(t.toTeamName, t.toDepartmentName)}</b></p>${t.reason ? html`<p class="muted">${t.reason}</p>` : ''}
        <div class="form">${E.field({ name: 'note', label: 'Note (optional)', full: true })}</div>`,
      onSubmit: async (v, { close }) => {
        const r = await E.put(`/api/transfers/${t.id}/${approve ? 'approve' : 'reject'}`, { note: v.note || undefined });
        E.bust('emps'); E.bust('teams');
        close();
        E.toast(approve ? 'Transfer done' : 'Request declined');
        if (r.pin) E.showPin(t.employeeName, r.pin);
        onDone();
      },
    });
  }

  E.page({
    id: 'transfers', title: 'Transfers', icon: '⇄', roles: ['admin', 'hod', 'leader', 'member'], group: (role) => (role === 'member' ? '' : 'People'), order: 25,
    async render(el) {
      const isMember = E.user.role === 'member';
      let rows = [];
      let ctrl;
      ctrl = await E.listPage(el, {
        title: isMember ? 'Change team' : 'Transfers',
        subtitle: isMember ? 'Ask to move to another team. Your history stays with you.' : 'Move a member to another team and keep their full history. Requests wait here for a decision.',
        actions: isMember ? html`<button class="btn primary" data-act="mine">Ask to move to another team</button>` : html`<button class="btn primary" data-act="new">+ New transfer</button>`,
        filters: [{ name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, { value: 'pending', label: 'Waiting' }, { value: 'done', label: 'Moved' }, { value: 'rejected', label: 'Declined' }, { value: 'cancelled', label: 'Cancelled' }] }],
        load: async (f) => {
          rows = await E.get(`/api/transfers${E.qs(f)}`);
          return E.table([
            { label: 'Requested', render: (t) => html`${fmt.date(t.requestedAt)}<div class="muted small">${t.requestedBy}</div>` },
            ...(isMember ? [] : [{ label: 'Person', render: (t) => html`<b>${t.employeeName}</b><div class="muted small">${t.empCode}</div>` }]),
            { label: 'From → To', render: (t) => html`${place(t.fromTeamName, t.fromDepartmentName)}<div><b>→ ${place(t.toTeamName, t.toDepartmentName)}</b></div>` },
            { label: 'Reason', class: 'wrap', render: (t) => t.reason || '' },
            { label: 'Status', render: (t) => html`<span class="badge ${statusKind[t.status]}">${statusText[t.status]}</span>${t.decidedBy ? html`<div class="muted small">${t.decidedBy}${t.decisionNote ? ` - ${t.decisionNote}` : ''}</div>` : ''}` },
            { label: '', class: 'right', render: (t) => html`<div class="actions">${t.canDecide ? html`<button class="btn sm primary" data-act="ok" data-id="${t.id}">Approve</button><button class="btn sm danger" data-act="no" data-id="${t.id}">Decline</button>` : ''}${t.canCancel && !t.canDecide ? html`<button class="btn sm" data-act="cancel" data-id="${t.id}">Cancel request</button>` : ''}</div>` },
          ], rows, isMember ? 'You have not asked to move.' : 'No transfers yet.');
        },
        bind: (box, refresh) => {
          const find = (id) => rows.find((t) => String(t.id) === id);
          E.actions(box, {
            ok: (id) => decideModal(find(id), true, refresh),
            no: (id) => decideModal(find(id), false, refresh),
            cancel: async (id) => { if (await E.confirm('Cancel this request?')) { await E.del(`/api/transfers/${id}`); E.toast('Cancelled'); refresh(); } },
          });
        },
      });
      E.actions(el, {
        mine: () => E.transferForm(null, ctrl.refresh),
        new: async () => {
          const people = (await E.employees('')).filter((e) => e.role === 'member');
          const { close, form } = E.modal({
            title: 'Whom do you want to move?', submit: 'Next',
            body: html`<div class="form">${E.field({ name: 'employeeId', label: 'Team member', type: 'select', required: true, full: true,
              options: [{ value: '', label: 'Select…' }, ...people.map((e) => ({ value: e.id, label: `${e.name} (${e.empCode}) - ${e.teamName ? `${e.teamName}${E.isAdmin() ? `, ${e.departmentName}` : ''}` : 'no team'}` }))] })}</div>`,
            onSubmit: async (v, { close: c }) => { c(); E.transferForm(people.find((e) => String(e.id) === v.employeeId), ctrl.refresh); },
          });
          void close; void form;
        },
      });
    },
  });
})();
