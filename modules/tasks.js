(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  // A task is completed only when the person who assigned it approves the submission.
  const WORK_OPTIONS = [{ value: 'todo', label: 'To do' }, { value: 'in_progress', label: 'In progress' }, { value: 'blocked', label: 'Blocked' }];
  const STATUS_FILTER = [...WORK_OPTIONS, { value: 'pending_approval', label: 'Pending approval' }, { value: 'changes_requested', label: 'Changes requested' }, { value: 'rejected', label: 'Rejected' }, { value: 'done', label: 'Completed' }];
  const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

  // What the reviewer said last (shown to the assignee under the task).
  const feedback = (t) => {
    if (t.status === 'changes_requested' || t.status === 'rejected') {
      return html`<div class="feedback ${t.status === 'rejected' ? 'bad' : 'warn'}"><b>${t.status === 'rejected' ? 'Rejected' : 'Changes requested'}${t.reviewedBy ? ` by ${t.reviewedBy}` : ''}:</b> ${t.reviewNote || '-'}</div>`;
    }
    if (t.status === 'pending_approval' && t.submitNote) return html`<div class="feedback"><b>Your note:</b> ${t.submitNote}</div>`;
    if (t.status === 'done' && t.reviewNote) return html`<div class="feedback"><b>${t.reviewedBy || 'Reviewer'}:</b> ${t.reviewNote}</div>`;
    return '';
  };

  // ---------------- members, team leaders and heads: my tasks ----------------
  E.page({
    id: 'my-tasks', title: 'My Tasks & Work', icon: '☑', roles: E.SELF, group: E.myGroup, order: 30,
    async render(el) {
      const [tasks, logs] = await Promise.all([E.get('/api/tasks/me'), E.get('/api/worklogs/me')]);
      const statusCell = (t) => {
        if (t.status === 'pending_approval') return html`${E.badge('pending_approval')}<div class="muted small">Waiting for ${t.assignedBy || 'approval'}</div>`;
        if (t.status === 'done') return html`<span class="badge ok">Completed</span>${t.reviewedBy ? html`<div class="muted small">Approved by ${t.reviewedBy}</div>` : ''}`;
        const sent = t.status === 'changes_requested' || t.status === 'rejected';
        return html`${sent ? html`<div style="margin-bottom:6px">${E.badge(t.status)}</div>` : ''}
          <div class="row" style="gap:6px;flex-wrap:nowrap"><select data-status="${t.id}" style="width:auto">${sent ? html`<option value="" selected disabled>Update status…</option>` : ''}${WORK_OPTIONS.map((o) => html`<option value="${o.value}" ${o.value === t.status ? E.raw('selected') : ''}>${o.label}</option>`)}</select>
          <button class="btn sm primary" data-act="submit" data-id="${t.id}">Submit for approval</button></div>`;
      };
      E.mount(el, html`${E.pageHead('My tasks & daily work', 'Finish a task, then submit it. It is completed once the person who gave it to you approves it.', html`<button class="btn primary" data-act="log">+ Log today's work</button>`)}
        <h3 style="margin:0 0 10px">Tasks assigned to me</h3>
        ${E.table([
          { label: 'Task', class: 'wrap', render: (t) => html`<b>${t.title}</b>${t.description ? html`<div class="muted small">${t.description}</div>` : ''}${feedback(t)}` },
          { label: 'Priority', render: (t) => E.badge(t.priority) },
          { label: 'Due', render: (t) => html`${fmt.date(t.dueDate)}${t.overdue ? html` <span class="badge bad">Overdue</span>` : ''}` },
          { label: 'Assigned by', render: (t) => t.assignedBy || '-' },
          { label: 'Status', render: statusCell },
        ], tasks, 'No tasks assigned to you right now.')}
        <h3 style="margin:24px 0 10px">My recent work logs</h3>
        ${E.table([
          { label: 'Date', render: (l) => fmt.date(l.date) }, { label: 'Work done', class: 'wrap', render: (l) => html`${l.summary}${l.taskTitle ? html`<div class="muted small">Task: ${l.taskTitle}</div>` : ''}` },
          { label: 'Hours', class: 'num', key: 'hours' }, { label: 'Remarks / Issues', class: 'wrap', render: (l) => l.remarks || html`<span class="muted">-</span>` },
          { label: 'Review', render: (l) => (l.rating ? html`<span class="badge ok">${l.rating}/5</span>${l.reviewNote ? html`<div class="muted small">${l.reviewNote}</div>` : ''}` : html`<span class="muted">Pending</span>`) },
        ], logs, 'No work logged yet.')}`);
      const reload = () => E.pages.find((p) => p.id === 'my-tasks').render(el);
      el.onchange = async (ev) => {
        const sel = ev.target.closest('[data-status]');
        if (!sel || !sel.value) return;
        try { await E.post(`/api/tasks/${sel.dataset.status}/status`, { status: sel.value }); E.toast('Task updated'); reload(); } catch (ex) { E.toast(ex.message, 'bad'); }
      };
      E.actions(el, {
        submit: (id) => {
          const t = tasks.find((x) => String(x.id) === id);
          E.modal({
            title: 'Submit for approval', submit: 'Submit',
            body: html`<p><b>${t.title}</b></p><p class="muted">${t.assignedBy || 'The person who gave you this task'} will be asked to review it. The task stays "Pending approval" until then.</p>
              <div class="form">${E.field({ name: 'note', label: 'Completion note (optional)', type: 'textarea', full: true, placeholder: 'What did you do? Anything the reviewer should check?' })}</div>`,
            onSubmit: async (v, { close }) => { await E.post(`/api/tasks/${id}/submit`, { note: v.note || undefined }); E.toast('Sent for approval'); close(); reload(); },
          });
        },
        log: () => E.modal({
          title: 'Log work', submit: 'Save log',
          body: html`<div class="form">${E.field({ name: 'date', label: 'Date', type: 'date', value: E.today() })}
            ${E.field({ name: 'taskId', label: 'Related task', type: 'select', options: [{ value: '', label: 'None' }, ...tasks.filter((t) => t.status !== 'done').map((t) => ({ value: t.id, label: t.title }))] })}
            ${E.field({ name: 'summary', label: 'What did you work on?', type: 'textarea', required: true })}
            ${E.field({ name: 'hours', label: 'Hours worked', type: 'number', attrs: 'step="0.25" min="0" max="24"' })}
            ${E.field({ name: 'remarks', label: 'Remarks / Issues (optional)', type: 'textarea', placeholder: 'Any issue, challenge or extra remark about your task', help: 'Your leader is told when you write something here.' })}</div>`,
          onSubmit: async (v, { close }) => { await E.post('/api/worklogs', { ...v, taskId: v.taskId || null, remarks: v.remarks || undefined }); E.toast('Work log saved'); close(); reload(); },
        }),
      });
    },
  });

  // ---------------- leader / head / admin: tasks ----------------
  async function taskForm(existing, onSaved) {
    const admin = E.isAdmin();
    const deptId = existing ? existing.assigneeDepartmentId : admin ? '' : E.user.departmentId;
    const [emps, teams] = await Promise.all([E.employees(deptId), E.teams(deptId)]);
    const people = (list) => list.map((e) => ({ value: e.id, label: e.role === 'member' ? e.name : `${e.name} (${E.roleLabel[e.role]})` }));
    const extra = await E.customInputs('task', existing?.custom || {});
    // A submitted or completed task is changed only through Review, never from this form.
    const statusEditable = existing && !['pending_approval', 'done'].includes(existing.status);
    E.modal({
      title: existing ? 'Edit task' : 'Assign task', wide: true, submit: existing ? 'Save' : 'Assign',
      body: html`<div class="form">
        ${E.field({ name: 'title', label: 'Task', value: existing?.title, required: true, full: true })}
        ${E.field({ name: 'description', label: 'Details', type: 'textarea', value: existing?.description })}
        ${existing
          ? E.field({ name: 'assignedTo', label: 'Assigned to', type: 'select', value: existing.assignedTo, options: people(emps) })
          : html`${E.field({ name: 'assignedTo', label: 'Assign to', type: 'select', options: [{ value: '', label: 'Select a person…' }, ...people(emps)], help: 'or choose a whole team below' })}
            ${E.field({ name: 'teamId', label: 'Assign to whole team', type: 'select', options: E.idOptions(teams, 'No (one person)'), help: 'Creates one task for every active member' })}`}
        ${E.field({ name: 'priority', label: 'Priority', type: 'select', value: existing?.priority || 'medium', options: PRIORITIES })}
        ${E.field({ name: 'dueDate', label: 'Due date', type: 'date', value: existing?.dueDate })}
        ${statusEditable ? E.field({ name: 'status', label: 'Status', type: 'select', value: WORK_OPTIONS.some((o) => o.value === existing.status) ? existing.status : '', options: [...(WORK_OPTIONS.some((o) => o.value === existing.status) ? [] : [{ value: '', label: fmt.label(existing.status) }]), ...WORK_OPTIONS] }) : ''}
        ${existing && !statusEditable ? html`<div class="full muted small">${existing.status === 'done' ? 'This task is completed.' : 'This task is waiting for review. Use the Review button.'}</div>` : ''}
        ${extra.html}</div>`,
      onSubmit: async (v, { close }) => {
        const body = { ...v, assignedTo: v.assignedTo || null, teamId: v.teamId || null, status: v.status || undefined };
        if (existing) await E.put(`/api/tasks/${existing.id}`, body);
        else { const r = await E.post('/api/tasks', body); E.toast(`Assigned to ${r.created} employee${r.created > 1 ? 's' : ''}`); }
        close();
        onSaved();
      },
    });
  }

  // Approve / Request changes / Reject.
  function reviewModal(t, onDone) {
    const { form, close } = E.modal({
      title: `Review submission - ${t.assigneeName}`, wide: true, cancel: 'Close',
      body: html`<p><b>${t.title}</b>${t.description ? html`<span class="muted"> · ${t.description}</span>` : ''}</p>
        <div class="card" style="margin:10px 0"><div class="muted small">Submitted ${t.submittedAt ? fmt.dateTime(t.submittedAt) : ''} by ${t.assigneeName}</div>
          <div>${t.submitNote || html`<span class="muted">No note.</span>`}</div></div>
        <div class="form">${E.field({ name: 'note', label: 'Feedback', type: 'textarea', full: true, placeholder: 'Required to request changes or to reject. Optional when approving.' })}</div>
        <p class="muted small">Approve completes the task. Request changes sends it back for more work. Reject refuses the submission. ${t.assigneeName} is notified either way.</p>`,
    });
    const foot = E.$('.foot', form);
    const mk = (label, decision, cls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `btn ${cls}`; b.textContent = label;
      b.onclick = async () => {
        const note = form.elements.note.value.trim();
        if (decision !== 'approve' && !note) { form.elements.note.focus(); E.toast('Please write feedback first', 'bad'); return; }
        b.disabled = true;
        try { await E.post(`/api/tasks/${t.id}/review`, { decision, note: note || undefined }); E.toast({ approve: 'Approved. The task is completed.', changes: 'Sent back with your feedback', reject: 'Submission rejected' }[decision]); close(); onDone(); } catch (ex) { E.toast(ex.message, 'bad'); b.disabled = false; }
      };
      foot.append(b);
    };
    mk('Reject', 'reject', 'danger'); mk('Request changes', 'changes', ''); mk('Approve', 'approve', 'primary');
  }

  E.page({
    id: 'tasks', title: 'Tasks', icon: '☑', roles: E.MANAGE, group: 'Operations', order: 10,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Tasks', subtitle: 'Assign work to people or whole teams. Finished work comes back here for your approval.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Assign task</button>`,
        filters: [
          { name: 'search', label: 'Search', placeholder: 'Task or employee' },
          ...(E.isLeader() ? [] : [{ name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...E.idOptions(teams)] }]),
          { name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, ...STATUS_FILTER] },
          { name: 'priority', label: 'Priority', type: 'select', options: [{ value: '', label: 'Any' }, ...PRIORITIES] },
          { name: 'overdue', label: 'Overdue only', type: 'select', options: [{ value: '', label: 'No' }, { value: '1', label: 'Yes' }] },
        ],
        csv: (f) => `/api/tasks${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          rows = await E.get(`/api/tasks${E.qs(f)}`);
          const review = rows.filter((r) => r.canReview).length;
          return html`<div class="stats">${E.stat('Tasks shown', rows.length)}${E.stat('Open', rows.filter((r) => r.status !== 'done').length)}
            ${E.stat('To review', review, { cls: review ? 'accent' : '', sub: review ? 'waiting for your decision' : '' })}
            ${E.stat('Overdue', rows.filter((r) => r.overdue).length, { cls: rows.some((r) => r.overdue) ? 'bad' : '' })}${E.stat('Completed', rows.filter((r) => r.status === 'done').length, { cls: 'accent' })}</div>
            ${E.table([
              { label: 'Task', class: 'wrap', render: (t) => html`<b>${t.title}</b>${t.description ? html`<div class="muted small">${t.description}</div>` : ''}${t.status === 'pending_approval' && t.submitNote ? html`<div class="feedback"><b>Submission note:</b> ${t.submitNote}</div>` : ''}${t.reviewNote && t.status !== 'pending_approval' ? html`<div class="muted small">${t.reviewedBy}: ${t.reviewNote}</div>` : ''}` },
              { label: 'Assigned to', render: (t) => html`${t.assigneeName}<div class="muted small">${t.teamName || 'No team'}${E.isAdmin() ? ` · ${t.departmentName}` : ''}</div>` },
              { label: 'Priority', render: (t) => E.badge(t.priority) },
              { label: 'Due', render: (t) => html`${fmt.date(t.dueDate)}${t.overdue ? html` <span class="badge bad">Overdue</span>` : ''}` },
              { label: 'Status', render: (t) => html`${t.status === 'done' ? html`<span class="badge ok">Completed</span>` : E.badge(t.status)}${t.assignedBy ? html`<div class="muted small">by ${t.assignedBy}</div>` : ''}` },
              { label: '', class: 'right', render: (t) => html`<div class="actions">${t.canReview ? html`<button class="btn sm primary" data-act="review" data-id="${t.id}">Review</button>` : ''}<button class="btn sm" data-act="edit" data-id="${t.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${t.id}">Delete</button></div>` },
            ], rows, 'No tasks match these filters.')}`;
        },
        bind: (box, refresh) => E.actions(box, {
          review: (id) => reviewModal(rows.find((r) => String(r.id) === id), refresh),
          edit: (id) => taskForm(rows.find((r) => String(r.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this task? This cannot be undone.', { yes: 'Delete', danger: true })) { await E.del(`/api/tasks/${id}`); E.toast('Task deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => taskForm(null, ctrl.refresh) });
    },
  });

  // ---------------- leader / head / admin: daily work logs ----------------
  E.page({
    id: 'worklogs', title: 'Daily Work Logs', icon: '✎', roles: E.MANAGE, group: 'Operations', order: 20,
    async render(el) {
      let rows = [];
      await E.listPage(el, {
        title: 'Daily work logs', subtitle: 'What each person did, with their remarks and issues. Rate their work to feed the performance score.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.today() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Search', placeholder: 'Employee or work' },
        ],
        csv: (f) => `/api/worklogs${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          rows = await E.get(`/api/worklogs${E.qs(f)}`);
          return E.table([
            { label: 'Date', render: (l) => fmt.date(l.date) }, { label: 'Employee', render: (l) => html`<b>${l.employeeName}</b><div class="muted small">${l.empCode}</div>` },
            { label: 'Work', class: 'wrap', render: (l) => html`${l.summary}${l.taskTitle ? html`<div class="muted small">Task: ${l.taskTitle}</div>` : ''}` },
            { label: 'Hours', class: 'num', key: 'hours' },
            { label: 'Remarks / Issues', class: 'wrap', render: (l) => (l.remarks ? html`<span class="badge warn">Remark</span> ${l.remarks}` : html`<span class="muted">-</span>`) },
            { label: 'Rating', render: (l) => (l.rating ? html`<span class="badge ok">${l.rating}/5</span>${l.reviewNote ? html`<div class="muted small">${l.reviewNote}</div>` : ''}` : html`<span class="muted">Not rated</span>`) },
            { label: '', class: 'right', render: (l) => (l.canReview ? html`<button class="btn sm" data-act="rate" data-id="${l.id}">${l.rating ? 'Re-rate' : 'Rate'}</button>` : '') },
          ], rows, 'No work logged for this period.');
        },
        bind: (box, refresh) => E.actions(box, {
          rate: (id) => {
            const l = rows.find((r) => String(r.id) === id);
            E.modal({
              title: `Rate work - ${l.employeeName}`,
              body: html`<p>${l.summary}</p>${l.remarks ? html`<p class="muted"><b>Remarks / issues:</b> ${l.remarks}</p>` : ''}<div class="form">${E.field({ name: 'rating', label: 'Rating (1 = poor, 5 = excellent)', type: 'select', value: l.rating || 4, options: [1, 2, 3, 4, 5] })}${E.field({ name: 'note', label: 'Feedback (optional)', value: l.reviewNote, full: true })}</div>`,
              onSubmit: async (v, { close }) => { await E.post(`/api/worklogs/${id}/review`, v); E.toast('Review saved'); close(); refresh(); },
            });
          },
        }),
      });
    },
  });
})();
