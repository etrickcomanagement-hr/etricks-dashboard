(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const money = (n) => html`<span class="${n < 0 ? 'neg' : ''}">${fmt.money(n)}</span>`;

  function billForm(bill, onSaved) {
    const b = bill || { date: E.today(), status: 'paid', category: E.settings.expenseCategories?.[0] };
    const cats = E.settings.expenseCategories || ['Other'];
    const { form } = E.modal({
      title: bill ? 'Edit bill / expense' : 'Add bill / expense',
      body: html`<div class="form">
        ${E.field({ name: 'category', label: 'Category', type: 'select', value: b.category, options: cats, required: true })}
        ${E.field({ name: 'amount', label: 'Amount', type: 'number', value: b.amount, required: true, attrs: 'min="0.01" step="0.01"' })}
        ${E.field({ name: 'date', label: 'Bill date', type: 'date', value: b.date, required: true })}
        ${E.field({ name: 'status', label: 'Status', type: 'select', value: b.status, options: [{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Not paid yet' }] })}
        ${E.field({ name: 'paidDate', label: 'Paid on', type: 'date', value: b.paidDate, help: 'Only for paid bills (defaults to the bill date)' })}
        ${E.field({ name: 'reference', label: 'Bill / reference number', value: b.reference })}
        ${E.field({ name: 'vendor', label: 'Paid to / vendor', value: b.vendor, placeholder: 'e.g. electricity company' })}
        ${E.field({ name: 'description', label: 'Description', value: b.description, placeholder: 'e.g. October electricity bill', full: true })}</div>`,
      onSubmit: async (v, { close }) => {
        if (bill) await E.put(`/api/company-expenses/${bill.id}`, v); else await E.post('/api/company-expenses', v);
        E.toast('Saved'); close(); onSaved();
      },
    });
    void form;
  }

  E.page({
    id: 'company-finance', title: 'Company Finance', icon: '◈', roles: ['admin'], group: 'Insights', order: 5,
    async render(el) {
      let bills = [];
      const cats = E.settings.expenseCategories || [];
      const ctrl = await E.listPage(el, {
        title: 'Company finance', subtitle: 'All department finance plus utility bills and company expenses, combined into overall profit.',
        actions: html`<button class="btn primary" data-act="add">+ Add bill / expense</button>`,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'category', label: 'Bill category', type: 'select', options: [{ value: '', label: 'All categories' }, ...cats] },
          { name: 'status', label: 'Bill status', type: 'select', options: [{ value: '', label: 'Paid and unpaid' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Not paid yet' }] },
          { name: 'search', label: 'Search bills', placeholder: 'Vendor, reference…' },
        ],
        csv: (f) => `/api/company-expenses${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const [s, b] = await Promise.all([E.get(`/api/company-finance/summary${E.qs({ from: f.from, to: f.to })}`), E.get(`/api/company-expenses${E.qs(f)}`)]);
          bills = b.rows;
          const t = s.totals;
          return html`
            <div class="card" style="margin-bottom:16px"><h3>How the profit is worked out</h3>
              <div class="row" style="gap:10px;font-size:15px">
                <span><b class="pos">${fmt.money(t.revenue)}</b> <span class="muted">revenue (all department sales)</span></span><span class="muted">−</span>
                <span><b>${fmt.money(t.deptInvestment)}</b> <span class="muted">department investment</span></span><span class="muted">−</span>
                <span><b>${fmt.money(t.deptExpenses)}</b> <span class="muted">department expenses</span></span><span class="muted">−</span>
                <span><b>${fmt.money(t.billsPaid)}</b> <span class="muted">paid bills &amp; utilities</span></span><span class="muted">−</span>
                <span><b>${fmt.money(t.salariesPaid)}</b> <span class="muted">salaries paid</span></span><span class="muted">=</span>
                <span><b class="${t.netProfit < 0 ? 'neg' : 'pos'}" style="font-size:20px">${fmt.money(t.netProfit)}</b> <span class="muted">net profit</span></span></div></div>
            <div class="stats">
              ${E.stat('Revenue', fmt.money(t.revenue), { cls: 'accent', sub: `${fmt.num(t.orders)} orders` })}
              ${E.stat('Total investment & spend', fmt.money(t.totalSpend), { sub: 'departments + bills + salaries' })}
              ${E.stat('Net profit', fmt.money(t.netProfit), { cls: t.netProfit < 0 ? 'bad' : 'accent', sub: t.margin != null ? `${t.margin}% margin` : '' })}
              ${E.stat('ROI', t.roi != null ? `${t.roi}%` : '-', { sub: 'net profit ÷ total spend' })}
              ${E.stat('Bills paid', fmt.money(t.billsPaid), { sub: 'utilities & company expenses' })}
              ${E.stat('Bills still to pay', fmt.money(t.billsUnpaid), { cls: t.billsUnpaid ? 'bad' : '', sub: t.unpaidCount ? `${t.unpaidCount} unpaid · profit after paying: ${fmt.money(t.profitAfterUnpaid)}` : 'nothing pending' })}
            </div>
            <div class="grid cols-2">
              <div><h3 style="margin:0 0 10px">Where the money goes</h3>${E.table([
                { label: 'Cost', render: (l) => html`${l.label}<div class="muted small">${l.group}</div>` }, { label: 'Amount', class: 'num', render: (l) => fmt.money(l.amount) },
                { label: 'Share', render: (l) => E.meter(l.share, 101, 101) },
              ], s.lines, 'No spending recorded for this period.')}</div>
              <div><h3 style="margin:0 0 10px">By department</h3>${E.table([
                { label: 'Department', render: (d) => html`<b style="color:${d.color}">●</b> ${d.name}` }, { label: 'Investment', class: 'num', render: (d) => fmt.money(d.investment + d.expenses) },
                { label: 'Revenue', class: 'num', render: (d) => fmt.money(d.revenue) }, { label: 'Profit', class: 'num', render: (d) => money(d.profit) },
              ], s.byDepartment)}</div>
            </div>
            ${s.byMonth.length > 1 ? html`<h3 style="margin:22px 0 10px">Month by month</h3>${E.table([
              { label: 'Month', key: 'month' }, { label: 'Revenue', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Department costs', class: 'num', render: (x) => fmt.money(x.deptCost) },
              { label: 'Paid bills', class: 'num', render: (x) => fmt.money(x.bills) }, { label: 'Salaries', class: 'num', render: (x) => fmt.money(x.salaries) }, { label: 'Net profit', class: 'num', render: (x) => money(x.net) },
            ], s.byMonth)}` : ''}
            <h3 style="margin:22px 0 10px">Bills &amp; utilities <span class="muted small">· paid ${fmt.money(b.totals.paid)} · unpaid ${fmt.money(b.totals.unpaid)}</span></h3>
            ${E.table([
              { label: 'Bill date', render: (x) => fmt.date(x.date) }, { label: 'Category', render: (x) => html`<b>${x.category}</b>` },
              { label: 'Details', class: 'wrap', render: (x) => html`${x.description || '-'}<div class="muted small">${[x.vendor, x.reference].filter(Boolean).join(' · ')}</div>` },
              { label: 'Amount', class: 'num', render: (x) => fmt.money(x.amount) },
              { label: 'Status', render: (x) => (x.status === 'paid' ? html`<span class="badge ok">Paid</span><div class="muted small">${fmt.date(x.paidDate)}</div>` : html`<span class="badge warn">Not paid</span>`) },
              { label: '', class: 'right', render: (x) => html`<div class="actions">${x.status === 'unpaid' ? html`<button class="btn sm primary" data-act="pay" data-id="${x.id}">Mark paid</button>` : ''}
                <button class="btn sm" data-act="edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${x.id}">Delete</button></div>` },
            ], bills, 'No bills recorded for these filters. Use "Add bill / expense" for electricity, gas, internet, rent and so on.')}`;
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => billForm(bills.find((x) => String(x.id) === id), refresh),
          pay: async (id) => { await E.post(`/api/company-expenses/${id}/pay`, {}); E.toast('Marked as paid'); refresh(); },
          del: async (id) => { if (await E.confirm('Delete this bill? This is recorded in the activity log.', { yes: 'Delete', danger: true })) { await E.del(`/api/company-expenses/${id}`); E.toast('Bill deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => billForm(null, ctrl.refresh) });
    },
  });
})();
