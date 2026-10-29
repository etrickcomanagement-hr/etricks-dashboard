(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const STATUS_OPTIONS = [{ value: 'todo', label: 'To do' }, { value: 'in_progress', label: 'In progress' }, { value: 'blocked', label: 'Blocked' }, { value: 'done', label: 'Done' }];
  const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

  // ---------------- member ----------------
  E.page({
    id: 'my-tasks', title: 'My Tasks & Work', icon: '☑', roles: ['member'], order: 30,
    async render(el) {
      const [tasks, logs] = await Promise.all([E.get('/api/tasks/me'), E.get('/api/worklogs/me')]);
      E.mount(el, html`${E.pageHead('My tasks & daily work', 'Update task progress and log what you did today.', html`<button class="btn primary" data-act="log">+ Log today's work</button>`)}
        <h3 style="margin:0 0 10px">Tasks assigned to me</h3>
        ${E.table([
          { label: 'Task', class: 'wrap', render: (t) => html`<b>${t.title}</b>${t.description ? html`<div class="muted small">${t.description}</div>` : ''}` },
          { label: 'Priority', render: (t) => E.badge(t.priority) },
          { label: 'Due', render: (t) => html`${fmt.date(t.dueDate)}${t.overdue ? html` <span class="badge bad">Overdue</span>` : ''}` },
          { label: 'Assigned by', render: (t) => t.assignedBy || '-' },
          { label: 'Status', render: (t) => html`<select data-status="${t.id}" style="width:auto">${STATUS_OPTIONS.map((o) => html`<option value="${o.value}" ${o.value === t.status ? E.raw('selected') : ''}>${o.label}</option>`)}</select>` },
        ], tasks, 'No tasks assigned to you right now.')}
        <h3 style="margin:24px 0 10px">My recent work logs</h3>
        ${E.table([
          { label: 'Date', render: (l) => fmt.date(l.date) }, { label: 'Work done', class: 'wrap', render: (l) => html`${l.summary}${l.taskTitle ? html`<div class="muted small">Task: ${l.taskTitle}</div>` : ''}` },
          { label: 'Hours', class: 'num', key: 'hours' }, { label: 'Units / orders', class: 'num', key: 'units' },
          { label: 'Leader review', render: (l) => (l.rating ? html`<span class="badge ok">${l.rating}/5</span>${l.reviewNote ? html`<div class="muted small">${l.reviewNote}</div>` : ''}` : html`<span class="muted">Pending</span>`) },
        ], logs, 'No work logged yet.')}`);
      const reload = () => E.pages.find((p) => p.id === 'my-tasks').render(el);
      el.onchange = async (ev) => {
        const sel = ev.target.closest('[data-status]');
        if (!sel) return;
        try { await E.post(`/api/tasks/${sel.dataset.status}/status`, { status: sel.value }); E.toast('Task updated'); reload(); } catch (ex) { E.toast(ex.message, 'bad'); }
      };
      E.actions(el, {
        log: () => E.modal({
          title: 'Log work', submit: 'Save log',
          body: html`<div class="form">${E.field({ name: 'date', label: 'Date', type: 'date', value: E.today() })}
            ${E.field({ name: 'taskId', label: 'Related task', type: 'select', options: [{ value: '', label: 'None' }, ...tasks.filter((t) => t.status !== 'done').map((t) => ({ value: t.id, label: t.title }))] })}
            ${E.field({ name: 'summary', label: 'What did you work on?', type: 'textarea', required: true })}
            ${E.field({ name: 'hours', label: 'Hours worked', type: 'number', attrs: 'step="0.25" min="0" max="24"' })}${E.field({ name: 'units', label: 'Units / orders handled', type: 'number', attrs: 'min="0"' })}</div>`,
          onSubmit: async (v, { close }) => { await E.post('/api/worklogs', { ...v, taskId: v.taskId || null }); E.toast('Work log saved'); close(); reload(); },
        }),
      });
    },
  });

  // ---------------- leader / admin: tasks ----------------
  async function taskForm(existing, onSaved) {
    const admin = E.isAdmin();
    const deptId = existing ? existing.departmentId : admin ? '' : E.user.departmentId;
    const [emps, teams] = await Promise.all([E.employees(deptId), E.teams(deptId)]);
    const extra = await E.customInputs('task', existing?.custom || {});
    E.modal({
      title: existing ? 'Edit task' : 'Assign task', wide: true, submit: existing ? 'Save' : 'Assign',
      body: html`<div class="form">
        ${E.field({ name: 'title', label: 'Task', value: existing?.title, required: true, full: true })}
        ${E.field({ name: 'description', label: 'Details', type: 'textarea', value: existing?.description })}
        ${existing
          ? E.field({ name: 'assignedTo', label: 'Assigned to', type: 'select', value: existing.assignedTo, options: E.idOptions(emps) })
          : html`${E.field({ name: 'assignedTo', label: 'Assign to employee', type: 'select', options: E.idOptions(emps, 'Select employee…'), help: 'or choose a whole team below' })}
            ${E.field({ name: 'teamId', label: 'Assign to whole team', type: 'select', options: E.idOptions(teams, 'No (single employee)'), help: 'Creates one task for every active member' })}`}
        ${E.field({ name: 'priority', label: 'Priority', type: 'select', value: existing?.priority || 'medium', options: PRIORITIES })}
        ${E.field({ name: 'dueDate', label: 'Due date', type: 'date', value: existing?.dueDate })}
        ${existing ? E.field({ name: 'status', label: 'Status', type: 'select', value: existing.status, options: STATUS_OPTIONS }) : ''}
        ${extra.html}</div>`,
      onSubmit: async (v, { close }) => {
        const body = { ...v, assignedTo: v.assignedTo || null, teamId: v.teamId || null };
        if (existing) await E.put(`/api/tasks/${existing.id}`, body);
        else { const r = await E.post('/api/tasks', body); E.toast(`Assigned to ${r.created} employee${r.created > 1 ? 's' : ''}`); }
        close();
        onSaved();
      },
    });
  }

  E.page({
    id: 'tasks', title: 'Tasks', icon: '☑', roles: ['admin', 'leader'], group: 'Operations', order: 10,
    async render(el) {
      const teams = await E.teams(E.isAdmin() ? '' : E.user.departmentId);
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Tasks', subtitle: 'Assign work to people or whole teams and follow progress.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Assign task</button>`,
        filters: [
          { name: 'search', label: 'Search', placeholder: 'Task or employee' },
          { name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...E.idOptions(teams)] },
          { name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, ...STATUS_OPTIONS] },
          { name: 'priority', label: 'Priority', type: 'select', options: [{ value: '', label: 'Any' }, ...PRIORITIES] },
          { name: 'overdue', label: 'Overdue only', type: 'select', options: [{ value: '', label: 'No' }, { value: '1', label: 'Yes' }] },
        ],
        csv: (f) => `/api/tasks${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          rows = await E.get(`/api/tasks${E.qs(f)}`);
          return html`<div class="stats">${E.stat('Tasks shown', rows.length)}${E.stat('Open', rows.filter((r) => r.status !== 'done').length)}
            ${E.stat('Overdue', rows.filter((r) => r.overdue).length, { cls: rows.some((r) => r.overdue) ? 'bad' : '' })}${E.stat('Done', rows.filter((r) => r.status === 'done').length, { cls: 'accent' })}</div>
            ${E.table([
              { label: 'Task', class: 'wrap', render: (t) => html`<b>${t.title}</b>${t.description ? html`<div class="muted small">${t.description}</div>` : ''}` },
              { label: 'Assigned to', render: (t) => html`${t.assigneeName}<div class="muted small">${t.teamName || 'No team'}${E.isAdmin() ? ` · ${t.departmentName}` : ''}</div>` },
              { label: 'Priority', render: (t) => E.badge(t.priority) },
              { label: 'Due', render: (t) => html`${fmt.date(t.dueDate)}${t.overdue ? html` <span class="badge bad">Overdue</span>` : ''}` },
              { label: 'Status', render: (t) => E.badge(t.status) },
              { label: '', class: 'right', render: (t) => html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${t.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${t.id}">Delete</button></div>` },
            ], rows, 'No tasks match these filters.')}`;
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => taskForm(rows.find((r) => String(r.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this task? This cannot be undone.', { yes: 'Delete', danger: true })) { await E.del(`/api/tasks/${id}`); E.toast('Task deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => taskForm(null, ctrl.refresh) });
    },
  });

  // ---------------- leader / admin: daily work logs ----------------
  E.page({
    id: 'worklogs', title: 'Daily Work Logs', icon: '✎', roles: ['admin', 'leader'], group: 'Operations', order: 20,
    async render(el) {
      let rows = [];
      await E.listPage(el, {
        title: 'Daily work logs', subtitle: 'What each person did. Rate their work to feed the performance score.', dept: true,
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
            { label: 'Hours', class: 'num', key: 'hours' }, { label: 'Units', class: 'num', key: 'units' },
            { label: 'Rating', render: (l) => (l.rating ? html`<span class="badge ok">${l.rating}/5</span>${l.reviewNote ? html`<div class="muted small">${l.reviewNote}</div>` : ''}` : html`<span class="muted">Not rated</span>`) },
            { label: '', class: 'right', render: (l) => html`<button class="btn sm" data-act="rate" data-id="${l.id}">${l.rating ? 'Re-rate' : 'Rate'}</button>` },
          ], rows, 'No work logged for this period.');
        },
        bind: (box, refresh) => E.actions(box, {
          rate: (id) => {
            const l = rows.find((r) => String(r.id) === id);
            E.modal({
              title: `Rate work - ${l.employeeName}`,
              body: html`<p>${l.summary}</p><div class="form">${E.field({ name: 'rating', label: 'Rating (1 = poor, 5 = excellent)', type: 'select', value: l.rating || 4, options: [1, 2, 3, 4, 5] })}${E.field({ name: 'note', label: 'Feedback (optional)', value: l.reviewNote, full: true })}</div>`,
              onSubmit: async (v, { close }) => { await E.post(`/api/worklogs/${id}/review`, v); E.toast('Review saved'); close(); refresh(); },
            });
          },
        }),
      });
    },
  });
})();
