(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const profitCell = (n) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${fmt.money(n)}</span>`;
  const totalsStats = (t) => html`<div class="stats">${E.stat('Orders', fmt.num(t.orders))}${E.stat('Investment', fmt.money(t.investment))}${E.stat('Sales', fmt.money(t.revenue), { cls: 'accent' })}
    ${E.stat('Profit', fmt.money(t.profit), { cls: t.profit < 0 ? 'bad' : 'accent', sub: 'sales − investment' })}</div>`;

  // ---------------- member: report my orders ----------------
  function orderForm(o, onSaved) {
    const e = o || { date: E.today() };
    E.modal({
      title: o ? 'Edit orders report' : 'Report orders',
      body: html`<div class="form">
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true, attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'store', label: 'Store / account', value: e.store, placeholder: 'Optional' })}
        ${E.field({ name: 'orders', label: 'Orders received', type: 'number', value: e.orders ?? '', attrs: 'min="0" step="1"', required: true })}
        ${E.field({ name: 'investment', label: 'Investment (stock / ads)', type: 'number', value: e.investment ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'revenue', label: 'Sales (money earned)', type: 'number', value: e.revenue ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'note', label: 'Note', value: e.note, full: true })}</div>
        <p class="muted small">Your team leader and the admin can see this. You can change an entry for 7 days.</p>`,
      onSubmit: async (v, { close }) => {
        if (o) await E.put(`/api/orders/${o.id}`, v); else await E.post('/api/orders', v);
        E.toast('Saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'my-orders', title: 'My Orders', icon: '▤', roles: ['member'], order: 8,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'My orders & sales', subtitle: 'Tell your team how many orders came, how much was invested and how much was sold.',
        actions: html`<button class="btn primary" data-act="add">+ Report orders</button>`,
        filters: [{ name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() }],
        load: async (f) => {
          const r = await E.get(`/api/orders/me${E.qs(f)}`);
          rows = r.rows;
          return html`${totalsStats(r.totals)}${E.table([
            { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Store', render: (x) => x.store || '-' }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
            { label: 'Investment', class: 'num', render: (x) => fmt.money(x.investment) }, { label: 'Sales', class: 'num', render: (x) => fmt.money(x.revenue) },
            { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) }, { label: 'Note', class: 'wrap', render: (x) => x.note || '' },
            { label: '', class: 'right', render: (x) => html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${x.id}">Delete</button></div>` },
          ], rows, 'You have not reported any orders in this period.')}`;
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => orderForm(rows.find((x) => String(x.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this entry?', { yes: 'Delete', danger: true })) { await E.del(`/api/orders/${id}`); E.toast('Deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => orderForm(null, ctrl.refresh) });
    },
  });

  // ---------------- leader / admin: what members reported ----------------
  E.page({
    id: 'orders', title: 'Member Orders', icon: '▤', roles: ['admin', 'leader'], group: 'Operations', order: 15,
    async render(el) {
      const teams = await E.teams(E.isAdmin() ? '' : E.user.departmentId);
      await E.listPage(el, {
        title: 'Member orders & sales', subtitle: 'Orders, investment and sales reported by each team member.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Search', placeholder: 'Member or store' },
          { name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...E.idOptions(teams)] },
        ],
        csv: (f) => `/api/orders${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/orders${E.qs(f)}`);
          return html`${totalsStats(r.totals)}
            <h3 style="margin:0 0 10px">By member</h3>${E.table([
              { label: 'Member', render: (x) => html`<b>${x.name}</b><div class="muted small">${x.empCode}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Investment', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'Sales', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) },
              { label: 'Entries', class: 'num', key: 'entries' },
            ], r.byEmployee, 'No orders were reported in this period.')}
            <h3 style="margin:22px 0 10px">All entries</h3>${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Member', render: (x) => html`<b>${x.employeeName}</b><div class="muted small">${x.teamName || 'No team'}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Store', render: (x) => x.store || '-' }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
              { label: 'Investment', class: 'num', render: (x) => fmt.money(x.investment) }, { label: 'Sales', class: 'num', render: (x) => fmt.money(x.revenue) },
              { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) }, { label: 'Note', class: 'wrap', render: (x) => x.note || '' },
            ], r.rows, 'Nothing here yet.')}`;
        },
      });
    },
  });
})();
