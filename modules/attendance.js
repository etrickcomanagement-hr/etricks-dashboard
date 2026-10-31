(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const ACTIONS = {
    not_started: [['check_in', '▶ Check in', 'primary']],
    working: [['break_start', '☕ Start break', ''], ['check_out', '■ Check out', 'primary']],
    on_break: [['break_end', '▶ End break', 'primary'], ['check_out', '■ Check out', '']],
    done: [],
  };
  const STATE_TEXT = { not_started: 'You have not checked in yet', working: 'You are working', on_break: 'You are on a break', done: 'Your day is complete' };

  const timeline = (rec) => {
    if (!rec) return html`<div class="muted">No activity yet today.</div>`;
    return html`<div class="timeline">
      <div>Status: ${E.badge(rec.status)} ${E.badge(rec.approval)}</div>
      ${rec.checkIn ? html`<div>Checked in: <b>${fmt.time(rec.checkIn)}</b></div>` : ''}
      ${rec.breaks.map((b) => html`<div>Break: ${fmt.time(b.startAt)} → ${b.endAt ? fmt.time(b.endAt) : 'in progress'}</div>`)}
      ${rec.checkOut ? html`<div>Checked out: <b>${fmt.time(rec.checkOut)}</b></div>` : ''}
      ${rec.workedMinutes != null ? html`<div>Worked: <b>${fmt.dur(rec.workedMinutes)}</b> (breaks ${fmt.dur(rec.breakMinutes)})</div>` : rec.breakMinutes ? html`<div>Break time so far: ${fmt.dur(rec.breakMinutes)}</div>` : ''}
      ${rec.overBreak ? html`<div class="neg">Break is over the allowed ${rec.allowedBreak} minutes.</div>` : ''}</div>`;
  };

  // ---------------- member home: punch card + monthly snapshot ----------------
  let clockTimer;
  E.page({
    id: 'home', title: 'Today', icon: '◷', roles: E.SELF, group: E.myGroup, order: 1,
    async render(el) {
      const [today, dash, tasks] = await Promise.all([E.get('/api/attendance/me/today'), E.get('/api/dashboard/me').catch(() => null), E.get('/api/tasks/me').catch(() => [])]);
      const m = dash?.month;
      const open = tasks.filter((t) => t.status !== 'done');
      E.mount(el, html`${E.pageHead(`Hello, ${E.user.name || E.user.label}`, fmt.date(E.today()))}
        <div class="grid cols-2">
          <div class="card punch">
            <div class="clock" id="clock"></div>
            <div class="state">${STATE_TEXT[today.state]}${today.shift ? html` · Shift ${today.shift.startTime}–${today.shift.endTime}` : ''}</div>
            <div class="btns">${ACTIONS[today.state].map(([a, label, cls]) => html`<button class="btn ${cls}" data-act="${a}">${label}</button>`)}</div>
            ${timeline(today.record)}
          </div>
          <div class="card"><h3>This month</h3>
            ${m ? html`<div class="stats" style="margin:0">
              ${E.stat('Attendance', fmt.pct(m.attendanceRate), { cls: 'accent' })}${E.stat('Present days', m.presentDays)}
              ${E.stat('Late', m.lateCount)}${E.stat('Tasks done', `${m.tasksDone}/${m.tasksTotal}`)}
              ${E.stat('Performance score', m.score ?? '-', { sub: dash.rank ? `Rank ${dash.rank.position} of ${dash.rank.of} ${E.user.role === 'member' ? 'in your team' : 'in your department'}` : '' })}
              ${E.stat('Pending leave', dash.pendingLeave)}</div>` : html`<div class="muted">Your numbers will appear once you start working.</div>`}
          </div>
        </div>
        <h3 style="margin:22px 0 10px">My open tasks (${open.length})</h3>
        ${E.table([{ label: 'Task', key: 'title' }, { label: 'Priority', render: (t) => E.badge(t.priority) }, { label: 'Due', render: (t) => html`${fmt.date(t.dueDate)}${t.overdue ? html` <span class="badge bad">Overdue</span>` : ''}` }, { label: 'Status', render: (t) => E.badge(t.status) }], open.slice(0, 6), 'No open tasks. Nice work!')}`);

      const tick = () => { const c = E.$('#clock', el); if (c) c.textContent = new Date().toLocaleTimeString(); else clearInterval(clockTimer); };
      clearInterval(clockTimer);
      tick();
      clockTimer = setInterval(tick, 1000);
      const punch = (action, msg) => async () => {
        await E.post('/api/attendance/me/action', { action });
        E.toast(msg);
        await E.pages.find((p) => p.id === 'home').render(el);
      };
      E.actions(el, {
        check_in: punch('check_in', 'Checked in'), check_out: punch('check_out', 'Checked out. Have a good day!'),
        break_start: punch('break_start', 'Break started'), break_end: punch('break_end', 'Welcome back'),
      });
    },
  });

  // ---------------- member: my attendance history ----------------
  E.page({
    id: 'my-attendance', title: 'My Attendance', icon: '☰', roles: E.SELF, group: E.myGroup, order: 10,
    async render(el) {
      await E.listPage(el, {
        title: 'My attendance', subtitle: `Your check-ins, breaks and approval status. ${E.user.role === 'member' ? 'Your team leader' : 'The admin'} approves them.`,
        filters: [{ name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() }],
        load: async (f) => {
          const rows = await E.get(`/api/attendance/me${E.qs(f)}`);
          return html`<div class="stats">${E.stat('Days recorded', rows.length)}${E.stat('Late', rows.filter((r) => r.status === 'late').length)}${E.stat('Awaiting approval', rows.filter((r) => r.approval === 'pending').length)}</div>
            ${E.table([
              { label: 'Date', render: (r) => fmt.date(r.date) }, { label: 'Status', render: (r) => E.badge(r.status) },
              { label: 'In', render: (r) => fmt.time(r.checkIn) }, { label: 'Out', render: (r) => fmt.time(r.checkOut) },
              { label: 'Break', render: (r) => html`${fmt.dur(r.breakMinutes)}${r.overBreak ? html` <span class="badge bad">Over</span>` : ''}` },
              { label: 'Worked', render: (r) => fmt.dur(r.workedMinutes) }, { label: 'Approval', render: (r) => E.badge(r.approval) },
              { label: 'Note', class: 'wrap', render: (r) => r.note || '' },
            ], rows, 'No attendance recorded for this period.')}`;
        },
      });
    },
  });

  // ---------------- leader / admin ----------------
  const decide = async (id, approval) => { await E.post(`/api/attendance/${id}/decision`, { approval }); E.toast(approval === 'approved' ? 'Approved' : 'Rejected'); };

  function markModal(emp, day, onSaved) {
    E.modal({
      title: `Mark attendance - ${emp.name}`,
      body: html`<div class="form">${E.field({ name: 'date', label: 'Date', type: 'date', value: day, required: true })}
        ${E.field({ name: 'status', label: 'Status', type: 'select', value: 'present', options: ['present', 'late', 'half_day', 'absent', 'leave'].map((s) => ({ value: s, label: fmt.label(s) })) })}
        ${E.field({ name: 'checkIn', label: 'Check in (optional)', type: 'time' })}${E.field({ name: 'checkOut', label: 'Check out (optional)', type: 'time' })}
        ${E.field({ name: 'note', label: 'Note', full: true })}</div>`,
      onSubmit: async (v, { close }) => { await E.post('/api/attendance/manual', { ...v, employeeId: emp.id }); E.toast('Attendance saved'); close(); onSaved(); },
    });
  }

  const ROLE_FILTER = () => ({ name: 'role', label: 'Who', type: 'select', options: [{ value: '', label: 'Everybody' }, { value: 'member', label: 'Team members' }, { value: 'team_leader', label: 'Team leaders' }, ...(E.isAdmin() ? [{ value: 'hod', label: 'Heads of department' }] : [])] });
  const teamFilter = (teams) => ({ name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name }))] });
  const roleTag = (r) => (r.role === 'member' ? '' : html` <span class="badge ${r.role === 'hod' ? 'info' : 'ok'}">${E.roleLabel[r.role]}</span>`);
  // Buttons appear only for people the viewer may decide on; leaders' and heads' days are checked by the admin.
  const approvalNote = (r) => (r.canApprove || E.isAdmin() ? '' : html`<span class="muted small">Admin approves</span>`);

  E.page({
    id: 'attendance', title: 'Attendance', icon: '✔', roles: E.MANAGE, group: 'People', order: 20,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      let board = null;
      const ctrl = await E.listPage(el, {
        title: 'Daily attendance', subtitle: E.isLeader() ? 'Your team: who is in, who is on break, and what needs your approval.' : 'Who is in, who is on break, and what needs your approval.', dept: true,
        actions: html`<button class="btn primary" data-act="approve-all">✔ Approve all pending</button>`,
        filters: [
          { name: 'date', label: 'Date', type: 'date', value: E.today() },
          ...(E.isLeader() ? [] : [teamFilter(teams), ROLE_FILTER()]),
        ],
        load: async (f) => {
          board = await E.get(`/api/attendance/board${E.qs(f)}`);
          const s = board.summary;
          return html`<div class="stats">${E.stat(E.isLeader() ? 'Team size' : 'People', s.total)}${E.stat('Present', s.present, { cls: 'accent', sub: `${s.late} late` })}
            ${E.stat('On leave', s.onLeave)}${E.stat('Not marked', s.notMarked, { cls: s.notMarked ? 'bad' : '' })}${E.stat('To approve', s.pendingApproval)}</div>
            ${E.table([
              { label: 'Employee', render: (r) => html`<b>${r.name}</b>${roleTag(r)}<div class="muted small">${r.empCode} · ${r.teamName || 'No team'}${E.isAdmin() ? ` · ${r.departmentName}` : ''}</div>` },
              { label: 'Status', render: (r) => (r.record ? html`${E.badge(r.record.status)}${r.record.onBreak ? html` <span class="badge info">On break</span>` : ''}` : r.onLeave ? E.badge('leave') : html`<span class="badge bad">Not marked</span>`) },
              { label: 'In', render: (r) => fmt.time(r.record?.checkIn) }, { label: 'Out', render: (r) => fmt.time(r.record?.checkOut) },
              { label: 'Break', render: (r) => (r.record ? html`${fmt.dur(r.record.breakMinutes)}${r.record.overBreak ? html` <span class="badge bad">Over</span>` : ''}` : '-') },
              { label: 'Worked', render: (r) => fmt.dur(r.record?.workedMinutes) }, { label: 'Approval', render: (r) => (r.record ? E.badge(r.record.approval) : '-') },
              { label: '', class: 'right', render: (r) => html`<div class="actions">${approvalNote(r)}
                ${r.canApprove && r.record?.approval !== 'approved' && r.record ? html`<button class="btn sm primary" data-act="ok" data-id="${r.record.id}">Approve</button>` : ''}
                ${r.canApprove && r.record && r.record.approval === 'pending' ? html`<button class="btn sm danger" data-act="no" data-id="${r.record.id}">Reject</button>` : ''}
                ${r.canApprove ? html`<button class="btn sm" data-act="mark" data-id="${r.id}">Mark</button>` : ''}</div>` },
            ], board.rows, 'No active employees for this selection.')}`;
        },
        bind: (box, refresh, f) => E.actions(box, {
          ok: async (id) => { await decide(id, 'approved'); refresh(); },
          no: async (id) => { await decide(id, 'rejected'); refresh(); },
          mark: (id) => markModal(board.rows.find((r) => String(r.id) === id), f.date || E.today(), refresh),
        }),
      });
      E.actions(el, {
        'approve-all': async () => {
          const ids = board.rows.filter((r) => r.canApprove && r.record?.approval === 'pending' && r.record.checkOut).map((r) => r.record.id);
          if (!ids.length) return E.toast('Nothing to approve. Only completed days (checked out) are approved in bulk.');
          if (!(await E.confirm(`Approve ${ids.length} completed attendance record(s)?`))) return;
          await E.post('/api/attendance/bulk-decision', { ids, approval: 'approved' });
          E.toast(`${ids.length} approved`);
          ctrl.refresh();
        },
      });
    },
  });

  E.page({
    id: 'attendance-records', title: 'Attendance Records', icon: '☷', roles: E.MANAGE, group: 'People', order: 21,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      await E.listPage(el, {
        title: 'Attendance records', subtitle: 'Search any period, then export for payroll or review.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.addDays(E.today(), -6) }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Employee', placeholder: 'Name or code' },
          ...(E.isLeader() ? [] : [teamFilter(teams), ROLE_FILTER()]),
          { name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, 'present', 'late', 'half_day', 'absent', 'leave'] },
          { name: 'approval', label: 'Approval', type: 'select', options: [{ value: '', label: 'Any' }, 'pending', 'approved', 'rejected'] },
        ],
        csv: (f) => `/api/attendance${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => E.table([
          { label: 'Date', render: (r) => fmt.date(r.date) }, { label: 'Employee', render: (r) => html`<b>${r.employeeName}</b>${roleTag(r)}<div class="muted small">${r.empCode}${E.isAdmin() ? ` · ${r.departmentName}` : ''}</div>` },
          { label: 'Status', render: (r) => E.badge(r.status) }, { label: 'In', render: (r) => fmt.time(r.checkIn) }, { label: 'Out', render: (r) => fmt.time(r.checkOut) },
          { label: 'Break', render: (r) => html`${fmt.dur(r.breakMinutes)}${r.overBreak ? html` <span class="badge bad">Over</span>` : ''}` },
          { label: 'Worked', render: (r) => fmt.dur(r.workedMinutes) },
          { label: 'Approval', render: (r) => html`${E.badge(r.approval)}${r.decidedBy ? html`<div class="muted small">${r.decidedBy}</div>` : ''}` },
          { label: '', class: 'right', render: (r) => (r.approval === 'pending' ? (r.canApprove ? html`<div class="actions"><button class="btn sm primary" data-act="ok" data-id="${r.id}">Approve</button><button class="btn sm danger" data-act="no" data-id="${r.id}">Reject</button></div>` : approvalNote(r)) : '') },
        ], await E.get(`/api/attendance${E.qs(f)}`), 'No records for these filters.'),
        bind: (box, refresh) => E.actions(box, {
          ok: async (id) => { await decide(id, 'approved'); refresh(); },
          no: async (id) => { await decide(id, 'rejected'); refresh(); },
        }),
      });
    },
  });
})();
