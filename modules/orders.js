(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const profitCell = (n) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${fmt.money(n)}</span>`;
  const totalsStats = (t) => html`<div class="stats">${E.stat('Orders received', fmt.num(t.orders))}${E.stat('Purchasing cost', fmt.money(t.investment))}${E.stat('Total sales', fmt.money(t.revenue), { cls: 'accent' })}
    ${E.stat('Profit', fmt.money(t.profit), { cls: t.profit < 0 ? 'bad' : 'accent', sub: 'total sales − purchasing cost' })}</div>`;
  const dash = (v) => v || html`<span class="muted">-</span>`;

  // ---------------- member: my daily report ----------------
  function orderForm(o, onSaved) {
    const e = o || { date: E.today() };
    E.modal({
      title: o ? 'Edit daily report' : 'Daily report', wide: true,
      body: html`<div class="form">
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true, attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'market', label: 'Market', value: e.market, placeholder: 'e.g. Amazon US, eBay UK' })}
        ${E.field({ name: 'store', label: 'Store Name', value: e.store, placeholder: 'Your store or account' })}
        ${E.field({ name: 'orders', label: 'Orders Received', type: 'number', value: e.orders ?? '', attrs: 'min="0" step="1"', required: true })}
        ${E.field({ name: 'investment', label: 'Purchasing Cost', type: 'number', value: e.investment ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'revenue', label: 'Total Sales', type: 'number', value: e.revenue ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'note', label: 'Notes / Activities', type: 'textarea', value: e.note, full: true, placeholder: 'Important updates, activities or issues about the store, account, orders or sales', attrs: 'rows="4"' })}</div>
        <p class="muted small">Your team leader, your head of department and the admin can see this. You can change an entry for 7 days.</p>`,
      onSubmit: async (v, { close }) => {
        if (o) await E.put(`/api/orders/${o.id}`, v); else await E.post('/api/orders', v);
        E.toast('Saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'my-orders', title: 'Daily Reports', icon: '▤', roles: ['member'], order: 8,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Daily Reports', subtitle: 'My orders & sales: tell your team the market and store, how many orders came, what you paid to buy and what was sold.',
        actions: html`<button class="btn primary" data-act="add">+ Add daily report</button>`,
        filters: [{ name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() }],
        load: async (f) => {
          const r = await E.get(`/api/orders/me${E.qs(f)}`);
          rows = r.rows;
          return html`${totalsStats(r.totals)}${E.table([
            { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Market', render: (x) => dash(x.market) }, { label: 'Store Name', render: (x) => dash(x.store) },
            { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
            { label: 'Purchasing Cost', class: 'num', render: (x) => fmt.money(x.investment) }, { label: 'Total Sales', class: 'num', render: (x) => fmt.money(x.revenue) },
            { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) }, { label: 'Notes / Activities', class: 'wrap', render: (x) => x.note || '' },
            { label: '', class: 'right', render: (x) => html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${x.id}">Delete</button></div>` },
          ], rows, 'You have not added any daily report in this period.')}`;
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => orderForm(rows.find((x) => String(x.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this entry?', { yes: 'Delete', danger: true })) { await E.del(`/api/orders/${id}`); E.toast('Deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => orderForm(null, ctrl.refresh) });
    },
  });

  // ---------------- leader / head / admin: what members reported ----------------
  E.page({
    id: 'orders', title: 'Member Daily Reports', icon: '▤', roles: E.MANAGE, group: 'Operations', order: 15,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      await E.listPage(el, {
        title: 'Member daily reports', subtitle: 'Market, store, orders, purchasing cost, total sales and notes reported by each team member.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Search', placeholder: 'Member, market or store' },
          ...(E.isLeader() ? [] : [{ name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name }))] }]),
        ],
        csv: (f) => `/api/orders${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/orders${E.qs(f)}`);
          return html`${totalsStats(r.totals)}
            ${r.byTeam.length > 1 ? html`<h3 style="margin:0 0 10px">By team</h3>${E.table([
              { label: 'Team', render: (x) => html`<b>${x.name}</b>` }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Purchasing cost', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'Total sales', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) },
            ], r.byTeam)}<div style="height:22px"></div>` : ''}
            <h3 style="margin:0 0 10px">By member</h3>${E.table([
              { label: 'Member', render: (x) => html`<b>${x.name}</b><div class="muted small">${x.empCode}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Purchasing cost', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'Total sales', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) },
              { label: 'Entries', class: 'num', key: 'entries' },
            ], r.byEmployee, 'No reports were added in this period.')}
            <h3 style="margin:22px 0 10px">All daily reports</h3>${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Member', render: (x) => html`<b>${x.employeeName}</b><div class="muted small">${x.teamName || 'No team'}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Market', render: (x) => dash(x.market) }, { label: 'Store Name', render: (x) => dash(x.store) }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
              { label: 'Purchasing Cost', class: 'num', render: (x) => fmt.money(x.investment) }, { label: 'Total Sales', class: 'num', render: (x) => fmt.money(x.revenue) },
              { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) }, { label: 'Notes / Activities', class: 'wrap', render: (x) => x.note || '' },
            ], r.rows, 'Nothing here yet.')}`;
        },
      });
    },
  });
})();
