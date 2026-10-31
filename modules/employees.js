(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const EVENT_TYPES = ['promotion', 'transfer', 'team_change', 'shift_change', 'warning', 'appreciation', 'note', 'status_change'];
  const ROLE_KIND = { hod: 'info', team_leader: 'ok', member: '' };
  const roleBadge = (r) => html`<span class="badge ${ROLE_KIND[r] ?? ''}">${E.roleLabel[r] || fmt.label(r)}</span>`;

  // Who may change whom (the server checks this again).
  const canEdit = (e) => {
    const me = E.user;
    if (e.id === me.employeeId) return false;
    if (me.role === 'admin') return true;
    if (me.role === 'hod') return e.role !== 'hod';
    return me.role === 'leader' && e.role === 'member';
  };
  const canSetPassword = (e) => (e.role === 'team_leader' && (E.isAdmin() || E.isHead())) || (e.role === 'hod' && E.isAdmin());

  const detailRows = (e) => [
    ['Employee code', e.empCode], ['Department', e.departmentName], ['Team', e.leadsTeam ? `${e.leadsTeam} (leader)` : e.teamName || '-'], ['Designation', e.designation || '-'],
    ['Role', E.roleLabel[e.role] || fmt.label(e.role)], ['Shift', e.shiftName || '-'], ['Joined', fmt.date(e.joinDate)], ['Status', E.badge(e.status)],
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

  // New member (leaders, heads and the admin) or edit of personal details. Team, department and role change through Transfer / Teams.
  async function openForm(existing, onSaved) {
    const [teams, shifts] = await Promise.all([existing || E.isLeader() ? [] : E.teams(''), E.shifts()]);
    const e = existing || { status: 'active', joinDate: E.today(), custom: {} };
    const extra = await E.customInputs('employee', e.custom);
    const teamLabel = (t) => (E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name);

    E.modal({
      title: existing ? `Edit ${existing.name}` : 'Add team member', wide: true, submit: existing ? 'Save changes' : 'Add member',
      body: html`<div class="form">
        ${E.field({ name: 'name', label: 'Full name', value: e.name, required: true })}
        ${E.field({ name: 'designation', label: 'Designation', value: e.designation, placeholder: 'e.g. Listing Specialist' })}
        ${existing || E.isLeader() ? '' : E.field({ name: 'teamId', label: 'Team', type: 'select', required: true, options: [{ value: '', label: 'Select the team…' }, ...teams.map((t) => ({ value: t.id, label: teamLabel(t) }))] })}
        ${E.field({ name: 'shiftId', label: 'Shift', type: 'select', value: e.shiftId ?? '', options: [{ value: '', label: 'No shift' }, ...E.idOptions(shifts)] })}
        ${E.field({ name: 'joinDate', label: 'Joining date', type: 'date', value: e.joinDate, required: true })}
        ${existing ? '' : E.field({ name: 'pin', label: 'Member PIN (6 digits)', value: '', placeholder: 'Leave empty to generate one', attrs: 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off"', help: 'The member signs in with their team password and this PIN. You can reset it later.' })}
        ${existing ? E.field({ name: 'status', label: 'Status', type: 'select', value: e.status, options: ['active', 'inactive', 'resigned', 'terminated'] }) : ''}
        ${!existing && E.isLeader() ? html`<div class="full muted small">The new member joins <b>${E.user.teamName || 'your team'}</b>.</div>` : ''}
        <div class="sect">Personal details</div>
        ${E.field({ name: 'phone', label: 'Phone', value: e.phone })}${E.field({ name: 'email', label: 'Email', type: 'email', value: e.email })}
        ${E.field({ name: 'cnic', label: 'CNIC / ID number', value: e.cnic })}${E.field({ name: 'dateOfBirth', label: 'Date of birth', type: 'date', value: e.dateOfBirth })}
        ${E.field({ name: 'gender', label: 'Gender', type: 'select', value: e.gender ?? '', options: [{ value: '', label: '-' }, 'male', 'female', 'other'] })}
        ${E.field({ name: 'address', label: 'Address', value: e.address })}
        ${E.field({ name: 'emergencyName', label: 'Emergency contact name', value: e.emergencyName })}${E.field({ name: 'emergencyPhone', label: 'Emergency contact phone', value: e.emergencyPhone })}
        ${extra.html}</div>`,
      onSubmit: async (v, { close }) => {
        const body = { ...v, teamId: v.teamId || undefined, shiftId: v.shiftId || null, gender: v.gender || null, pin: v.pin || undefined };
        if (existing) {
          await E.put(`/api/employees/${existing.id}`, body);
          E.toast('Saved');
        } else {
          const r = await E.post('/api/employees', body);
          E.toast(`${v.name} added (${r.empCode})`);
          close();
          E.bust('emps'); E.bust('teams');
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
    const editable = canEdit(e);
    if (editable) {
      mk('Add history note', () => {
        E.modal({
          title: `History entry - ${e.name}`,
          body: html`<div class="form">${E.field({ name: 'eventType', label: 'Type', type: 'select', value: 'note', options: EVENT_TYPES.map((t) => ({ value: t, label: fmt.label(t) })) })}
            ${E.field({ name: 'eventDate', label: 'Date', type: 'date', value: E.today() })}${E.field({ name: 'details', label: 'Details', type: 'textarea', required: true })}</div>`,
          onSubmit: async (v, { close: c }) => { await E.post(`/api/employees/${id}/history`, v); c(); close(); onChange(); openProfile(id, onChange); },
        });
      });
    }
    if (editable && e.role === 'member') {
      mk('Reset PIN', () => {
        E.modal({
          title: `New PIN for ${e.name}`, submit: 'Set PIN',
          body: html`<p class="muted">The old PIN stops working and ${e.name} is signed out.</p><div class="form">${E.field({ name: 'pin', label: 'New PIN (6 digits)', value: '', placeholder: 'Leave empty to generate one', full: true, attrs: 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off"' })}</div>`,
          onSubmit: async (v, { close: c }) => { const r = await E.post(`/api/employees/${id}/reset-pin`, v.pin ? { pin: v.pin } : {}); c(); E.showPin(e.name, r.pin); },
        });
      });
      mk(E.isLeader() ? 'Ask for transfer' : 'Transfer', () => { close(); E.transferForm(e, onChange); });
    }
    if (canSetPassword(e)) {
      mk('🔑 Set password', () => {
        E.modal({
          title: `Password of ${e.name}`, submit: 'Save password',
          body: html`<p class="muted">${e.role === 'hod' ? 'The head signs in to the Head of Department portal' : 'The team leader signs in to the Team Leader portal'} with only this password. The old password stops working and ${e.name} is signed out.</p>
            <div class="form">${E.field({ name: 'password', label: 'New password', type: 'password', full: true, required: true, help: 'At least 8 characters', attrs: 'autocomplete="new-password"' })}</div>`,
          onSubmit: async (v, { close: c }) => { await E.put(`/api/employees/${id}/password`, v); E.toast('Password saved'); c(); },
        });
      });
    }
    if (editable) mk('Edit', () => { close(); openForm(e, onChange); }, 'primary');
  }

  // ---------------- directory (admin, head of department, team leader) ----------------
  E.page({
    id: 'employees', title: 'Employees', icon: '☺', roles: E.MANAGE, group: 'People', order: 10,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      const filters = [{ name: 'search', label: 'Search', type: 'text', placeholder: 'Name, code, phone…' }];
      if (!E.isLeader()) filters.push({ name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name }))] });
      if (!E.isLeader()) filters.push({ name: 'role', label: 'Who', type: 'select', options: [{ value: '', label: 'Everybody' }, { value: 'member', label: 'Team members' }, { value: 'team_leader', label: 'Team leaders' }, ...(E.isAdmin() ? [{ value: 'hod', label: 'Heads of department' }] : [])] });
      filters.push({ name: 'status', label: 'Status', type: 'select', value: 'active', options: [{ value: '', label: 'Any status' }, 'active', 'inactive', 'resigned', 'terminated'] });
      if (!E.isLeader()) filters.push({ name: 'unassigned', label: 'Placement', type: 'select', options: [{ value: '', label: 'All' }, { value: '1', label: 'Without a team' }] });
      await E.listPage(el, {
        title: E.isLeader() ? 'My team members' : 'Employees', subtitle: E.isLeader() ? 'The members of your team, their profiles and PINs.' : 'Profiles, joining history and team assignment.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Add member</button>`,
        filters,
        csv: (f) => `/api/employees${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => E.table([
          { label: 'Employee', render: (r) => html`<a href="#" data-act="view" data-id="${r.id}"><b>${r.name}</b></a><div class="muted small">${r.empCode}${E.isAdmin() ? ` · ${r.departmentName}` : ''}</div>` },
          { label: 'Role', render: (r) => roleBadge(r.role) },
          { label: 'Team', render: (r) => r.leadsTeam ? html`Leads <b>${r.leadsTeam}</b>` : r.teamName || (r.role === 'hod' ? html`<span class="muted">All teams</span>` : html`<span class="badge warn">No team</span>`) },
          { label: 'Designation', render: (r) => r.designation || '-' },
          { label: 'Joined', render: (r) => fmt.date(r.joinDate) }, { label: 'Status', render: (r) => E.badge(r.status) },
          { label: '', class: 'right', render: (r) => html`<div class="actions"><button class="btn sm" data-act="view" data-id="${r.id}">Profile</button></div>` },
        ], await E.get(`/api/employees${E.qs(f)}`), 'No employees match these filters.'),
        bind: (box, refresh) => E.actions(box, { view: (id) => openProfile(id, refresh) }),
      }).then(({ refresh }) => E.actions(el, { add: () => openForm(null, refresh) }));
    },
  });

  // ---------------- my own profile (members, team leaders and heads) ----------------
  E.page({
    id: 'my-profile', title: 'My Profile', icon: '☺', roles: E.SELF, group: E.myGroup, order: 40,
    async render(el) {
      const e = await E.get('/api/employees/me');
      E.mount(el, html`${E.pageHead(e.name, `${e.designation || E.roleLabel[e.role]} · ${e.departmentName}${e.leadsTeam ? ` · leads ${e.leadsTeam}` : e.teamName ? ` · ${e.teamName}` : ''}`)}<div class="card">${await profileBody(e)}</div>`);
    },
  });
})();
