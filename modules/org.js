(() => {
  const E = window.Etricks;
  const { html } = E;

  // ---------------- departments (admin) ----------------
  function deptForm(d, onSaved) {
    const e = d || { color: '#a8ff5a', active: 1 };
    E.modal({
      title: d ? `Edit ${d.name}` : 'Add department', submit: d ? 'Save' : 'Create department',
      body: html`<div class="form">${E.field({ name: 'name', label: 'Name', value: e.name, required: true })}${E.field({ name: 'color', label: 'Colour', type: 'color', value: e.color })}
        ${E.field({ name: 'leaderName', label: 'Team leader name', value: e.leaderName, placeholder: 'Who leads this department?', full: true })}
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

  // Shared by admin (leader and/or member password) and leader (member password only).
  // only: 'leader' | 'member' | undefined (admin: both fields)
  function passwordForm(deptId, name, admin, only) {
    const kind = only || (admin ? 'both' : 'member');
    const single = kind !== 'both';
    const title = { leader: `Team leader password - ${name}`, member: `Team member password - ${name}`, both: `Portal passwords - ${name}` }[kind];
    const what = {
      leader: 'This is the password the team leader types to open the Team Leader portal of this department.',
      member: 'This is the department password members type (before their own PIN) to open the Team Member portal.',
      both: 'Leave a field empty to keep its current password.',
    }[kind];
    E.modal({
      title, submit: 'Save password',
      body: html`<p class="muted">${what} Tell the new password to the people who need it. Nobody is signed out automatically.</p>
        <div class="form">${kind !== 'member' ? E.field({ name: 'leaderPassword', label: 'New team leader password', type: 'password', full: true, required: single, help: 'At least 8 characters', attrs: 'autocomplete="new-password"' }) : ''}
        ${kind !== 'leader' ? E.field({ name: 'memberPassword', label: 'New team member password', type: 'password', full: true, required: single, help: 'At least 8 characters', attrs: 'autocomplete="new-password"' }) : ''}</div>`,
      onSubmit: async (v, { close }) => {
        const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
        await E.put(`/api/departments/${deptId}/passwords`, body);
        E.toast('Password saved'); close();
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
        E.mount(el, html`${E.pageHead('Departments', 'Each department has a Team Leader portal and a Team Member portal, each with its own password. You set and change the team leader password here.', html`<button class="btn primary" data-act="add">+ Add department</button>`)}
          <div class="grid cols-2">${rows.map((d) => html`<div class="card" style="border-top:3px solid ${d.color}">
            <h3><span><b style="color:${d.color}">●</b> ${d.name}</span>${E.badge(d.active ? 'active' : 'inactive')}</h3>
            <div>Team leader: ${d.leaderName ? html`<b>${d.leaderName}</b>` : html`<span class="muted">name not added yet (use Edit)</span>`}</div>
            <div class="muted small" style="margin-top:2px">${d.employeeCount} active staff · ${d.teamCount} teams${d.description ? ` · ${d.description}` : ''}</div>
            <div class="row" style="margin-top:14px">
              <button class="btn primary sm" data-act="pw-leader" data-id="${d.id}">🔑 Team leader password</button>
              <button class="btn sm" data-act="pw-member" data-id="${d.id}">🔑 Member password</button>
              <button class="btn sm" data-act="edit" data-id="${d.id}">Edit name / leader</button>
            </div></div>`)}</div>`);
        const find = (id) => rows.find((d) => String(d.id) === id);
        E.actions(el, {
          add: () => deptForm(null, load),
          edit: (id) => deptForm(find(id), load),
          'pw-leader': (id) => passwordForm(id, find(id).name, true, 'leader'),
          'pw-member': (id) => passwordForm(id, find(id).name, true, 'member'),
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
