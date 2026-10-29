(() => {
  const E = window.Etricks;
  const { html } = E;

  // ---------------- departments (admin) ----------------
  function deptForm(d, onSaved) {
    const e = d || { color: '#a8ff5a', active: 1 };
    E.modal({
      title: d ? `Edit ${d.name}` : 'Add department', submit: d ? 'Save' : 'Create department',
      body: html`<div class="form">${E.field({ name: 'name', label: 'Name', value: e.name, required: true })}${E.field({ name: 'color', label: 'Colour', type: 'color', value: e.color })}
        ${E.field({ name: 'description', label: 'Description', value: e.description, full: true })}
        ${d ? E.field({ name: 'active', label: 'Department is active', type: 'checkbox', value: e.active }) : html`
          ${E.field({ name: 'leaderPassword', label: 'Team Leader portal password', type: 'password', required: true, help: 'At least 8 characters' })}
          ${E.field({ name: 'memberPassword', label: 'Team Member portal password', type: 'password', required: true, help: 'At least 8 characters' })}`}</div>`,
      onSubmit: async (v, { close }) => {
        if (d) await E.put(`/api/departments/${d.id}`, v); else await E.post('/api/departments', v);
        E.bust('departments'); E.toast('Saved'); close(); onSaved();
      },
    });
  }

  // Shared by admin (both passwords) and leader (member password only).
  function passwordForm(deptId, name, admin) {
    E.modal({
      title: `Portal passwords - ${name}`, submit: 'Update passwords',
      body: html`<p class="muted">Leave a field empty to keep the current password. Staff must be told the new password; nobody is signed out automatically.</p>
        <div class="form">${admin ? E.field({ name: 'leaderPassword', label: 'New Team Leader portal password', type: 'password', full: true, attrs: 'autocomplete="new-password"' }) : ''}
        ${E.field({ name: 'memberPassword', label: 'New Team Member portal password', type: 'password', full: true, attrs: 'autocomplete="new-password"' })}</div>`,
      onSubmit: async (v, { close }) => {
        const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
        await E.put(`/api/departments/${deptId}/passwords`, body);
        E.toast('Password updated'); close();
      },
    });
  }
  E.passwordForm = passwordForm;

  E.page({
    id: 'departments', title: 'Departments', icon: '▣', roles: ['admin'], group: 'Administration', order: 10,
    async render(el) {
      const load = async () => {
        E.bust('departments');
        const rows = await E.departments();
        E.mount(el, html`${E.pageHead('Departments', 'Each department has its own Team Leader and Team Member portal, each with its own password.', html`<button class="btn primary" data-act="add">+ Add department</button>`)}
          ${E.table([
            { label: 'Department', render: (d) => html`<b style="color:${d.color}">●</b> <b>${d.name}</b>${d.description ? html`<div class="muted small">${d.description}</div>` : ''}` },
            { label: 'Active staff', class: 'num', key: 'employeeCount' }, { label: 'Teams', class: 'num', key: 'teamCount' },
            { label: 'Status', render: (d) => E.badge(d.active ? 'active' : 'inactive') },
            { label: '', class: 'right', render: (d) => html`<div class="actions"><button class="btn sm" data-act="pw" data-id="${d.id}">Passwords</button><button class="btn sm" data-act="edit" data-id="${d.id}">Edit</button></div>` },
          ], rows)}`);
        E.actions(el, {
          add: () => deptForm(null, load),
          edit: (id) => deptForm(rows.find((d) => String(d.id) === id), load),
          pw: (id) => passwordForm(id, rows.find((d) => String(d.id) === id).name, true),
        });
      };
      await load();
    },
  });

  // ---------------- teams ----------------
  async function teamForm(t, onSaved) {
    const admin = E.isAdmin();
    const depts = admin ? await E.departments() : [];
    const deptId = t ? t.departmentId : admin ? '' : E.user.departmentId;
    const emps = deptId ? await E.employees(deptId) : [];
    const leaderOptions = (list) => [{ value: '', label: 'No leader yet' }, ...E.idOptions(list)];
    E.modal({
      title: t ? `Edit ${t.name}` : 'Add team',
      body: html`<div class="form">${admin && !t ? E.field({ name: 'departmentId', label: 'Department', type: 'select', required: true, options: [{ value: '', label: 'Select…' }, ...E.idOptions(depts)] }) : ''}
        ${E.field({ name: 'name', label: 'Team name', value: t?.name, required: true })}
        ${E.field({ name: 'leaderEmployeeId', label: 'Team leader', type: 'select', value: t?.leaderEmployeeId ?? '', options: leaderOptions(emps), help: 'Pick from the department\'s employees' })}</div>`,
      onOpen: (form) => {
        const sel = form.elements.departmentId;
        if (sel) sel.addEventListener('change', async () => {
          const list = sel.value ? await E.employees(sel.value) : [];
          E.mount(form.elements.leaderEmployeeId, html`${leaderOptions(list).map((o) => html`<option value="${o.value}">${o.label}</option>`)}`);
        });
      },
      onSubmit: async (v, { close }) => {
        const body = { ...v, leaderEmployeeId: v.leaderEmployeeId || null };
        if (t) await E.put(`/api/teams/${t.id}`, body); else await E.post('/api/teams', body);
        E.bust('teams'); E.toast('Team saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'teams', title: 'Teams', icon: '⚑', roles: ['admin', 'leader'], group: 'People', order: 5,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Teams', subtitle: 'Teams inside each department, with their leaders.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Add team</button>`,
        load: async (f) => {
          rows = await E.get(`/api/teams${E.qs(f)}`);
          return E.table([
            { label: 'Team', render: (t) => html`<b>${t.name}</b>` }, ...(E.isAdmin() ? [{ label: 'Department', key: 'departmentName' }] : []),
            { label: 'Team leader', render: (t) => t.leaderName || html`<span class="muted">Not assigned</span>` }, { label: 'Members', class: 'num', key: 'memberCount' },
            { label: '', class: 'right', render: (t) => html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${t.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${t.id}">Delete</button></div>` },
          ], rows, 'No teams yet. Add the first one.');
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => teamForm(rows.find((t) => String(t.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this team? It must have no members.', { yes: 'Delete', danger: true })) { await E.del(`/api/teams/${id}`); E.bust('teams'); E.toast('Team deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => teamForm(null, ctrl.refresh) });
    },
  });

  // ---------------- shifts (admin) ----------------
  function shiftForm(s, onSaved) {
    const e = s || { startTime: '09:00', endTime: '18:00', breakMinutes: 60, graceMinutes: 10 };
    E.modal({
      title: s ? `Edit ${s.name}` : 'Add shift',
      body: html`<div class="form">${E.field({ name: 'name', label: 'Shift name', value: e.name, required: true, full: true })}
        ${E.field({ name: 'startTime', label: 'Starts', type: 'time', value: e.startTime, required: true })}${E.field({ name: 'endTime', label: 'Ends', type: 'time', value: e.endTime, required: true })}
        ${E.field({ name: 'breakMinutes', label: 'Allowed break (minutes)', type: 'number', value: e.breakMinutes })}${E.field({ name: 'graceMinutes', label: 'Late grace (minutes)', type: 'number', value: e.graceMinutes })}</div>`,
      onSubmit: async (v, { close }) => {
        if (s) await E.put(`/api/shifts/${s.id}`, v); else await E.post('/api/shifts', v);
        E.bust('shifts'); E.toast('Shift saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'shifts', title: 'Shifts', icon: '◐', roles: ['admin'], group: 'Administration', order: 20,
    async render(el) {
      const load = async () => {
        E.bust('shifts');
        const rows = await E.shifts();
        E.mount(el, html`${E.pageHead('Shifts', 'Check-in after start time + grace is marked late. Breaks over the allowed time are flagged.', html`<button class="btn primary" data-act="add">+ Add shift</button>`)}
          ${E.table([{ label: 'Shift', key: 'name' }, { label: 'Hours', render: (s) => `${s.startTime} – ${s.endTime}` }, { label: 'Break', render: (s) => `${s.breakMinutes} min` },
            { label: 'Grace', render: (s) => `${s.graceMinutes} min` }, { label: '', class: 'right', render: (s) => html`<button class="btn sm" data-act="edit" data-id="${s.id}">Edit</button>` }], rows)}`);
        E.actions(el, { add: () => shiftForm(null, load), edit: (id) => shiftForm(rows.find((s) => String(s.id) === id), load) });
      };
      await load();
    },
  });
})();
