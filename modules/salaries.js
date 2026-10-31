(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const METHODS = ['Cash', 'Bank transfer', 'JazzCash / Easypaisa', 'Cheque', 'Other'];
  const STATUS_KIND = { paid: 'ok', partial: 'warn', unpaid: 'bad', no_salary: '' };
  const STATUS_TEXT = { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', no_salary: 'No salary set' };
  const CONFIRM_KIND = { confirmed: 'ok', pending: 'warn', disputed: 'bad' };
  const CONFIRM_TEXT = { confirmed: 'Confirmed received', pending: 'Awaiting confirmation', disputed: 'Not received / wrong' };
  const monthName = (p) => { const [y, m] = p.split('-'); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m) - 1]} ${y}`; };

  const statusBadge = (s) => html`<span class="badge ${STATUS_KIND[s]}">${STATUS_TEXT[s]}</span>`;
  const confirmBadge = (p) => html`<span class="badge ${CONFIRM_KIND[p.confirmStatus]}">${CONFIRM_TEXT[p.confirmStatus]}</span>`;
  const roleTag = (r) => (r.role === 'member' ? '' : html` <span class="badge ${r.role === 'hod' ? 'info' : 'ok'}">${E.roleLabel[r.role]}</span>`);

  function confirmCell(r) {
    if (!r.payments.length) return html`<span class="muted">-</span>`;
    return html`<div class="row" style="gap:4px">${r.confirmed ? html`<span class="badge ok">${r.confirmed} confirmed</span>` : ''}${r.pending ? html`<span class="badge warn">${r.pending} awaiting</span>` : ''}${r.disputed ? html`<span class="badge bad">${r.disputed} disputed</span>` : ''}</div>`;
  }

  // ---------- modals used by the paying side (leader pays members, head pays leaders, admin pays heads) ----------
  function payForm(period, r, onSaved) {
    E.modal({
      title: `Record salary payment - ${r.name}`,
      body: html`<p class="muted">${monthName(period)}. Paid so far: <b>${fmt.money(r.paid)}</b>${r.remaining ? html` · Remaining: <b>${fmt.money(r.remaining)}</b>` : ''}</p>
        <div class="form">
        ${E.field({ name: 'salaryAmount', label: 'Salary for this month', type: 'number', value: r.due || r.rate || '', required: true, attrs: 'min="0.01" step="0.01"', help: 'Raise it if this payment includes a bonus' })}
        ${E.field({ name: 'amount', label: 'Amount paid now', type: 'number', value: r.remaining || r.due || r.rate || '', required: true, attrs: 'min="0.01" step="0.01"' })}
        ${E.field({ name: 'paidDate', label: 'Date paid', type: 'date', value: E.today(), required: true })}
        ${E.field({ name: 'method', label: 'Paid by', type: 'select', options: METHODS })}
        ${E.field({ name: 'note', label: 'Note', full: true, placeholder: 'e.g. advance, bonus, transfer reference' })}</div>
        <p class="muted small">${r.name} will be asked to confirm that the money was received.</p>`,
      onSubmit: async (v, { close }) => {
        await E.post('/api/salaries/payments', { ...v, refId: r.refId, period });
        E.toast('Payment recorded'); close(); onSaved();
      },
    });
  }

  function rateForm(r, onSaved) {
    E.modal({
      title: `Monthly salary - ${r.name}`,
      body: html`<div class="form">${E.field({ name: 'amount', label: 'Monthly salary', type: 'number', value: r.rate || '', required: true, attrs: 'min="0" step="0.01"', full: true })}</div>
        <p class="muted small">This is used as the default salary when you record a payment. Months already recorded keep their own amount.</p>`,
      onSubmit: async (v, { close }) => { await E.put('/api/salaries/rate', { ...v, refId: r.refId }); E.toast('Salary saved'); close(); onSaved(); },
    });
  }

  function editPayment(p, onSaved) {
    E.modal({
      title: 'Edit payment',
      body: html`<div class="form">${E.field({ name: 'amount', label: 'Amount paid', type: 'number', value: p.amount, required: true, attrs: 'min="0.01" step="0.01"' })}
        ${E.field({ name: 'paidDate', label: 'Date paid', type: 'date', value: p.paidDate, required: true })}
        ${E.field({ name: 'method', label: 'Paid by', type: 'select', value: p.method || 'Cash', options: METHODS })}${E.field({ name: 'note', label: 'Note', value: p.note })}</div>
        <p class="muted small">After a change the person is asked to confirm again.</p>`,
      onSubmit: async (v, { close }) => { await E.put(`/api/salaries/payments/${p.id}`, v); E.toast('Payment updated'); close(); onSaved(); },
    });
  }

  async function historyModal(r, onChange) {
    const h = await E.get(`/api/salaries/history${E.qs({ refId: r.refId })}`);
    const all = h.records.flatMap((m) => m.payments.map((p) => ({ ...p, period: m.period, due: m.due })));
    const { form } = E.modal({
      title: `Payment history - ${r.name}`, wide: true, cancel: 'Close',
      body: html`<p class="muted">Monthly salary: <b>${fmt.money(h.rate)}</b></p>
        ${E.table([
          { label: 'Month', render: (p) => monthName(p.period) }, { label: 'Paid on', render: (p) => fmt.date(p.paidDate) },
          { label: 'Amount', class: 'num', render: (p) => fmt.money(p.amount) }, { label: 'Of salary', class: 'num', render: (p) => fmt.money(p.due) }, { label: 'By', render: (p) => p.method || '-' },
          { label: 'Confirmation', render: (p) => html`${confirmBadge(p)}${p.confirmNote ? html`<div class="muted small">“${p.confirmNote}”</div>` : ''}${p.confirmedAt ? html`<div class="muted small">${fmt.dateTime(p.confirmedAt)}</div>` : ''}` },
          { label: '', class: 'right', render: (p) => (p.confirmStatus === 'confirmed' ? '' : html`<div class="actions"><button type="button" class="btn sm" data-act="edit" data-id="${p.id}">Edit</button><button type="button" class="btn sm danger" data-act="del" data-id="${p.id}">Delete</button></div>`) },
        ], all, 'No payments recorded yet.')}`,
    });
    const reopen = () => { form.closest('.overlay').remove(); onChange(); historyModal(r, onChange); };
    E.actions(form, {
      edit: (id) => editPayment(all.find((p) => String(p.id) === id), reopen),
      del: async (id) => { if (await E.confirm('Delete this payment record?', { yes: 'Delete', danger: true })) { await E.del(`/api/salaries/payments/${id}`); E.toast('Payment deleted'); reopen(); } },
    });
  }

  // ---------- manage page: the people below you ----------
  E.page({
    id: 'salaries', title: 'Salaries', icon: '$', roles: E.MANAGE, group: 'People', order: 40,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      let rows = [];
      let period = E.today().slice(0, 7);
      await E.listPage(el, {
        title: E.isLeader() ? 'Team salaries' : 'Salaries',
        subtitle: E.isLeader() ? 'Record what each member of your team was paid and when. Every member confirms it from their own portal.'
          : E.isHead() ? 'Record what team leaders and members were paid. The admin records yours. Everybody confirms from their own portal.'
            : 'Record what heads, team leaders and members were paid. Everybody confirms from their own portal.',
        dept: true,
        filters: [
          { name: 'period', label: 'Month', type: 'month', value: period, placeholder: 'YYYY-MM' },
          { name: 'search', label: 'Search', placeholder: 'Name or code' },
          ...(E.isLeader() ? [] : [
            { name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name }))] },
            { name: 'role', label: 'Who', type: 'select', options: [{ value: '', label: 'Everybody' }, { value: 'member', label: 'Team members' }, { value: 'team_leader', label: 'Team leaders' }, ...(E.isAdmin() ? [{ value: 'hod', label: 'Heads of department' }] : [])] },
          ]),
        ],
        csv: (f) => `/api/salaries${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/salaries${E.qs(f)}`);
          rows = r.rows;
          period = r.period;
          const t = r.totals;
          return html`<div class="stats">${E.stat('Salaries due', fmt.money(t.due), { sub: monthName(r.period) })}${E.stat('Paid', fmt.money(t.paid), { cls: 'accent' })}
            ${E.stat('Still to pay', fmt.money(t.remaining), { cls: t.remaining ? 'bad' : '' })}${E.stat('Awaiting confirmation', t.awaitingConfirmation, { cls: t.awaitingConfirmation ? 'accent' : '' })}
            ${E.stat('Disputed', t.disputed, { cls: t.disputed ? 'bad' : '', sub: t.disputed ? 'someone says they did not receive it' : '' })}</div>
            ${E.table([
              { label: 'Employee', render: (x) => html`<b>${x.name}</b>${roleTag(x)}<div class="muted small">${[x.code, x.teamName, E.isAdmin() ? x.departmentName : null].filter(Boolean).join(' · ')}</div>` },
              { label: 'Monthly salary', class: 'num', render: (x) => (x.rate ? fmt.money(x.rate) : html`<span class="muted">Not set</span>`) },
              { label: 'Paid', class: 'num', render: (x) => fmt.money(x.paid) }, { label: 'Remaining', class: 'num', render: (x) => fmt.money(x.remaining) },
              { label: 'Last paid', render: (x) => fmt.date(x.lastPaidDate) }, { label: 'Status', render: (x) => statusBadge(x.status) },
              { label: 'Received?', render: confirmCell },
              { label: '', class: 'right', render: (x) => html`<div class="actions"><button class="btn sm primary" data-act="pay" data-id="${x.refId}">Pay</button><button class="btn sm" data-act="history" data-id="${x.refId}">History</button><button class="btn sm" data-act="rate" data-id="${x.refId}">Salary</button></div>` },
            ], rows, 'No employees found.')}`;
        },
        bind: (box, refresh) => {
          const find = (id) => rows.find((x) => String(x.refId) === id);
          E.actions(box, {
            pay: (id) => payForm(period, find(id), refresh),
            rate: (id) => rateForm(find(id), refresh),
            history: (id) => historyModal(find(id), refresh),
          });
        },
      });
    },
  });

  // ---------- the person being paid: member, team leader and head ----------
  E.page({
    id: 'my-salary', title: 'My Salary', icon: '$', roles: E.SELF, group: E.myGroup, order: 25,
    async render(el) {
      const d = await E.get('/api/salaries/me');
      const reload = () => E.pages.find((p) => p.id === 'my-salary').render(el);
      const pays = d.months.flatMap((m) => m.payments.map((p) => ({ ...p, period: m.period, due: m.due })))
        .sort((a, b) => b.paidDate.localeCompare(a.paidDate) || b.id - a.id);
      const last = pays[0];
      E.mount(el, html`${E.pageHead('My salary', 'Check what you were paid and confirm that you received it.')}
        ${d.awaitingConfirmation ? html`<div class="card" style="border-color:var(--accent);margin-bottom:16px"><b>${d.awaitingConfirmation} payment${d.awaitingConfirmation > 1 ? 's are' : ' is'} waiting for your answer.</b> <span class="muted">Please tell us whether you received the money.</span></div>` : ''}
        <div class="stats">${E.stat('Monthly salary', d.monthlySalary ? fmt.money(d.monthlySalary) : 'Not set yet')}
          ${E.stat('Last payment', last ? fmt.money(last.amount) : '-', { sub: last ? `${fmt.date(last.paidDate)} · ${last.method || ''}` : '' })}
          ${E.stat('Waiting for your answer', d.awaitingConfirmation, { cls: d.awaitingConfirmation ? 'accent' : '' })}</div>
        <h3 style="margin:0 0 10px">Payments</h3>
        ${E.table([
          { label: 'Salary month', render: (p) => monthName(p.period) }, { label: 'Paid on', render: (p) => fmt.date(p.paidDate) },
          { label: 'Amount', class: 'num', render: (p) => html`<b>${fmt.money(p.amount)}</b>` },
          { label: 'Did you receive it?', render: (p) => html`${confirmBadge(p)}${p.confirmNote ? html`<div class="muted small">“${p.confirmNote}”</div>` : ''}
            ${p.confirmStatus === 'confirmed' ? '' : html`<div class="actions" style="justify-content:flex-start;margin-top:6px"><button class="btn sm primary" data-act="yes" data-id="${p.id}">I received it</button>${p.confirmStatus === 'pending' ? html`<button class="btn sm danger" data-act="no" data-id="${p.id}">Not received</button>` : ''}</div>`}` },
          { label: 'Paid by', render: (p) => p.method || '-' }, { label: 'Note', class: 'wrap', render: (p) => p.note || '' },
        ], pays, 'No salary payments have been recorded for you yet.')}
        <h3 style="margin:24px 0 10px">Month by month</h3>
        ${E.table([
          { label: 'Month', render: (m) => monthName(m.period) }, { label: 'Salary', class: 'num', render: (m) => fmt.money(m.due) },
          { label: 'Paid', class: 'num', render: (m) => fmt.money(m.paid) }, { label: 'Remaining', class: 'num', render: (m) => fmt.money(m.remaining) }, { label: 'Status', render: (m) => statusBadge(m.status) },
        ], d.months, 'Nothing recorded yet.')}`);
      E.actions(el, {
        yes: async (id) => {
          const p = pays.find((x) => String(x.id) === id);
          if (!(await E.confirm(`Confirm that you received ${fmt.money(p.amount)} on ${fmt.date(p.paidDate)}? You cannot change this afterwards.`, { yes: 'Yes, I received it' }))) return;
          await E.post(`/api/salaries/payments/${id}/confirm`, { status: 'confirmed' });
          E.toast('Thank you, confirmed'); reload();
        },
        no: (id) => {
          const p = pays.find((x) => String(x.id) === id);
          E.modal({
            title: 'I did not receive this payment',
            body: html`<p>${fmt.money(p.amount)} on ${fmt.date(p.paidDate)} for ${monthName(p.period)}</p><div class="form">${E.field({ name: 'note', label: 'What is wrong?', type: 'textarea', required: true, placeholder: 'e.g. I received only 400, or nothing received yet' })}</div>
              <p class="muted small">The person who pays you will see this and can correct the record. You can confirm it later once it is sorted out.</p>`,
            submit: 'Send',
            onSubmit: async (v, { close }) => { await E.post(`/api/salaries/payments/${id}/confirm`, { status: 'disputed', note: v.note }); E.toast('Sent. They have been informed.'); close(); reload(); },
          });
        },
      });
    },
  });
})();
