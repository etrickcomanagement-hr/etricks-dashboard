(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const EVENT_TYPES = ['promotion', 'transfer', 'team_change', 'shift_change', 'warning', 'appreciation', 'note', 'status_change'];

  const detailRows = (e) => [
    ['Employee code', e.empCode], ['Department', e.departmentName], ['Team', e.teamName || '-'], ['Designation', e.designation || '-'],
    ['Role', fmt.label(e.role)], ['Shift', e.shiftName || '-'], ['Joined', fmt.date(e.joinDate)], ['Status', E.badge(e.status)],
    ['Phone', e.phone || '-'], ['Email', e.email || '-'], ['CNIC', e.cnic || '-'], ['Date of birth', fmt.date(e.dateOfBirth)],
    ['Gender', fmt.label(e.gender)], ['Address', e.address || '-'], ['Emergency contact', [e.emergencyName, e.emergencyPhone].filter(Boolean).join(' · ') || '-'],
  ];

  const historyHtml = (history) => html`<div class="hist">${history.length ? history.map((h) => html`<div class="item">
      <b>${fmt.label(h.eventType)}</b> <span class="d">· ${fmt.date(h.eventDate)}${h.recordedBy ? ` · by ${h.recordedBy}` : ''}</span><div>${h.details}</div></div>`) : html`<div class="muted">No history yet.</div>`}</div>`;

  async function profileBody(e) {
    const defs = await E.get('/api/custom-fields?entity=employee');
    return html`<div class="form">${detailRows(e).map(([k, v]) => html`<div><div class="muted small">${k}</div><div>${v}</div></div>`)}
      ${defs.map((d) => html`<div><div class="muted small">${d.label}</div><div>${e.custom[d.key] === true ? 'Yes' : e.custom[d.key] ?? '-'}</div></div>`)}
      <div class="sect">Joining & career history</div><div class="full">${historyHtml(e.history)}</div></div>`;
  }

  async function openForm(existing, onSaved) {
    const admin = E.isAdmin();
    const [depts, allTeams, shifts] = await Promise.all([E.departments(), E.teams(''), E.shifts()]);
    const e = existing || { role: 'member', status: 'active', joinDate: E.today(), departmentId: admin ? '' : E.user.departmentId, custom: {} };
    const extra = await E.customInputs('employee', e.custom);
    const teamOptions = (deptId) => [{ value: '', label: 'No team' }, ...allTeams.filter((t) => String(t.departmentId) === String(deptId)).map((t) => ({ value: t.id, label: t.name }))];

    E.modal({
      title: existing ? `Edit ${existing.name}` : 'Add employee', wide: true, submit: existing ? 'Save changes' : 'Add employee',
      body: html`<div class="form">
        ${E.field({ name: 'name', label: 'Full name', value: e.name, required: true })}
        ${E.field({ name: 'designation', label: 'Designation', value: e.designation, placeholder: 'e.g. Listing Specialist' })}
        ${admin ? E.field({ name: 'departmentId', label: 'Department', type: 'select', value: e.departmentId, required: true, options: [{ value: '', label: 'Select…' }, ...E.idOptions(depts)] }) : ''}
        ${E.field({ name: 'teamId', label: 'Team', type: 'select', value: e.teamId ?? '', options: teamOptions(e.departmentId) })}
        ${E.field({ name: 'role', label: 'Role', type: 'select', value: e.role, options: [{ value: 'member', label: 'Team member' }, { value: 'team_leader', label: 'Team lead' }] })}
        ${E.field({ name: 'shiftId', label: 'Shift', type: 'select', value: e.shiftId ?? '', options: [{ value: '', label: 'No shift' }, ...E.idOptions(shifts)] })}
        ${E.field({ name: 'joinDate', label: 'Joining date', type: 'date', value: e.joinDate, required: true })}
        ${existing ? E.field({ name: 'status', label: 'Status', type: 'select', value: e.status, options: ['active', 'inactive', 'resigned', 'terminated'] }) : ''}
        <div class="sect">Personal details</div>
        ${E.field({ name: 'phone', label: 'Phone', value: e.phone })}${E.field({ name: 'email', label: 'Email', type: 'email', value: e.email })}
        ${E.field({ name: 'cnic', label: 'CNIC / ID number', value: e.cnic })}${E.field({ name: 'dateOfBirth', label: 'Date of birth', type: 'date', value: e.dateOfBirth })}
        ${E.field({ name: 'gender', label: 'Gender', type: 'select', value: e.gender ?? '', options: [{ value: '', label: '-' }, 'male', 'female', 'other'] })}
        ${E.field({ name: 'address', label: 'Address', value: e.address })}
        ${E.field({ name: 'emergencyName', label: 'Emergency contact name', value: e.emergencyName })}${E.field({ name: 'emergencyPhone', label: 'Emergency contact phone', value: e.emergencyPhone })}
        ${extra.html}</div>`,
      onOpen: (form) => {
        const dept = form.elements.departmentId;
        if (dept) dept.addEventListener('change', () => E.mount(form.elements.teamId, html`${teamOptions(dept.value).map((o) => html`<option value="${o.value}">${o.label}</option>`)}`));
      },
      onSubmit: async (v, { close }) => {
        const body = { ...v, teamId: v.teamId || null, shiftId: v.shiftId || null, gender: v.gender || null };
        if (existing) {
          await E.put(`/api/employees/${existing.id}`, { ...body, departmentId: body.departmentId || existing.departmentId });
          E.toast('Employee updated');
        } else {
          const r = await E.post('/api/employees', body);
          E.toast(`${v.name} added (${r.empCode})`);
          close();
          E.bust('emps');
          onSaved();
          E.showPin(v.name, r.pin);
          return;
        }
        close();
        E.bust('emps');
        onSaved();
      },
    });
  }

  async function openProfile(id, onChange) {
    const e = await E.get(`/api/employees/${id}`);
    const { close, form } = E.modal({
      title: e.name, wide: true, cancel: 'Close', body: await profileBody(e),
    });
    const foot = E.$('.foot', form);
    const mk = (label, fn, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `btn ${cls}`; b.textContent = label; b.onclick = fn;
      foot.prepend(b);
    };
    mk('Add history note', () => {
      E.modal({
        title: `History entry - ${e.name}`,
        body: html`<div class="form">${E.field({ name: 'eventType', label: 'Type', type: 'select', value: 'note', options: EVENT_TYPES.map((t) => ({ value: t, label: fmt.label(t) })) })}
          ${E.field({ name: 'eventDate', label: 'Date', type: 'date', value: E.today() })}${E.field({ name: 'details', label: 'Details', type: 'textarea', required: true })}</div>`,
        onSubmit: async (v, { close: c }) => { await E.post(`/api/employees/${id}/history`, v); c(); close(); onChange(); openProfile(id, onChange); },
      });
    });
    mk('Reset PIN', async () => {
      if (!(await E.confirm(`Generate a new PIN for ${e.name}? The old PIN stops working and they are signed out.`))) return;
      const r = await E.post(`/api/employees/${id}/reset-pin`);
      E.showPin(e.name, r.pin);
    });
    mk('Edit', () => { close(); openForm(e, onChange); }, 'primary');
  }

  // ---------------- leader / admin: employee directory ----------------
  E.page({
    id: 'employees', title: 'Employees', icon: '☺', roles: ['admin', 'leader'], group: 'People', order: 10,
    async render(el) {
      const teams = await E.teams(E.isAdmin() ? '' : E.user.departmentId);
      await E.listPage(el, {
        title: 'Employees', subtitle: 'Profiles, joining history and team assignment.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Add employee</button>`,
        filters: [
          { name: 'search', label: 'Search', type: 'text', placeholder: 'Name, code, phone…' },
          { name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...E.idOptions(teams)] },
          { name: 'status', label: 'Status', type: 'select', value: 'active', options: [{ value: '', label: 'Any status' }, 'active', 'inactive', 'resigned', 'terminated'] },
        ],
        csv: (f) => `/api/employees${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => E.table([
          { label: 'Employee', render: (r) => html`<a href="#" data-act="view" data-id="${r.id}"><b>${r.name}</b></a><div class="muted small">${r.empCode}</div>` },
          { label: 'Department', key: 'departmentName' }, { label: 'Team', render: (r) => r.teamName || '-' },
          { label: 'Designation', render: (r) => html`${r.designation || '-'}${r.role === 'team_leader' ? html` <span class="badge ok">Lead</span>` : ''}` },
          { label: 'Joined', render: (r) => fmt.date(r.joinDate) }, { label: 'Status', render: (r) => E.badge(r.status) },
          { label: '', class: 'right', render: (r) => html`<div class="actions"><button class="btn sm" data-act="view" data-id="${r.id}">Profile</button></div>` },
        ], await E.get(`/api/employees${E.qs(f)}`), 'No employees match these filters.'),
        bind: (box, refresh) => E.actions(box, { view: (id) => openProfile(id, refresh) }),
      }).then(({ refresh }) => E.actions(el, { add: () => openForm(null, refresh) }));
    },
  });

  // ---------------- member: own profile ----------------
  E.page({
    id: 'my-profile', title: 'My Profile', icon: '☺', roles: ['member'], order: 40,
    async render(el) {
      const e = await E.get('/api/employees/me');
      E.mount(el, html`${E.pageHead(e.name, `${e.designation || 'Team member'} · ${e.departmentName}`)}<div class="card">${await profileBody(e)}</div>`);
    },
  });
})();
