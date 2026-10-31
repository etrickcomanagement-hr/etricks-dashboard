(() => {
  const E = window.Etricks;
  const { html } = E;

  // A small "type a new password" window used for heads, team leaders and teams.
  function passwordModal({ title, note, label = 'New password', onSave }) {
    E.modal({
      title, submit: 'Save password',
      body: html`<p class="muted">${note}</p><div class="form">${E.field({ name: 'password', label, type: 'password', full: true, required: true, help: 'At least 8 characters', attrs: 'autocomplete="new-password"' })}</div>`,
      onSubmit: async (v, { close }) => { await onSave(v.password); E.toast('Password saved'); close(); },
    });
  }

  // ---------------- departments (admin) ----------------
  function deptForm(d, onSaved) {
    const e = d || { color: '#a8ff5a', active: 1 };
    E.modal({
      title: d ? `Edit ${d.name}` : 'Add department', submit: d ? 'Save' : 'Create department',
      body: html`<div class="form">${E.field({ name: 'name', label: 'Name', value: e.name, required: true })}${E.field({ name: 'color', label: 'Colour', type: 'color', value: e.color })}
        ${E.field({ name: 'description', label: 'Description', value: e.description, full: true })}
        ${d ? E.field({ name: 'active', label: 'Department is active', type: 'checkbox', value: e.active }) : ''}</div>
        ${d ? '' : html`<p class="muted small">After creating the department, add its head of department and password from the Departments page.</p>`}`,
      onSubmit: async (v, { close }) => {
        if (d) await E.put(`/api/departments/${d.id}`, v); else await E.post('/api/departments', v);
        E.bust('departments'); E.toast('Saved'); close(); onSaved();
      },
    });
  }

  // The admin names the head of a department and sets (or changes) the head's password.
  async function headForm(d, onSaved) {
    let head = null;
    if (d.headId) head = await E.get(`/api/employees/${d.headId}`);
    E.modal({
      title: head ? `Head of ${d.name}` : `Add head of ${d.name}`, submit: head ? 'Save' : 'Create head',
      body: html`<div class="form">${E.field({ name: 'name', label: 'Name', value: head?.name, required: true, full: true })}
        ${E.field({ name: 'phone', label: 'Phone', value: head?.phone })}${E.field({ name: 'email', label: 'Email', type: 'email', value: head?.email })}
        ${E.field({ name: 'password', label: head ? 'New password (leave empty to keep)' : 'Portal password', type: 'password', required: !head, full: true, help: 'At least 8 characters. The head signs in to the Head of Department portal with only this password.', attrs: 'autocomplete="new-password"' })}</div>
        <p class="muted small">The head can add teams, appoint the 3 team leaders and set their passwords. Changing the password signs the head out.</p>`,
      onSubmit: async (v, { close }) => {
        await E.put(`/api/departments/${d.id}/head`, { ...v, password: v.password || undefined });
        E.bust('departments'); E.bust('emps'); E.toast('Saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'departments', title: 'Departments', icon: '▣', roles: ['admin'], group: 'Administration', order: 10,
    async render(el) {
      const load = async () => {
        E.bust('departments');
        const rows = await E.departments();
        E.mount(el, html`${E.pageHead('Departments', 'Each department has one head. The head appoints three team leaders, each with their own team. You set the head\'s name and password here.', html`<button class="btn primary" data-act="add">+ Add department</button>`)}
          <div class="grid cols-2">${rows.map((d) => html`<div class="card" style="border-top:3px solid ${d.color}">
            <h3><span><b style="color:${d.color}">●</b> ${d.name}</span>${E.badge(d.active ? 'active' : 'inactive')}</h3>
            <div>Head of department: ${d.headName ? html`<b>${d.headName}</b>` : html`<span class="muted">not added yet</span>`}</div>
            <div class="muted small" style="margin-top:2px">${d.employeeCount} active staff · ${d.teamCount} team${d.teamCount === 1 ? '' : 's'}${d.description ? ` · ${d.description}` : ''}</div>
            <div class="row" style="margin-top:14px">
              <button class="btn primary sm" data-act="head" data-id="${d.id}">🔑 ${d.headName ? 'Head & password' : 'Add head of department'}</button>
              <button class="btn sm" data-act="edit" data-id="${d.id}">Edit department</button>
            </div></div>`)}</div>`);
        const find = (id) => rows.find((d) => String(d.id) === id);
        E.actions(el, { add: () => deptForm(null, load), edit: (id) => deptForm(find(id), load), head: (id) => headForm(find(id), load) });
      };
      await load();
    },
  });

  // ---------------- teams ----------------
  async function teamForm(t, onSaved) {
    const depts = E.isAdmin() && !t ? await E.departments() : [];
    E.modal({
      title: t ? `Rename ${t.name}` : 'Add team',
      body: html`<div class="form">${E.isAdmin() && !t ? E.field({ name: 'departmentId', label: 'Department', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select…' }, ...E.idOptions(depts)] }) : ''}
        ${E.field({ name: 'name', label: 'Team name', value: t?.name, required: true, full: true })}</div>
        ${t ? '' : html`<p class="muted small">After adding the team, appoint its team leader and set the team's member password.</p>`}`,
      onSubmit: async (v, { close }) => {
        if (t) await E.put(`/api/teams/${t.id}`, v); else await E.post('/api/teams', v);
        E.bust('teams'); E.toast('Team saved'); close(); onSaved();
      },
    });
  }

  // Appoint a team leader: a new person, or somebody who already works in the department.
  async function leaderForm(t, onSaved) {
    const people = (await E.employees(t.departmentId)).filter((e) => e.role === 'member' || (e.role === 'team_leader' && (!e.leadsTeam || e.leadsTeam === t.name)));
    E.modal({
      title: `Team leader of ${t.name}`, wide: true, submit: 'Appoint',
      body: html`<div class="form">
        ${E.field({ name: 'mode', label: 'Who leads this team?', type: 'select', full: true, value: 'new', options: [{ value: 'new', label: 'A new person' }, { value: 'existing', label: 'Somebody who already works in this department' }] })}
        <div class="full sw-new"><div class="form">${E.field({ name: 'name', label: 'Name', required: true })}${E.field({ name: 'phone', label: 'Phone' })}</div></div>
        <div class="full sw-existing" hidden><div class="form">${E.field({ name: 'employeeId', label: 'Person', type: 'select', full: true, options: [{ value: '', label: 'Select…' }, ...people.map((e) => ({ value: e.id, label: `${e.name} (${e.empCode})${e.teamName ? ` - ${e.teamName}` : ''}` }))] })}</div></div>
        ${E.field({ name: 'password', label: 'Team leader password', type: 'password', required: true, full: true, help: 'At least 8 characters. The leader signs in to the Team Leader portal with only this password.', attrs: 'autocomplete="new-password"' })}</div>
        <p class="muted small">${t.leaderName ? `${t.leaderName} stops being the leader of this team (they stay an employee and can be moved to a team from Employees > Transfer).` : 'The leader can then add members to this team and sees only this team.'}</p>`,
      onOpen: (form) => {
        const sync = () => {
          const fresh = form.elements.mode.value === 'new';
          E.$('.sw-new', form).hidden = !fresh;
          E.$('.sw-existing', form).hidden = fresh;
          form.elements.name.required = fresh;
          form.elements.employeeId.required = !fresh;
        };
        form.elements.mode.addEventListener('change', sync);
        sync();
      },
      onSubmit: async (v, { close }) => {
        const body = v.mode === 'new' ? { name: v.name, phone: v.phone, password: v.password } : { employeeId: Number(v.employeeId), password: v.password };
        await E.post(`/api/teams/${t.id}/leader`, body);
        E.bust('teams'); E.bust('emps'); E.toast('Team leader appointed'); close(); onSaved();
      },
    });
  }

  function leaderPanel(t, onSaved) {
    if (!t.leaderEmployeeId) return leaderForm(t, onSaved);
    const { close, form } = E.modal({
      title: `Team leader of ${t.name}`, cancel: 'Close',
      body: html`<p><b>${t.leaderName}</b> leads this team.</p>
        <div class="row"><button type="button" class="btn primary" data-act="pw">🔑 Change leader password</button><button type="button" class="btn" data-act="replace">Appoint someone else</button><button type="button" class="btn danger" data-act="remove">Remove leader</button></div>
        <p class="muted small" style="margin-top:12px">A changed password signs the leader out. A removed leader stays an employee without a team.</p>`,
    });
    E.actions(form, {
      pw: () => passwordModal({ title: `Password of ${t.leaderName}`, note: 'The leader uses this password in the Team Leader portal. Tell it to them.', onSave: (password) => E.put(`/api/employees/${t.leaderEmployeeId}/password`, { password }) }),
      replace: () => { close(); leaderForm(t, onSaved); },
      remove: async () => {
        if (!(await E.confirm(`Remove ${t.leaderName} as leader of ${t.name}? They stay an employee with no team.`, { yes: 'Remove', danger: true }))) return;
        await E.del(`/api/teams/${t.id}/leader`);
        E.bust('teams'); E.bust('emps'); E.toast('Leader removed'); close(); onSaved();
      },
    });
  }

  function teamPasswordForm(t) {
    passwordModal({
      title: `Member password - ${t.name}`, label: 'New team password',
      note: 'Every member of this team types this password (and then their own PIN) in the Team Member portal. Tell it to the members of this team only.',
      onSave: (password) => E.put(`/api/teams/${t.id}/member-password`, { password }),
    });
  }

  E.page({
    id: 'teams', title: 'Teams', icon: '⚑', roles: E.MANAGE, group: 'People', order: 5,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: E.isLeader() ? 'My team' : 'Teams',
        subtitle: E.isLeader() ? 'Your team and its member password.' : 'Every department has teams; each team has one leader and its own members.', dept: true,
        actions: E.seesAllTeams() ? html`<button class="btn primary" data-act="add">+ Add team</button>` : '',
        load: async (f) => {
          rows = await E.get(`/api/teams${E.qs(f)}`);
          if (!rows.length) return html`<div class="card empty">${E.isLeader() ? 'You do not lead a team yet. Ask your head of department.' : 'No teams yet. Add the first one.'}</div>`;
          return html`<div class="grid cols-2">${rows.map((t) => html`<div class="card">
            <h3><span>${t.name}</span><span class="badge">${t.memberCount} member${t.memberCount === 1 ? '' : 's'}</span></h3>
            <div>Team leader: ${t.leaderName ? html`<b>${t.leaderName}</b>` : html`<span class="muted">not appointed yet</span>`}</div>
            <div class="muted small" style="margin-top:2px">${E.isAdmin() ? `${t.departmentName} · ` : ''}Member password: ${t.hasMemberPassword ? 'set' : 'not set yet'}</div>
            <div class="row" style="margin-top:14px">
              ${E.seesAllTeams() ? html`<button class="btn primary sm" data-act="leader" data-id="${t.id}">👤 ${t.leaderName ? 'Team leader' : 'Appoint leader'}</button>` : ''}
              <button class="btn sm ${E.isLeader() ? 'primary' : ''}" data-act="pw" data-id="${t.id}">🔑 Member password</button>
              ${E.seesAllTeams() ? html`<button class="btn sm" data-act="edit" data-id="${t.id}">Rename</button><button class="btn sm danger" data-act="del" data-id="${t.id}">Delete</button>` : ''}
            </div></div>`)}</div>`;
        },
        bind: (box, refresh) => {
          const find = (id) => rows.find((t) => String(t.id) === id);
          E.actions(box, {
            leader: (id) => leaderPanel(find(id), refresh),
            pw: (id) => teamPasswordForm(find(id)),
            edit: (id) => teamForm(find(id), refresh),
            del: async (id) => { if (await E.confirm('Delete this team? It must have no members (move them with Transfer first).', { yes: 'Delete', danger: true })) { await E.del(`/api/teams/${id}`); E.bust('teams'); E.toast('Team deleted'); refresh(); } },
          });
        },
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
