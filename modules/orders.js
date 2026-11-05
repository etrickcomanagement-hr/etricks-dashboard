(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  // ---------------- money in three currencies ----------------
  const CUR_LABEL = { AUD: 'AUD $', USD: 'USD $', GBP: 'GBP £' };
  const CUR_OPTS = ['AUD', 'USD', 'GBP'].map((c) => ({ value: c, label: CUR_LABEL[c] }));
  const moneyIn = (n, cur) => {
    if (n === null || n === undefined || n === '') return '-';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(n); } catch { return Number(n).toFixed(2); }
  };
  const profitCell = (n, cur) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${cur ? moneyIn(n, cur) : fmt.money(n)}</span>`;
  const dash = (v) => v || html`<span class="muted">-</span>`;

  // Totals are in the company currency; a small line says so and lists each currency on its own when more than one is used.
  const totalsStats = (t) => html`<div class="stats">${E.stat('Orders received', fmt.num(t.orders))}${E.stat('Purchasing cost', fmt.money(t.investment))}${E.stat('Total sales', fmt.money(t.revenue), { cls: 'accent' })}
    ${E.stat('Profit', fmt.money(t.profit), { cls: t.profit < 0 ? 'bad' : 'accent', sub: 'total sales − purchasing cost' })}</div>${mixNote(t.byCurrency)}`;
  const mixNote = (by) => {
    const keys = Object.keys(by || {});
    if (keys.length < 2) return '';
    return html`<p class="muted small" style="margin:-6px 0 14px">Mixed currencies: the totals above are converted to ${E.settings.currency} with the exchange rates the admin set.
      ${keys.map((c, i) => html`${i ? ' · ' : ' '}<b>${CUR_LABEL[c] || c}</b>: sales ${moneyIn(by[c].revenue, c)}, cost ${moneyIn(by[c].investment, c)}`)}</p>`;
  };

  // A page that refreshes itself quietly while it is open.
  const freshTimers = {};
  const keepFresh = (id, refresh, ms) => {
    clearInterval(freshTimers[id]);
    const t = freshTimers[id] = setInterval(() => { if (location.hash !== `#/${id}` || !document.getElementById('view')) clearInterval(t); else refresh(true); }, ms);
  };

  // ---------------- a safe calculator for the number cells: 12*3.5+4, =(100-20)/4 ... ----------------
  function calc(text) {
    let s = String(text ?? '').trim();
    if (!s) return 0;
    if (s[0] === '=') s = s.slice(1);
    s = s.replace(/[\s,$£]/g, '');
    if (!s || !/^[0-9+\-*/().]+$/.test(s)) return NaN;
    let i = 0;
    const number = () => { const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) throw new Error('n'); i += m[0].length; return Number(m[0]); };
    const factor = () => {
      if (s[i] === '-') { i++; return -factor(); }
      if (s[i] === '+') { i++; return factor(); }
      if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw new Error(')'); i++; return v; }
      return number();
    };
    const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
    const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
    try { const v = expr(); return i === s.length && Number.isFinite(v) ? v : NaN; } catch { return NaN; }
  }
  const money2 = (v) => Math.round(v * 100) / 100;

  // ---------------- the form (also used on a phone) ----------------
  function orderForm(o, ctx, onSaved) {
    const e = o || { date: E.today(), currency: ctx.lastCurrency || 'USD' };
    E.modal({
      title: o ? 'Edit daily report' : 'Daily report', wide: true,
      body: html`<div class="form">
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true, attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'currency', label: 'Currency', type: 'select', value: e.currency || 'USD', options: CUR_OPTS, required: true })}
        ${E.field({ name: 'market', label: 'Market', value: e.market, placeholder: 'e.g. Amazon US, eBay UK' })}
        ${E.field({ name: 'store', label: 'Store Name', value: e.store, placeholder: 'Your store or account' })}
        ${ctx.clients.length || e.clientId ? E.field({ name: 'clientId', label: 'Client (the client sees this row)', type: 'select', value: e.clientId ?? '', options: [{ value: '', label: 'No client (internal only)' }, ...clientOpts(ctx.clients, e)] }) : ''}
        ${E.field({ name: 'orders', label: 'Orders Received', type: 'number', value: e.orders ?? '', attrs: 'min="0" step="1"', required: true })}
        ${E.field({ name: 'investment', label: 'Purchasing Cost', type: 'number', value: e.investment ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'revenue', label: 'Total Sales', type: 'number', value: e.revenue ?? '', attrs: 'min="0" step="0.01"' })}
        ${ctx.columns.map((c) => E.field({ name: `x_${c.id}`, label: c.label, type: c.kind === 'number' ? 'number' : 'text', value: e.extra?.[c.id] ?? '', attrs: c.kind === 'number' ? 'step="any"' : '' }))}
        ${E.field({ name: 'note', label: 'Notes / Activities', type: 'textarea', value: e.note, full: true, placeholder: 'Important updates, activities or issues about the store, account, orders or sales', attrs: 'rows="4"' })}</div>
        <p class="muted small">${E.user.role === 'leader' ? 'Your head of department and the admin can see this.' : 'Your team leader, your head of department and the admin can see this.'} The client you pick sees the row (not the notes). You can change an entry for ${ctx.editDays || 7} days.</p>`,
      onSubmit: async (v, { close }) => {
        const body = { extra: {} };
        for (const [k, val] of Object.entries(v)) { if (k.startsWith('x_')) body.extra[k.slice(2)] = val; else body[k] = val; }
        body.clientId = body.clientId || null;
        if (o) await E.put(`/api/orders/${o.id}`, body); else await E.post('/api/orders', body);
        E.toast('Saved'); close(); onSaved();
      },
    });
  }
  const clientOpts = (clients, row) => {
    const list = clients.map((c) => ({ value: c.id, label: c.username }));
    if (row?.clientId && !list.some((c) => String(c.value) === String(row.clientId))) list.push({ value: row.clientId, label: row.clientUsername || row.clientName || 'Client' });
    return list;
  };

  function columnModal(col, onDone) {
    const { form, close } = E.modal({
      title: col ? `Column "${col.label}"` : 'Add a column', submit: 'Save',
      body: html`<p class="muted small">Your own column in your daily sheet, for anything the standard ones do not cover (up to 6). Your team leader, head and admin see it too.</p>
        <div class="form">${E.field({ name: 'label', label: 'Column name', value: col?.label, required: true, full: true, attrs: 'maxlength="30"' })}
        ${E.field({ name: 'kind', label: 'Type', type: 'select', value: col?.kind || 'text', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }], attrs: col ? 'disabled' : '' })}
        ${E.field({ name: 'clientVisible', label: 'Show this column to the client', type: 'checkbox', value: col?.clientVisible })}</div>
        ${col ? html`<div style="margin-top:14px"><button type="button" class="btn danger sm" id="delCol">Delete this column and its values</button></div>` : ''}`,
      onSubmit: async (v, { close: c }) => {
        const body = { label: v.label, clientVisible: !!v.clientVisible, ...(col ? {} : { kind: v.kind }) };
        if (col) await E.put(`/api/orders/columns/${col.id}`, body); else await E.post('/api/orders/columns', body);
        c(); onDone();
      },
    });
    const del = E.$('#delCol', form);
    if (del) del.onclick = async () => {
      if (!(await E.confirm(`Delete the column "${col.label}" and everything written in it?`, { yes: 'Delete', danger: true }))) return;
      try { await E.del(`/api/orders/columns/${col.id}`); close(); E.toast('Column deleted'); onDone(); } catch (ex) { E.toast(ex.message, 'bad'); }
    };
  }

  // ====================================================================================
  // MEMBER / LEADER: my daily sheet (saves itself while typing)
  // ====================================================================================
  const FIELDS_TEXT = ['market', 'store', 'note'];
  const SORTABLE = ['date', 'market', 'store', 'orders', 'investment', 'revenue', 'profit'];
  const STATUS = { saved: ['✓', 'Saved', 'ok'], saving: ['…', 'Saving', 'wait'], dirty: ['•', 'Not saved yet', 'wait'], error: ['⚠', 'Not saved', 'bad'], locked: ['🔒', 'Older than the editing window: ask your team leader', 'lock'], draft: ['', 'Empty row', ''] };

  async function mySheet(el) {
    let state = { rows: [], columns: [], clients: [], fx: { USD: 1, AUD: 0.65, GBP: 1.27 }, editDays: 7, serverTotals: null };
    let from = E.monthStart();
    let to = E.today();
    let sort = { f: 'date', dir: 1 };
    let seq = 0;
    let box;

    const locked = (r) => !!r.id && r.savedDate < E.addDays(E.today(), -state.editDays); // by the date stored on the server
    const fromServer = (r) => ({
      k: ++seq, id: r.id, date: r.date, savedDate: r.date, market: r.market || '', store: r.store || '', clientId: r.clientId ?? '', clientName: r.clientUsername || '', currency: r.currency || 'USD',
      orders: r.orders ? String(r.orders) : '', investment: r.investment ? String(r.investment) : '', revenue: r.revenue ? String(r.revenue) : '', note: r.note || '',
      extra: Object.fromEntries(Object.entries(r.extra || {}).map(([k, v]) => [k, String(v)])), st: 'saved', err: '',
    });
    const lastCurrency = () => state.rows.at(-1)?.currency || 'USD';

    // ---- numbers of a row, read from what is typed ----
    const sales = (r) => calc(r.revenue);
    const cost = (r) => calc(r.investment);
    const profitOf = (r) => { const a = sales(r); const b = cost(r); return Number.isNaN(a) || Number.isNaN(b) ? null : money2(a - b); };
    const conv = (n, cur) => n * (state.fx[cur] ?? 1);
    const sum = () => {
      let orders = 0; let investment = 0; let revenue = 0; const by = {};
      for (const r of state.rows) {
        const o = calc(r.orders); const c = cost(r); const s = sales(r);
        if ([o, c, s].some(Number.isNaN)) continue;
        orders += o; investment += conv(c, r.currency); revenue += conv(s, r.currency);
        const b = (by[r.currency] ||= { investment: 0, revenue: 0 }); b.investment += c; b.revenue += s;
      }
      return { orders, investment: money2(investment), revenue: money2(revenue), profit: money2(revenue - investment), byCurrency: by };
    };

    // ---- turning a row into what the server takes ----
    const payload = (r) => {
      const orders = calc(r.orders); const inv = cost(r); const rev = sales(r);
      if (Number.isNaN(orders) || !Number.isInteger(orders) || orders < 0) return { err: 'Orders must be a whole number' };
      if (Number.isNaN(inv) || inv < 0) return { err: 'Purchasing cost is not a valid amount' };
      if (Number.isNaN(rev) || rev < 0) return { err: 'Total sales is not a valid amount' };
      const extra = {};
      for (const c of state.columns) {
        const raw = (r.extra[c.id] ?? '').trim();
        if (!raw) continue;
        if (c.kind === 'number') { const n = calc(raw); if (Number.isNaN(n)) return { err: `${c.label} must be a number` }; extra[c.id] = n; } else extra[c.id] = raw;
      }
      return { body: { date: r.date, market: r.market, store: r.store, currency: r.currency, clientId: r.clientId || null, orders, investment: money2(inv), revenue: money2(rev), note: r.note, extra } };
    };
    const meaningful = (r) => {
      const p = payload(r);
      if (p.err) return true; // let the person see the message
      const b = p.body;
      return !!(b.orders || b.investment || b.revenue || (b.note || '').trim() || (b.market || '').trim() || (b.store || '').trim() || Object.keys(b.extra).length);
    };
    const pendingCount = () => state.rows.filter((r) => ['dirty', 'saving'].includes(r.st)).length;

    // ---- saving ----
    const alive = () => document.body.contains(box);
    async function flush(r) {
      clearTimeout(r.timer);
      if (locked(r)) return;
      if (!meaningful(r)) {
        if (r.id) { r.st = 'error'; r.err = 'A saved row cannot be empty. Fill it in or delete the row.'; } else { r.st = 'draft'; r.err = ''; }
        if (alive()) paintRow(r);
        return;
      }
      if (r.busy) { r.again = true; return; }
      const p = payload(r);
      if (p.err) { r.st = 'error'; r.err = p.err; if (alive()) paintRow(r); return; }
      r.busy = true; r.again = false; r.st = 'saving'; r.err = ''; if (alive()) paintRow(r);
      try {
        if (r.id) await E.put(`/api/orders/${r.id}`, p.body); else r.id = (await E.post('/api/orders', p.body)).id;
        r.st = 'saved'; r.savedDate = p.body.date;
      } catch (ex) {
        r.st = 'error'; r.err = ex.message;
        if (alive()) E.toast(ex.message, 'bad');
      } finally {
        r.busy = false;
        if (r.again) { r.again = false; if (r.st !== 'error') flush(r); }
        if (alive()) { if (r.st === 'saved' && locked(r)) draw(); else paintRow(r); } // a row saved with an old date is locked from now on
      }
    }
    const schedule = (r, ms = 800) => { if (locked(r)) return; r.st = 'dirty'; r.err = ''; clearTimeout(r.timer); r.timer = setTimeout(() => flush(r), ms); };
    window.onbeforeunload = () => (pendingCount() ? 'Some changes are still being saved.' : undefined);

    // ---- drawing ----
    const rowOf = (k) => state.rows.find((r) => String(r.k) === String(k));
    const trOf = (r) => box.querySelector(`tr[data-k="${r.k}"]`);
    function paintRow(r, skipTotals) {
      const tr = trOf(r); if (!tr) return;
      const st = locked(r) ? STATUS.locked : STATUS[r.st] || STATUS.saved;
      const cell = tr.querySelector('.st');
      cell.className = `st ${st[2]}`; cell.textContent = st[0]; cell.title = r.err || st[1];
      const p = profitOf(r);
      tr.querySelector('.profit').innerHTML = p === null ? '-' : `<span class="${p < 0 ? 'neg' : 'pos'}">${moneyIn(p, r.currency)}</span>`;
      for (const inp of tr.querySelectorAll('input[data-f]')) {
        const f = inp.dataset.f;
        const isNum = ['orders', 'investment', 'revenue'].includes(f) || f.startsWith('x:') && state.columns.find((c) => String(c.id) === f.slice(2))?.kind === 'number';
        inp.classList.toggle('bad', isNum && Number.isNaN(calc(inp.value)));
      }
      if (!skipTotals) paintTotals();
    }
    function paintTotals() {
      const t = sum();
      const s = E.$('#sheetstats', el);
      if (s) E.mount(s, totalsStats({ ...t, byCurrency: t.byCurrency }));
      const set = (id, v) => { const n = box.querySelector(id); if (n) n.textContent = v; };
      set('#tf-orders', fmt.num(t.orders)); set('#tf-cost', fmt.money(t.investment)); set('#tf-sales', fmt.money(t.revenue)); set('#tf-profit', fmt.money(t.profit));
    }
    const cmp = (a, b) => {
      const v = (r) => (sort.f === 'profit' ? (profitOf(r) ?? -Infinity) : ['orders', 'investment', 'revenue'].includes(sort.f) ? (calc(r[sort.f]) || 0) : String(r[sort.f] ?? '').toLowerCase());
      const x = v(a); const y = v(b);
      return (x < y ? -1 : x > y ? 1 : a.k - b.k) * sort.dir;
    };
    const head = (f, label, extra = '') => html`<th class="${SORTABLE.includes(f) ? 'sortable' : ''} ${extra}" data-sort="${SORTABLE.includes(f) ? f : ''}">${label}${sort.f === f ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    function rowHtml(r) {
      const dis = locked(r);
      const ro = dis ? E.raw('readonly') : '';
      const text = (f, cls = '') => html`<td><input class="cell ${cls}" data-f="${f}" value="${r[f]}" ${ro} autocomplete="off"></td>`;
      const sel = (f, opts) => html`<td><select class="cell" data-f="${f}" ${dis ? E.raw('disabled') : ''}>${opts.map((o) => html`<option value="${o.value}" ${String(o.value) === String(r[f]) ? E.raw('selected') : ''}>${o.label}</option>`)}</select></td>`;
      const num = (f) => html`<td class="num"><input class="cell num" data-f="${f}" value="${r[f]}" inputmode="decimal" ${ro} autocomplete="off" placeholder="0"></td>`;
      return html`<tr data-k="${r.k}" class="${dis ? 'locked' : ''}">
        <td><input class="cell" type="date" data-f="date" value="${r.date}" max="${E.today()}" ${ro}></td>${text('market')}${text('store')}
        ${state.clients.length || r.clientId ? sel('clientId', [{ value: '', label: '-' }, ...clientOpts(state.clients, r)]) : ''}
        ${sel('currency', CUR_OPTS)}${num('orders')}${num('investment')}${num('revenue')}
        <td class="num profit"></td>
        ${state.columns.map((c) => html`<td class="${c.kind === 'number' ? 'num' : ''}"><input class="cell ${c.kind === 'number' ? 'num' : ''}" data-f="x:${c.id}" value="${r.extra[c.id] ?? ''}" ${ro} autocomplete="off"></td>`)}
        ${text('note', 'wide')}
        <td class="st"></td><td class="x">${dis ? '' : html`<button type="button" class="iconbtn" data-del="${r.k}" title="Delete this row" aria-label="Delete this row">✕</button>`}</td></tr>`;
    }
    function draw() {
      const rows = [...state.rows].sort(cmp);
      const showClient = state.clients.length || state.rows.some((r) => r.clientId);
      E.mount(box, html`<div class="sheetwrap"><table class="sheet">
        <thead><tr>${head('date', 'Date')}${head('market', 'Market')}${head('store', 'Store name')}${showClient ? html`<th>Client</th>` : ''}<th>Currency</th>${head('orders', 'Orders received', 'num')}${head('investment', 'Purchasing cost', 'num')}${head('revenue', 'Total sales', 'num')}${head('profit', 'Profit', 'num')}
          ${state.columns.map((c) => html`<th class="col" data-col="${c.id}" title="Click to rename or delete this column">${c.label}${c.clientVisible ? ' 👁' : ''}</th>`)}<th>Notes / activities</th><th></th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml)}</tbody>
        <tfoot><tr><td colspan="${showClient ? 5 : 4}">Total <span class="muted small">(in ${E.settings.currency})</span></td><td class="num" id="tf-orders"></td><td class="num" id="tf-cost"></td><td class="num" id="tf-sales"></td><td class="num" id="tf-profit"></td><td colspan="${state.columns.length + 3}"></td></tr></tfoot>
      </table></div>${rows.length ? '' : html`<div class="muted center" style="padding:22px 0">Your sheet is empty. Press <b>+ Add row</b> and start typing: everything is saved by itself.</div>`}`);
      for (const r of state.rows) paintRow(r, true);
      paintTotals();
    }

    // ---- loading ----
    async function load() {
      const r = await E.get(`/api/orders/me${E.qs({ from, to })}`);
      state = { ...state, columns: r.columns, clients: r.clients, fx: r.fx, editDays: r.editDays || 7, rows: r.rows.map(fromServer).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) };
      const csv = E.$('#csv', el); if (csv) csv.href = `/api/orders/me${E.qs({ from, to, format: 'csv' })}`;
      draw();
    }
    const flushAll = async () => { await Promise.all(state.rows.filter((r) => ['dirty', 'error'].includes(r.st)).map(flush)); };

    // ---- adding rows ----
    function addRow(preset = {}, focus = 'market') {
      const prev = state.rows.at(-1);
      const r = { k: ++seq, id: null, date: E.today(), market: '', store: preset.store ?? '', clientId: prev?.clientId ?? '', clientName: '', currency: lastCurrency(), orders: '', investment: '', revenue: '', note: '', extra: {}, st: 'draft', err: '', ...preset };
      state.rows.push(r);
      if (sort.f === 'date' && sort.dir > 0) { draw(); } else { sort = { f: 'date', dir: 1 }; draw(); }
      box.querySelector(`tr[data-k="${r.k}"] [data-f="${focus}"]`)?.focus();
      box.querySelector(`tr[data-k="${r.k}"]`)?.scrollIntoView({ block: 'nearest' });
      return r;
    }

    // ---- pasting cells from Excel / Google Sheets ----
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const ymd = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; };
    function parseDate(t) {
      t = String(t).trim();
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (m) return ymd(+m[1], +m[2], +m[3]);
      m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t); if (m) return ymd(+m[3], +m[2], +m[1]); // day first: 5/11/2026 is 5 November
      m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(t); if (m && MONTHS.includes(m[2].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
      return null;
    }
    async function pasteRows(text) {
      const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
      const cells = lines.map((l) => l.split('\t').map((c) => c.trim()));
      if (cells.length && !parseDate(cells[0][0])) cells.shift(); // a header line
      if (!cells.length) return E.toast('Nothing to paste: the first cell of each line must be a date', 'bad');
      const bad = cells.findIndex((c) => !parseDate(c[0]));
      if (bad >= 0) return E.toast(`Line ${bad + 1}: "${cells[bad][0]}" is not a date (use 2026-11-05 or 5/11/2026)`, 'bad');
      if (cells.length > 100) return E.toast('Paste up to 100 rows at a time', 'bad');
      if (!(await E.confirm(`Add ${cells.length} row${cells.length === 1 ? '' : 's'} from the pasted cells? The columns must be: Date, Market, Store name, Currency, Orders, Purchasing cost, Total sales, Notes.`, { yes: 'Add rows' }))) return;
      await flushAll();
      let ok = 0; const errors = [];
      for (const [i, c] of cells.entries()) {
        const cur = (c[3] || '').toUpperCase();
        const body = { date: parseDate(c[0]), market: c[1] || '', store: c[2] || '', currency: ['AUD', 'USD', 'GBP'].includes(cur) ? cur : lastCurrency(), orders: calc(c[4] || 0), investment: calc(c[5] || 0), revenue: calc(c[6] || 0), note: c[7] || '' };
        if ([body.orders, body.investment, body.revenue].some(Number.isNaN)) { errors.push(`Line ${i + 1}: a number is not valid`); continue; }
        try { await E.post('/api/orders', { ...body, orders: Math.round(body.orders), investment: money2(body.investment), revenue: money2(body.revenue) }); ok++; } catch (ex) { errors.push(`Line ${i + 1}: ${ex.message}`); }
      }
      await load();
      E.toast(errors.length ? `${ok} added, ${errors.length} not added. ${errors[0]}` : `${ok} row${ok === 1 ? '' : 's'} added`, errors.length ? 'bad' : undefined);
    }

    // ---- the page ----
    E.mount(el, html`${E.pageHead('Daily Reports', 'My orders & sales as a sheet. Type in the cells: everything saves by itself. Your team leader, head of department and admin see it live, and so does a client you tag a row with.',
        html`<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="form">Add with a form</button><button class="btn" data-act="column">+ Column</button><a class="btn" id="csv" href="#">Export CSV</a><button class="btn primary" data-act="row">+ Add row</button></div>`)}
      <form class="filters" id="range">${E.field({ name: 'from', label: 'From', type: 'date', value: from })}${E.field({ name: 'to', label: 'To', type: 'date', value: to })}</form>
      <div id="sheetstats"></div><div id="sheetbox"></div>
      <p class="muted small">Tips: <b>Enter</b> moves down, <b>Tab</b> moves right. Number cells accept sums like <code>=12*3.5+4</code>. Paste cells from Excel or Google Sheets (Date, Market, Store, Currency, Orders, Cost, Sales, Notes). Rows older than ${state.editDays} days are locked. Click a column name of your own to rename or delete it.</p>`);
    box = E.$('#sheetbox', el);

    E.actions(el, {
      row: () => addRow(),
      form: async () => { await flushAll(); orderForm(null, { clients: state.clients, columns: state.columns, editDays: state.editDays, lastCurrency: lastCurrency() }, load); },
      column: () => columnModal(null, async () => { await flushAll(); await load(); }),
    });
    E.$('#range', el).addEventListener('change', async (ev) => {
      const f = E.readForm(ev.currentTarget);
      if (!f.from || !f.to || f.from > f.to) return;
      await flushAll(); from = f.from; to = f.to;
      try { await load(); } catch (ex) { E.toast(ex.message, 'bad'); }
    });

    box.addEventListener('input', (ev) => {
      const t = ev.target.closest('[data-f]'); if (!t) return;
      const r = rowOf(t.closest('tr').dataset.k); if (!r || locked(r)) return;
      const f = t.dataset.f;
      if (f.startsWith('x:')) r.extra[f.slice(2)] = t.value; else r[f] = t.value;
      schedule(r); paintRow(r);
    });
    box.addEventListener('change', (ev) => {
      const t = ev.target.closest('[data-f]'); if (!t) return;
      const r = rowOf(t.closest('tr').dataset.k); if (!r || locked(r)) return;
      const f = t.dataset.f;
      if (t.tagName === 'SELECT' || t.type === 'date') { r[f] = t.value; if (f === 'currency') { /* other cells keep their numbers: only the currency changes */ } }
      // a number cell shows the result of a typed sum when the person leaves it
      const isNum = ['orders', 'investment', 'revenue'].includes(f) || (f.startsWith('x:') && state.columns.find((c) => String(c.id) === f.slice(2))?.kind === 'number');
      if (isNum && t.value.trim()) { const v = calc(t.value); if (!Number.isNaN(v)) { const shown = f === 'orders' ? String(v) : String(money2(v)); t.value = shown; if (f.startsWith('x:')) r.extra[f.slice(2)] = shown; else r[f] = shown; } }
      schedule(r, 50);
    });
    box.addEventListener('keydown', (ev) => {
      const t = ev.target.closest('input[data-f]'); if (!t) return;
      const dir = ev.key === 'Enter' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
      if (!dir || (t.type === 'date' && ev.key !== 'Enter') || ev.shiftKey || ev.isComposing) return;
      const trs = [...box.querySelectorAll('tbody tr')];
      const i = trs.indexOf(t.closest('tr'));
      const next = trs[i + dir];
      ev.preventDefault();
      if (next) next.querySelector(`[data-f="${t.dataset.f}"]`)?.focus();
      else if (dir > 0 && ev.key === 'Enter') { const cur = rowOf(t.closest('tr').dataset.k); if (cur && meaningful(cur)) addRow({}, t.dataset.f); }
    });
    box.addEventListener('paste', (ev) => {
      const text = ev.clipboardData?.getData('text') || '';
      if (!/[\t\n]/.test(text.trim())) return; // an ordinary paste into one cell
      ev.preventDefault();
      pasteRows(text);
    });
    box.addEventListener('click', async (ev) => {
      const th = ev.target.closest('th[data-sort]');
      if (th && th.dataset.sort) { sort = { f: th.dataset.sort, dir: sort.f === th.dataset.sort ? -sort.dir : 1 }; draw(); return; }
      const col = ev.target.closest('th[data-col]');
      if (col) { columnModal(state.columns.find((c) => String(c.id) === col.dataset.col), async () => { await flushAll(); await load(); }); return; }
      const del = ev.target.closest('[data-del]');
      if (del) {
        const r = rowOf(del.dataset.del); if (!r) return;
        if (r.busy) return E.toast('Saving this row, try again in a moment', 'bad');
        if (r.id && !(await E.confirm('Delete this row?', { yes: 'Delete', danger: true }))) return;
        try { if (r.id) await E.del(`/api/orders/${r.id}`); clearTimeout(r.timer); state.rows = state.rows.filter((x) => x !== r); draw(); } catch (ex) { E.toast(ex.message, 'bad'); }
      }
    });

    await load();
    if (!state.rows.length) addRow({}, 'market');
  }

  E.page({ id: 'my-orders', title: 'Daily Reports', icon: '▤', roles: ['leader', 'member'], group: E.myGroup, order: 8, render: mySheet });

  // ====================================================================================
  // LEADER / HEAD / ADMIN: what members reported, live
  // ====================================================================================
  const sheetColumns = (cols) => [
    { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Market', render: (x) => dash(x.market) }, { label: 'Store Name', render: (x) => dash(x.store) },
    { label: 'Client', render: (x) => (x.clientUsername ? html`<b>${x.clientUsername}</b>` : html`<span class="muted">-</span>`) },
    { label: 'Currency', render: (x) => CUR_LABEL[x.currency] || x.currency },
    { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
    { label: 'Purchasing Cost', class: 'num', render: (x) => moneyIn(x.investment, x.currency) }, { label: 'Total Sales', class: 'num', render: (x) => moneyIn(x.revenue, x.currency) },
    { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit, x.currency) },
    ...(cols || []).map((c) => ({ label: c.label, render: (x) => dash(x.extra?.[c.id] !== undefined ? String(x.extra[c.id]) : '') })),
    { label: 'Notes / Activities', class: 'wrap', render: (x) => x.note || '' },
  ];

  // One person's sheet, read only, refreshing itself while the window is open.
  function sheetViewer(person) {
    let from = E.monthStart();
    let to = E.today();
    let sig = '';
    const { form } = E.modal({
      title: `${person.name}: daily sheet`, wide: true, cancel: 'Close',
      body: html`<div class="muted small" style="margin-bottom:8px">Read only. It refreshes by itself while this window is open.</div>
        <div class="filters" id="vrange">${E.field({ name: 'from', label: 'From', type: 'date', value: from })}${E.field({ name: 'to', label: 'To', type: 'date', value: to })}</div><div id="viewer"></div>`,
    });
    const overlay = form.closest('.overlay');
    const box = E.$('#viewer', form);
    const pull = async () => {
      if (!document.body.contains(overlay)) { clearInterval(timer); return; }
      let r;
      try { r = await E.get(`/api/orders/sheet/${person.employeeId}${E.qs({ from, to })}`); } catch (ex) { E.mount(box, html`<div class="error">${ex.message}</div>`); return; }
      const next = JSON.stringify([r.rows.map((x) => [x.id, x.updatedAt]), r.columns]);
      if (next === sig) return;
      sig = next;
      E.mount(box, html`${totalsStats(r.totals)}${E.table(sheetColumns(r.columns), r.rows, 'This person has not added any report in this period.')}`);
    };
    const timer = setInterval(pull, 8000);
    E.$('#vrange', form).addEventListener('change', () => { const f = E.readForm(form); if (f.from && f.to && f.from <= f.to) { from = f.from; to = f.to; sig = ''; pull(); } });
    pull();
  }

  E.page({
    id: 'orders', title: 'Team Daily Reports', icon: '▤', roles: E.MANAGE, group: 'Operations', order: 15,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      let people = [];
      const ctrl = await E.listPage(el, {
        title: 'Team daily reports', subtitle: E.isLeader() ? 'Daily sheets of the members of your team. They update here by themselves.' : 'Daily sheets of members and team leaders: market, store, client, currency, orders, purchasing cost, total sales and notes. They update here by themselves.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Search', placeholder: 'Member, market, store or client' },
          ...(E.isLeader() ? [] : [{ name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name }))] }]),
        ],
        csv: (f) => `/api/orders${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/orders${E.qs(f)}`);
          people = r.byEmployee;
          return html`${totalsStats(r.totals)}
            ${r.byTeam.length > 1 ? html`<h3 style="margin:0 0 10px">By team</h3>${E.table([
              { label: 'Team', render: (x) => html`<b>${x.name}</b>` }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Purchasing cost', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'Total sales', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) },
            ], r.byTeam)}<div style="height:22px"></div>` : ''}
            <h3 style="margin:0 0 10px">By person</h3>${E.table([
              { label: 'Person', render: (x) => html`<b>${x.name}</b>${x.role === 'team_leader' ? html` <span class="badge ok">Team leader</span>` : ''}<div class="muted small">${x.empCode}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Purchasing cost', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'Total sales', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit) },
              { label: 'Entries', class: 'num', key: 'entries' },
              { label: '', class: 'right', render: (x) => html`<button class="btn sm" data-act="sheet" data-id="${x.employeeId}">Open sheet</button>` },
            ], r.byEmployee, 'No reports were added in this period.')}
            <h3 style="margin:22px 0 10px">All daily reports</h3>${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Person', render: (x) => html`<b>${x.employeeName}</b>${x.employeeRole === 'team_leader' ? html` <span class="badge ok">Team leader</span>` : ''}<div class="muted small">${x.teamName || 'No team'}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Market', render: (x) => dash(x.market) }, { label: 'Store Name', render: (x) => dash(x.store) },
              { label: 'Client', render: (x) => (x.clientUsername ? html`<b>${x.clientUsername}</b>` : html`<span class="muted">-</span>`) },
              { label: 'Currency', render: (x) => CUR_LABEL[x.currency] || x.currency }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
              { label: 'Purchasing Cost', class: 'num', render: (x) => moneyIn(x.investment, x.currency) }, { label: 'Total Sales', class: 'num', render: (x) => moneyIn(x.revenue, x.currency) },
              { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit, x.currency) }, { label: 'Notes / Activities', class: 'wrap', render: (x) => x.note || '' },
            ], r.rows, 'Nothing here yet.')}`;
        },
        bind: (box) => E.actions(box, { sheet: (id) => { const p = people.find((x) => String(x.employeeId) === id); if (p) sheetViewer(p); } }),
      });
      keepFresh('orders', ctrl.refresh, 10000);
    },
  });

  // ====================================================================================
  // CLIENT PORTAL: the rows shared with this client
  // ====================================================================================
  E.page({
    id: 'portal-sheet', title: 'Daily Sheet', icon: '▤', roles: ['client'], order: 4,
    async render(el) {
      let from = E.addDays(E.today(), -60);
      let to = E.today();
      let sig = '';
      const draw = async (force) => {
        const d = await E.get(`/api/portal/sheet${E.qs({ from, to })}`);
        const next = JSON.stringify([d.rows, d.totals]);
        if (!force && next === sig) return;
        sig = next;
        const by = Object.entries(d.totals);
        E.mount(E.$('#csheet', el), html`${by.length ? html`<div class="stats">${by.map(([c, t]) => html`${E.stat(`Orders (${CUR_LABEL[c] || c})`, fmt.num(t.orders))}${E.stat('Purchasing cost', moneyIn(t.investment, c))}${E.stat('Total sales', moneyIn(t.revenue, c), { cls: 'accent' })}${E.stat('Profit', moneyIn(t.profit, c), { cls: t.profit < 0 ? 'bad' : 'accent' })}`)}</div>` : ''}
          ${E.table([
            { label: 'Date', render: (x) => html`<b>${fmt.date(x.date)}</b>` }, { label: 'Market', render: (x) => dash(x.market) }, { label: 'Store', render: (x) => dash(x.store) },
            { label: 'Currency', render: (x) => CUR_LABEL[x.currency] || x.currency }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) },
            { label: 'Purchasing cost', class: 'num', render: (x) => moneyIn(x.investment, x.currency) }, { label: 'Total sales', class: 'num', render: (x) => moneyIn(x.revenue, x.currency) },
            { label: 'Profit', class: 'num', render: (x) => profitCell(x.profit, x.currency) },
            { label: 'More', class: 'wrap', render: (x) => (x.custom.length ? x.custom.map((c) => html`<div class="small"><span class="muted">${c.label}:</span> ${c.value}</div>`) : html`<span class="muted">-</span>`) },
          ], d.rows, 'Nothing has been shared on your sheet yet.')}`);
      };
      E.mount(el, html`${E.pageHead('Daily sheet', 'The daily numbers eTricks keeps for you. It updates by itself.')}
        <form class="filters" id="crange">${E.field({ name: 'from', label: 'From', type: 'date', value: from })}${E.field({ name: 'to', label: 'To', type: 'date', value: to })}</form><div id="csheet"></div>`);
      E.$('#crange', el).addEventListener('change', (ev) => { const f = E.readForm(ev.currentTarget); if (f.from && f.to && f.from <= f.to) { from = f.from; to = f.to; draw(true).catch((ex) => E.toast(ex.message, 'bad')); } });
      await draw(true);
      keepFresh('portal-sheet', () => draw(false).catch(() => {}), 10000);
    },
  });
})();
