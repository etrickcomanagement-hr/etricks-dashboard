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
        ${existing ? html`<div class="full infobar"><span><b>${existing.empCode}</b></span><span>${E.roleLabel[existing.role]}</span><span>${existing.leadsTeam ? `Leads ${existing.leadsTeam}` : existing.teamName || 'No team'} · ${existing.departmentName}</span><span class="muted">To change the team use Transfer; to change the role use Teams.</span></div>` : ''}
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

  const who = (e) => (e.role === 'member' ? 'team member' : e.role === 'team_leader' ? 'team leader' : 'head of department');

  // Deactivate keeps the person and every record; they just cannot sign in any more.
  function deactivateForm(e, onDone) {
    E.modal({
      title: `Deactivate ${e.name}`, submit: 'Deactivate',
      body: html`<p>${e.name} is signed out at once and cannot sign in again. Their records, attendance and history stay.${e.role === 'team_leader' ? ' They are also taken off their team as leader.' : ''} You can reactivate them later.</p>
        <div class="form">${E.field({ name: 'status', label: 'Reason for leaving', type: 'select', value: 'inactive', options: [{ value: 'inactive', label: 'Inactive (on a break, for now)' }, { value: 'resigned', label: 'Resigned' }, { value: 'terminated', label: 'Terminated' }], full: true })}
        ${E.field({ name: 'note', label: 'Note (optional)', full: true })}</div>`,
      onSubmit: async (v, { close }) => { await E.post(`/api/employees/${e.id}/status`, { status: v.status, note: v.note || undefined }); E.bust('emps'); E.toast(`${e.name} deactivated`); close(); onDone(); },
    });
  }

  async function reactivate(e, onDone) {
    if (!(await E.confirm(`Reactivate ${e.name}? They can sign in again.${e.role === 'member' && !e.teamId ? ' They have no team yet: use Transfer to place them in one.' : ''}`, { yes: 'Reactivate' }))) return;
    await E.post(`/api/employees/${e.id}/status`, { status: 'active' });
    E.bust('emps'); E.toast(`${e.name} is active again`); onDone();
  }

  // Permanent delete: the name must be typed so it cannot happen by accident.
  function deleteForm(e, onDone) {
    const { form } = E.modal({
      title: `Delete ${e.name}`, submit: 'Delete permanently',
      body: html`<p><b>This cannot be undone.</b> ${e.name} (${e.empCode}) and everything that belongs to them is removed for good: attendance, leave, tasks, daily reports, complaints, work logs and joining history.</p>
        <p class="muted small">If you only want them to stop working here, use <b>Deactivate</b> instead: nothing is lost. Someone who was ever paid a salary can only be deactivated, never deleted.</p>
        <div class="form">${E.field({ name: 'confirm', label: `Type their name (${e.name}) to confirm`, required: true, full: true, attrs: 'autocomplete="off"' })}</div>`,
      onSubmit: async (v, { close }) => {
        if (v.confirm.trim().toLowerCase() !== e.name.trim().toLowerCase()) throw new Error('The name you typed does not match');
        await E.del(`/api/employees/${e.id}`);
        E.bust('emps'); E.bust('teams'); E.toast(`${e.name} was deleted`); close(); onDone();
      },
    });
    E.$('.btn.primary', form).classList.add('danger');
  }
  E.deleteEmployee = deleteForm;

  async function openProfile(id, onChange) {
    const e = await E.get(`/api/employees/${id}`);
    const { close, form } = E.modal({
      title: e.name, wide: true, cancel: 'Close', body: await profileBody(e),
    });
    // Everything you can do with this person, in one bar at the top.
    const bar = document.createElement('div');
    bar.className = 'actionbar';
    E.$('.mbody', form).prepend(bar);
    const mk = (label, fn, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `btn sm ${cls}`; b.textContent = label; b.onclick = fn;
      bar.append(b);
    };
    const done = () => { onChange(); };
    const editable = canEdit(e);
    if (editable) mk('✎ Edit details', () => { close(); openForm(e, onChange); }, 'primary');
    if (editable && e.role === 'member') {
      mk(E.isLeader() ? '⇄ Ask for transfer' : '⇄ Transfer', () => { close(); E.transferForm(e, onChange); });
      mk('# Reset PIN', () => {
        E.modal({
          title: `New PIN for ${e.name}`, submit: 'Set PIN',
          body: html`<p class="muted">The old PIN stops working and ${e.name} is signed out.</p><div class="form">${E.field({ name: 'pin', label: 'New PIN (6 digits)', value: '', placeholder: 'Leave empty to generate one', full: true, attrs: 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off"' })}</div>`,
          onSubmit: async (v, { close: c }) => { const r = await E.post(`/api/employees/${id}/reset-pin`, v.pin ? { pin: v.pin } : {}); c(); E.showPin(e.name, r.pin); },
        });
      });
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
    if (editable) {
      mk('+ History note', () => {
        E.modal({
          title: `History entry - ${e.name}`,
          body: html`<div class="form">${E.field({ name: 'eventType', label: 'Type', type: 'select', value: 'note', options: EVENT_TYPES.map((t) => ({ value: t, label: fmt.label(t) })) })}
            ${E.field({ name: 'eventDate', label: 'Date', type: 'date', value: E.today() })}${E.field({ name: 'details', label: 'Details', type: 'textarea', required: true })}</div>`,
          onSubmit: async (v, { close: c }) => { await E.post(`/api/employees/${id}/history`, v); c(); close(); onChange(); openProfile(id, onChange); },
        });
      });
      if (e.status === 'active') mk('⏸ Deactivate', () => { close(); deactivateForm(e, done); });
      else mk('▶ Reactivate', async () => { close(); await reactivate(e, done); });
      mk('🗑 Delete', () => { close(); deleteForm(e, done); }, 'danger');
    }
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
      let rows = [];
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
          { label: '', class: 'right', render: (r) => html`<div class="actions"><button class="btn sm" data-act="view" data-id="${r.id}">Profile</button>${canEdit(r) ? html`<button class="btn sm" data-act="edit" data-id="${r.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${r.id}">Delete</button>` : ''}</div>` },
        ], (rows = await E.get(`/api/employees${E.qs(f)}`)), 'No employees match these filters.'),
        bind: (box, refresh) => E.actions(box, {
          view: (id) => openProfile(id, refresh),
          edit: async (id) => openForm(await E.get(`/api/employees/${id}`), refresh),
          del: (id) => deleteForm(rows.find((r) => String(r.id) === id), refresh),
        }),
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
