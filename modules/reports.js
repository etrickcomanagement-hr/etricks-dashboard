(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const scoreBadge = (s) => (s == null ? html`<span class="muted">-</span>` : html`<span class="badge ${s >= 80 ? 'ok' : s >= 60 ? 'warn' : 'bad'}">${s}</span>`);

  // ---------------- dashboard (admin + team leader) ----------------
  E.page({
    id: 'dashboard', title: 'Dashboard', icon: '▦', roles: ['admin', 'leader'], order: 1,
    async render(el) {
      const admin = E.isAdmin();
      const depts = admin ? await E.departments() : [];
      E.mount(el, html`${E.pageHead(admin ? 'Admin dashboard' : 'Department dashboard', `${fmt.date(E.today())}`, '')}
        ${admin ? html`<form class="filters"><label>Department<select name="departmentId"><option value="">All departments</option>${depts.map((d) => html`<option value="${d.id}">${d.name}</option>`)}</select></label></form>` : ''}
        <div id="dash"></div>`);
      const load = async () => {
        const dept = admin ? E.$('select[name=departmentId]', el).value : '';
        const d = await E.get(`/api/dashboard${E.qs({ departmentId: dept })}`);
        const max = Math.max(1, ...d.trend.map((t) => t.present));
        E.mount(E.$('#dash', el), html`
          <div class="stats">
            ${E.stat('Active employees', d.today.employees)}
            ${E.stat('Present today', d.today.present, { cls: 'accent', sub: `${d.today.late} late` })}
            ${E.stat('On leave', d.today.onLeave)}
            ${E.stat('Not marked yet', d.today.notMarked, { cls: d.today.notMarked ? 'bad' : '' })}
            ${E.stat('Attendance to approve', d.pending.attendance, { cls: d.pending.attendance ? 'accent' : '' })}
            ${E.stat('Leave requests pending', d.pending.leave, { cls: d.pending.leave ? 'accent' : '' })}
          </div>
          <div class="stats">
            ${E.stat('Open tasks', d.tasks.open)}
            ${E.stat('Overdue tasks', d.tasks.overdue, { cls: d.tasks.overdue ? 'bad' : '' })}
            ${E.stat('Orders (this month)', fmt.num(d.finance.orders))}
            ${E.stat('Investment (this month)', fmt.money(d.finance.investment))}
            ${E.stat('Sales (this month)', fmt.money(d.finance.revenue))}
            ${E.stat('Profit (this month)', fmt.money(d.finance.profit), { cls: d.finance.profit < 0 ? 'bad' : 'accent' })}
          </div>
          <div class="grid cols-2">
            <div class="card"><h3>Attendance - last 14 days</h3>
              <div class="bars">${d.trend.map((t) => html`<div class="b"><span class="val">${t.present}</span><div class="track"><div class="fill" style="height:${(t.present / max) * 100}%"></div></div><span class="lab">${t.date.slice(8)}</span></div>`)}</div></div>
            <div class="card"><h3>Top performers this month</h3>${E.table([
              { label: 'Employee', render: (r) => html`${r.name}<div class="muted small">${r.departmentName}</div>` },
              { label: 'Attendance', render: (r) => fmt.pct(r.attendanceRate) }, { label: 'Tasks', render: (r) => fmt.pct(r.taskRate) },
              { label: 'Score', render: (r) => scoreBadge(r.score) },
            ], d.topPerformers, 'Scores appear once attendance and tasks are recorded.')}</div>
          </div>
          ${d.departments ? html`<h3 style="margin:22px 0 10px">Departments</h3>${E.table([
            { label: 'Department', render: (r) => html`<b style="color:${r.color}">●</b> ${r.name}` },
            { label: 'Staff', class: 'num', key: 'employees' }, { label: 'Present', class: 'num', key: 'present' }, { label: 'Not marked', class: 'num', key: 'notMarked' },
            { label: 'To approve', class: 'num', render: (r) => r.pendingAttendance + r.pendingLeave }, { label: 'Open tasks', class: 'num', key: 'openTasks' },
            { label: 'Orders', class: 'num', render: (r) => fmt.num(r.orders) }, { label: 'Investment', class: 'num', render: (r) => fmt.money(r.investment) },
            { label: 'Sales', class: 'num', render: (r) => fmt.money(r.revenue) },
            { label: 'Profit', class: 'num', render: (r) => html`<span class="${r.profit < 0 ? 'neg' : 'pos'}">${fmt.money(r.profit)}</span>` },
          ], d.departments)}` : ''}
          ${d.lowAttendance.length ? html`<h3 style="margin:22px 0 10px">Needs attention: lowest attendance this month</h3>${E.table([
            { label: 'Employee', key: 'name' }, { label: 'Department', key: 'departmentName' },
            { label: 'Attendance', render: (r) => E.meter(r.attendanceRate) }, { label: 'Absent days', class: 'num', key: 'absentDays' }, { label: 'Late', class: 'num', key: 'lateCount' },
          ], d.lowAttendance)}` : ''}`);
      };
      E.$('.filters', el)?.addEventListener('change', load);
      await load();
    },
  });

  // ---------------- performance reports ----------------
  const COLS = {
    employee: [
      { label: 'Employee', render: (r) => html`${r.name}<div class="muted small">${r.empCode} · ${r.teamName || 'No team'}</div>` },
      { label: 'Department', key: 'departmentName' },
    ],
    team: [{ label: 'Team', key: 'teamName' }, { label: 'Department', key: 'departmentName' }, { label: 'Staff', class: 'num', key: 'employees' }],
    department: [{ label: 'Department', key: 'departmentName' }, { label: 'Staff', class: 'num', key: 'employees' }],
  };
  const METRICS = [
    { label: 'Attendance', render: (r) => E.meter(r.attendanceRate, 90, 75) },
    { label: 'Absent', class: 'num', render: (r) => r.absentDays }, { label: 'Late', class: 'num', key: 'lateCount' },
    { label: 'Avg hrs/day', class: 'num', render: (r) => r.avgWorkedHours ?? '-' },
    { label: 'Tasks done', class: 'num', render: (r) => `${r.tasksDone}/${r.tasksTotal}` },
    { label: 'Completion', render: (r) => E.meter(r.taskRate, 80, 50) },
    { label: 'Overdue', class: 'num', key: 'tasksOverdue' },
    { label: 'Units', class: 'num', render: (r) => fmt.num(r.units) },
    { label: 'Rating', class: 'num', render: (r) => r.avgRating ?? '-' },
    { label: 'Score', class: 'num', render: (r) => scoreBadge(r.score) },
  ];
  const FIN = [
    { label: 'Orders', class: 'num', render: (r) => fmt.num(r.orders) }, { label: 'Investment', class: 'num', render: (r) => fmt.money(r.investment) },
    { label: 'Sales', class: 'num', render: (r) => fmt.money(r.revenue) },
    { label: 'Profit', class: 'num', render: (r) => html`<span class="${r.profit < 0 ? 'neg' : 'pos'}">${fmt.money(r.profit)}</span>` },
  ];

  E.page({
    id: 'performance', title: 'Performance', icon: '★', roles: ['admin', 'leader'], group: 'Insights', order: 20,
    async render(el) {
      const teams = await E.teams(E.isAdmin() ? '' : E.user.departmentId);
      await E.listPage(el, {
        title: 'Performance reports', subtitle: 'Score = attendance + task completion + work ratings (weights are set by the admin).', dept: true,
        filters: [
          { name: 'level', label: 'Report for', type: 'select', value: 'employee', options: [{ value: 'employee', label: 'Employees' }, { value: 'team', label: 'Teams' }, { value: 'department', label: 'Departments' }] },
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...E.idOptions(teams)] },
        ],
        csv: (f) => `/api/reports/performance${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/reports/performance${E.qs(f)}`);
          return E.table([...COLS[r.level], ...METRICS, ...(r.level === 'department' ? FIN : [])], r.rows, 'No data for this period.');
        },
      });
    },
  });
  // ---------------- member report (one person: attendance, orders, sales, tasks, complaints) ----------------
  const periodText = (r) => `${fmt.date(r.from)} to ${fmt.date(r.to)}`;
  const profit = (n) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${fmt.money(n)}</span>`;
  const sevKind = { low: '', medium: 'warn', high: 'bad' };
  const compKind = { open: 'bad', under_review: 'warn', resolved: 'ok', dismissed: '' };

  function memberReport(rep) {
    const e = rep.employee;
    const m = rep.metrics;
    const o = rep.orders;
    const openC = rep.complaints.filter((c) => c.status === 'open' || c.status === 'under_review').length;
    return html`
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h2 style="margin:0">${e.name}</h2><div class="muted">${e.empCode} · ${e.designation || 'Team member'} · ${e.departmentName}${e.teamName ? ` · ${e.teamName}` : ''}</div>
          <div class="muted small">Joined ${fmt.date(e.joinDate)} · Report period: ${periodText(rep)}</div></div>
        <button class="btn sm no-print" type="button" data-act="print">🖨 Print</button></div>
      <div class="stats" style="margin-top:16px">
        ${E.stat('Attendance', m ? fmt.pct(m.attendanceRate) : '-', { cls: 'accent', sub: m ? `${m.presentDays} present · ${m.absentDays} absent · ${m.lateCount} late · ${m.leaveDays} leave` : '' })}
        ${E.stat('Orders taken', fmt.num(o.orders), { sub: `${o.entries} report${o.entries === 1 ? '' : 's'}` })}
        ${E.stat('Sales', fmt.money(o.sales), { cls: 'accent' })}${E.stat('Investment', fmt.money(o.investment))}
        ${E.stat('Profit', fmt.money(o.profit), { cls: o.profit < 0 ? 'bad' : 'accent' })}
        ${E.stat('Tasks done', m ? `${m.tasksDone}/${m.tasksTotal}` : '-', { sub: m && m.tasksOverdue ? `${m.tasksOverdue} overdue` : '' })}
        ${E.stat('Complaints', rep.complaints.length, { cls: openC ? 'bad' : '', sub: openC ? `${openC} still open` : 'none open' })}
        ${E.stat('Performance score', m?.score ?? '-', { sub: m?.avgRating ? `work rating ${m.avgRating}/5 · ${m.hoursLogged} h logged` : '' })}
      </div>
      <h3 style="margin:18px 0 8px">Complaints</h3>
      ${E.table([
        { label: 'Date', render: (c) => fmt.date(c.incidentDate || c.createdAt) },
        { label: 'Complaint', class: 'wrap', render: (c) => html`<b>${c.category}</b> <span class="badge ${sevKind[c.severity]}">${fmt.label(c.severity)}</span><div>${c.description}</div><div class="muted small">Filed by ${c.filedBy}</div>${c.memberResponse ? html`<div class="muted small">Member's reply: “${c.memberResponse}”</div>` : ''}${c.resolutionNote ? html`<div class="muted small">Action: ${c.resolutionNote}</div>` : ''}` },
        { label: 'Status', render: (c) => html`<span class="badge ${compKind[c.status]}">${fmt.label(c.status)}</span>` },
      ], rep.complaints, 'No complaints in this period.')}
      <h3 style="margin:18px 0 8px">Orders & sales reported</h3>
      ${E.table([
        { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Store', render: (x) => x.store || '-' }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
        { label: 'Investment', class: 'num', render: (x) => fmt.money(x.investment) }, { label: 'Sales', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Profit', class: 'num', render: (x) => profit(x.profit) },
      ], o.rows, 'No orders reported in this period.')}
      <h3 style="margin:18px 0 8px">Attendance</h3>
      ${E.table([
        { label: 'Date', render: (a) => fmt.date(a.date) }, { label: 'Status', render: (a) => E.badge(a.status) }, { label: 'In', render: (a) => fmt.time(a.checkIn) },
        { label: 'Out', render: (a) => fmt.time(a.checkOut) }, { label: 'Approval', render: (a) => E.badge(a.approval) },
      ], rep.attendance, 'No attendance recorded in this period.')}
      <h3 style="margin:18px 0 8px">Tasks</h3>
      ${E.table([
        { label: 'Task', class: 'wrap', key: 'title' }, { label: 'Priority', render: (t) => E.badge(t.priority) }, { label: 'Due', render: (t) => fmt.date(t.dueDate) }, { label: 'Status', render: (t) => E.badge(t.status) },
      ], rep.tasks, 'No tasks in this period.')}`;
  }
  E.memberReport = memberReport;

  function openMemberReport(id, from, to) {
    E.get(`/api/reports/employee/${id}${E.qs({ from, to })}`).then((rep) => {
      const { form } = E.modal({ title: 'Member report', wide: true, cancel: 'Close', body: memberReport(rep) });
      E.actions(form, { print: () => window.print() });
    }).catch((ex) => E.toast(ex.message, 'bad'));
  }

  E.page({
    id: 'member-reports', title: 'Member Reports', icon: '◉', roles: ['admin', 'leader'], group: 'Insights', order: 15,
    async render(el) {
      const teams = await E.teams(E.isAdmin() ? '' : E.user.departmentId);
      let current = {};
      await E.listPage(el, {
        title: 'Member reports', subtitle: 'Every member side by side: attendance, orders, sales, tasks and complaints. Open a report for the full picture.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...E.idOptions(teams)] },
        ],
        csv: (f) => `/api/reports/members${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/reports/members${E.qs(f)}`);
          current = { from: r.from, to: r.to };
          return E.table([
            { label: 'Member', render: (x) => html`<a href="#" data-act="report" data-id="${x.employeeId}"><b>${x.name}</b></a><div class="muted small">${x.empCode} · ${x.teamName || 'No team'}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
            { label: 'Attendance', render: (x) => E.meter(x.attendanceRate, 90, 75) },
            { label: 'Orders', class: 'num', render: (x) => fmt.num(x.ordersTaken) }, { label: 'Investment', class: 'num', render: (x) => fmt.money(x.investment) },
            { label: 'Sales', class: 'num', render: (x) => fmt.money(x.sales) }, { label: 'Profit', class: 'num', render: (x) => profit(x.profit) },
            { label: 'Tasks', class: 'num', render: (x) => `${x.tasksDone}/${x.tasksTotal}` },
            { label: 'Complaints', render: (x) => (x.complaints || x.openComplaints ? html`<span class="badge ${x.openComplaints ? 'bad' : 'warn'}">${x.complaints} · ${x.openComplaints} open</span>` : html`<span class="muted">None</span>`) },
            { label: 'Score', class: 'num', render: (x) => scoreBadge(x.score) },
            { label: '', class: 'right', render: (x) => html`<button class="btn sm primary" data-act="report" data-id="${x.employeeId}">Report</button>` },
          ], r.rows, 'No members found.');
        },
        bind: (box) => E.actions(box, { report: (id) => openMemberReport(id, current.from, current.to) }),
      });
    },
  });

  E.page({
    id: 'my-report', title: 'My Report', icon: '◉', roles: ['member'], order: 45,
    async render(el) {
      await E.listPage(el, {
        title: 'My report', subtitle: 'How you are doing: attendance, orders, sales, tasks and any complaints.',
        filters: [{ name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() }],
        load: async (f) => memberReport(await E.get(`/api/reports/me${E.qs(f)}`)),
      });
      E.actions(el, { print: () => window.print() });
    },
  });
})();
