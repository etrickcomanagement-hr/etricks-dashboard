(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const money = (n) => html`<span class="${n < 0 ? 'neg' : ''}">${fmt.money(n)}</span>`;

  async function entryForm(existing, onSaved) {
    const admin = E.isAdmin();
    const depts = admin ? await E.departments() : [];
    const e = existing || { date: E.today(), orders: 0, investment: 0, revenue: 0, expenses: 0, custom: {} };
    const extra = await E.customInputs('finance', e.custom);
    E.modal({
      title: existing ? 'Edit finance entry' : 'Add finance entry', wide: true,
      body: html`<div class="form">
        ${admin && !existing ? E.field({ name: 'departmentId', label: 'Department', type: 'select', required: true, options: [{ value: '', label: 'Select…' }, ...E.idOptions(depts)] }) : ''}
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true })}
        ${E.field({ name: 'store', label: 'Store / account', value: e.store, placeholder: 'Optional, e.g. store name' })}
        ${E.field({ name: 'orders', label: 'Orders received', type: 'number', value: e.orders, attrs: 'min="0" step="1"' })}
        ${E.field({ name: 'investment', label: 'Investment (stock / ads)', type: 'number', value: e.investment, attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'revenue', label: 'Sales (revenue)', type: 'number', value: e.revenue, attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'expenses', label: 'Other expenses (fees, shipping…)', type: 'number', value: e.expenses, attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'note', label: 'Note', value: e.note, full: true })}
        <div class="full muted small">Profit = Sales − Investment − Other expenses (calculated automatically).</div>
        ${extra.html}</div>`,
      onSubmit: async (v, { close }) => {
        if (existing) await E.put(`/api/finance/${existing.id}`, v); else await E.post('/api/finance', v);
        E.toast('Saved');
        close();
        onSaved();
      },
    });
  }

  E.page({
    id: 'finance', title: 'Finance', icon: '$', roles: ['admin', 'leader'], group: 'Insights', order: 10,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Finance', subtitle: 'Orders, investment, sales and profit.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Add entry</button>`,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Store / note', placeholder: 'Search' },
        ],
        csv: (f) => `/api/finance${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/finance${E.qs(f)}`);
          rows = r.rows;
          const t = r.totals;
          return html`<div class="stats">
            ${E.stat('Orders', fmt.num(t.orders))}${E.stat('Investment', fmt.money(t.investment))}${E.stat('Sales', fmt.money(t.revenue))}${E.stat('Other expenses', fmt.money(t.expenses))}
            ${E.stat('Profit', fmt.money(t.profit), { cls: t.profit < 0 ? 'bad' : 'accent', sub: t.margin != null ? `${t.margin}% margin` : '' })}
            ${E.stat('ROI', t.roi != null ? `${t.roi}%` : '-', { sub: 'profit ÷ (investment + expenses)' })}</div>
            ${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, ...(E.isAdmin() ? [{ label: 'Department', key: 'departmentName' }] : []),
              { label: 'Store', render: (x) => x.store || '-' }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
              { label: 'Investment', class: 'num', render: (x) => fmt.money(x.investment) }, { label: 'Sales', class: 'num', render: (x) => fmt.money(x.revenue) },
              { label: 'Expenses', class: 'num', render: (x) => fmt.money(x.expenses) }, { label: 'Profit', class: 'num', render: (x) => money(x.profit) },
              { label: 'Note', class: 'wrap', render: (x) => x.note || '' },
              { label: '', class: 'right', render: (x) => html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${x.id}">Delete</button></div>` },
            ], rows, 'No finance entries for this period.')}`;
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => entryForm(rows.find((x) => String(x.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this finance entry? This is recorded in the activity log.', { yes: 'Delete', danger: true })) { await E.del(`/api/finance/${id}`); E.toast('Entry deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => entryForm(null, ctrl.refresh) });
    },
  });
})();
