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
  const roiText = (v) => (v === null || v === undefined ? '-' : `${Math.round(v * 10) / 10}%`);
  const dash = (v) => v || html`<span class="muted">-</span>`;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };

  // Totals in the company currency; a small line lists each currency on its own when more than one is used.
  const totalsStats = (t) => html`<div class="stats">${E.stat('Qty', fmt.num(t.orders))}${E.stat('Ali Exp Price', fmt.money(t.investment))}${E.stat('You Earned', fmt.money(t.revenue), { cls: 'accent' })}
    ${E.stat('Net Profit', fmt.money(t.profit), { cls: t.profit < 0 ? 'bad' : 'accent', sub: 'you earned − Ali Exp price' })}</div>${mixNote(t.byCurrency)}`;
  const mixNote = (by) => {
    const keys = Object.keys(by || {});
    if (keys.length < 2) return '';
    return html`<p class="muted small" style="margin:-6px 0 14px">Mixed currencies: the totals above are converted to ${E.settings.currency} with the exchange rates the admin set.
      ${keys.map((c, i) => html`${i ? ' · ' : ' '}<b>${CUR_LABEL[c] || c}</b>: earned ${moneyIn(by[c].revenue, c)}, price ${moneyIn(by[c].investment, c)}`)}</p>`;
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

  // ====================================================================================
  // THE SHEET: permanent columns (the same for every sheet), then the member's own columns, then Market / Store (team only)
  // ====================================================================================
  // f = the field, calc = worked out, num = a number cell, wide = a wide text cell
  const PERMANENT = [
    { f: 'date', label: 'Date' }, { f: 'orderId', label: 'Order Id' }, { f: 'customer', label: 'Customer Details', wide: true }, { f: 'orders', label: 'Qty', num: true },
    { f: 'supplierOrderNo', label: 'Supplier Order No' }, { f: 'currency', label: 'Currency' }, { f: 'revenue', label: 'You Earned', num: true }, { f: 'investment', label: 'Ali Exp Price', num: true },
    { calc: 'profit', label: 'Net Profit', num: true }, { calc: 'roi', label: 'ROI %', num: true }, { f: 'comments', label: 'Comments' }, { f: 'refunds', label: 'Refunds' }, { f: 'note', label: 'Note about orders', wide: true },
  ];
  const TEAM_ONLY = [{ f: 'market', label: 'Market' }, { f: 'store', label: 'Store' }];
  const TEXT_FIELDS = ['orderId', 'customer', 'supplierOrderNo', 'comments', 'refunds', 'note', 'market', 'store'];

  // The title above the sheet: "Profit Sheet November".
  const titleFor = (from, to) => (from && to && from.slice(0, 7) === to.slice(0, 7) ? `Profit Sheet ${MONTHS[Number(from.slice(5, 7)) - 1]}` : 'Profit Sheet');

  // The sheet, read only (the client sees it, and so do the people above the member). rows = oldest first.
  function sheetTable({ columns = [], rows, team = false, title = 'Profit Sheet', empty = 'This sheet has no rows.' }) {
    const nCols = 1 + PERMANENT.length + columns.length + (team ? TEAM_ONLY.length : 0);
    const cell = (def, r) => {
      if (def.calc === 'profit') return html`<td class="num">${profitCell(r.profit ?? (r.revenue - r.investment), r.currency)}</td>`;
      if (def.calc === 'roi') return html`<td class="num">${roiText(r.roi)}</td>`;
      switch (def.f) {
        case 'date': return html`<td class="nowrap">${fmt.date(r.date)}</td>`;
        case 'orders': return html`<td class="num">${fmt.num(r.orders)}</td>`;
        case 'currency': return html`<td class="nowrap">${CUR_LABEL[r.currency] || r.currency}</td>`;
        case 'revenue': case 'investment': return html`<td class="num">${moneyIn(r[def.f], r.currency)}</td>`;
        default: return html`<td class="${def.wide ? 'wrapcell' : ''}">${r[def.f] || ''}</td>`;
      }
    };
    return html`<div class="sheetwrap"><table class="sheet ro">
      <thead><tr class="band"><th colspan="${nCols}">${title}</th></tr>
        <tr><th class="hd">SR#</th>${PERMANENT.map((d) => html`<th class="hd ${d.num ? 'num' : ''}">${d.label}</th>`)}${columns.map((c) => html`<th class="hd ${c.kind === 'number' ? 'num' : ''}">${c.label}</th>`)}
          ${team ? TEAM_ONLY.map((d) => html`<th class="hd team">${d.label}<small>team only</small></th>`) : ''}</tr></thead>
      <tbody>${rows.length ? rows.map((r, i) => html`<tr><td class="sr">${i + 1}</td>${PERMANENT.map((d) => cell(d, r))}
        ${columns.map((c) => html`<td class="${c.kind === 'number' ? 'num' : ''}">${r.extra?.[c.id] !== undefined && r.extra?.[c.id] !== null ? String(r.extra[c.id]) : ''}</td>`)}
        ${team ? TEAM_ONLY.map((d) => html`<td>${r[d.f] || ''}</td>`) : ''}</tr>`) : html`<tr><td colspan="${nCols}" class="muted center" style="padding:20px">${empty}</td></tr>`}</tbody></table></div>`;
  }

  // ---------------- the form (also used on a phone) ----------------
  const clientNote = (u) => (u ? `the sheet of client ${u}` : 'the general sheet');
  function orderForm(o, ctx, onSaved) {
    const e = o || { date: E.today(), currency: ctx.lastCurrency || 'USD' };
    E.modal({
      title: o ? 'Edit row' : 'Add a row', wide: true,
      body: html`<p class="muted small">This row goes on ${clientNote(ctx.clientName)}.</p><div class="form">
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true, attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'currency', label: 'Currency', type: 'select', value: e.currency || 'USD', options: CUR_OPTS, required: true })}
        ${E.field({ name: 'orderId', label: 'Order Id', value: e.orderId })}
        ${E.field({ name: 'customer', label: 'Customer Details', value: e.customer })}
        ${E.field({ name: 'orders', label: 'Qty', type: 'number', value: e.orders ?? '', attrs: 'min="0" step="1"' })}
        ${E.field({ name: 'supplierOrderNo', label: 'Supplier Order No', value: e.supplierOrderNo })}
        ${E.field({ name: 'revenue', label: 'You Earned', type: 'number', value: e.revenue ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'investment', label: 'Ali Exp Price', type: 'number', value: e.investment ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'comments', label: 'Comments', value: e.comments })}
        ${E.field({ name: 'refunds', label: 'Refunds', value: e.refunds })}
        ${ctx.columns.map((c) => E.field({ name: `x_${c.id}`, label: c.label, type: c.kind === 'number' ? 'number' : 'text', value: e.extra?.[c.id] ?? '', attrs: c.kind === 'number' ? 'step="any"' : '' }))}
        ${E.field({ name: 'note', label: 'Note about orders', type: 'textarea', value: e.note, full: true, attrs: 'rows="3"' })}
        ${E.field({ name: 'market', label: 'Market (team only)', value: e.market, placeholder: 'e.g. Amazon US, eBay UK' })}${E.field({ name: 'store', label: 'Store (team only)', value: e.store })}</div>
        <p class="muted small">Net Profit and ROI % are worked out. Your team leader, head and admin see this live; the client sees the sheet only when you press <b>Update client</b>. You can change a row for ${ctx.editDays || 7} days.</p>`,
      onSubmit: async (v, { close }) => {
        const body = { extra: {} };
        for (const [k, val] of Object.entries(v)) { if (k.startsWith('x_')) body.extra[k.slice(2)] = val; else body[k] = val; }
        if (!o) body.clientId = ctx.clientId;
        if (o) await E.put(`/api/orders/${o.id}`, body); else await E.post('/api/orders', body);
        E.toast('Saved'); close(); onSaved();
      },
    });
  }

  // A column of the member's own: the member decides whether the client sees it.
  function columnModal(col, ctx, onDone) {
    const { form, close } = E.modal({
      title: col ? `Column "${col.label}"` : 'Add a column', submit: 'Save',
      body: html`<p class="muted small">Your own column on ${clientNote(ctx.clientName)} (up to 6). The permanent columns (SR#, Date, Order Id ... Note about orders) are always shown to the client. For your own column <b>you</b> decide.</p>
        <div class="form">${E.field({ name: 'label', label: 'Column name', value: col?.label, required: true, full: true, attrs: 'maxlength="30"' })}
        ${E.field({ name: 'kind', label: 'Type', type: 'select', value: col?.kind || 'text', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }], attrs: col ? 'disabled' : '' })}
        ${E.field({ name: 'clientVisible', label: 'Show this column to the client', type: 'checkbox', value: col ? col.clientVisible : false, full: true })}</div>
        <p class="muted small">If you do not tick it, only you, your team leader, your head and the admin see this column. You can change it later.</p>
        ${col ? html`<div style="margin-top:14px"><button type="button" class="btn danger sm" id="delCol">Delete this column and its values</button></div>` : ''}`,
      onSubmit: async (v, { close: c }) => {
        const body = { label: v.label, clientVisible: !!v.clientVisible, ...(col ? {} : { kind: v.kind, clientId: ctx.clientId }) };
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
  const SORTABLE = ['date', 'orderId', 'orders', 'revenue', 'investment', 'profit', 'roi', 'market', 'store'];
  const STATUS = { saved: ['✓', 'Saved', 'ok'], saving: ['…', 'Saving', 'wait'], dirty: ['•', 'Not saved yet', 'wait'], error: ['⚠', 'Not saved', 'bad'], locked: ['🔒', 'Older than the editing window: nobody can change it any more', 'lock'], draft: ['', 'Empty row', ''] };

  async function mySheet(el) {
    let state = { rows: [], columns: [], clients: [], hasGeneral: false, clientId: null, totalRows: 0, published: [], fx: { USD: 1, AUD: 0.65, GBP: 1.27 }, editDays: 7 };
    let editing = false; // the sheet opens read-only; Edit makes it editable
    let sheetKey; // which sheet is open: undefined (the server chooses), 'general' or a client id
    let from = E.monthStart();
    let to = E.today();
    let sort = { f: 'date', dir: 1 };
    let seq = 0;
    let box;

    const locked = (r) => !!r.id && r.savedDate < E.addDays(E.today(), -state.editDays); // by the date stored on the server
    const clientName = () => state.clients.find((c) => c.id === state.clientId)?.username || null;
    // a member who works for clients keeps new rows on a client's sheet: the general sheet only holds older rows
    const canAdd = () => !(state.clientId === null && state.clients.length > 0);
    const fromServer = (r) => ({
      k: ++seq, id: r.id, savedDate: r.date, date: r.date, orderId: r.orderId || '', customer: r.customer || '', orders: r.orders ? String(r.orders) : '', supplierOrderNo: r.supplierOrderNo || '', currency: r.currency || 'USD',
      revenue: r.revenue ? String(r.revenue) : '', investment: r.investment ? String(r.investment) : '', comments: r.comments || '', refunds: r.refunds || '', note: r.note || '', market: r.market || '', store: r.store || '',
      extra: Object.fromEntries(Object.entries(r.extra || {}).map(([k, v]) => [k, String(v)])), st: 'saved', err: '',
    });
    const lastCurrency = () => state.rows.at(-1)?.currency || 'USD';

    // ---- numbers of a row, read from what is typed ----
    const earned = (r) => calc(r.revenue);
    const price = (r) => calc(r.investment);
    const profitOf = (r) => { const a = earned(r); const b = price(r); return Number.isNaN(a) || Number.isNaN(b) ? null : money2(a - b); };
    const roiOf = (r) => { const p = profitOf(r); const c = price(r); return p === null || !(c > 0) ? null : (p / c) * 100; };
    const conv = (n, cur) => n * (state.fx[cur] ?? 1);
    const sum = () => {
      let qty = 0; let investment = 0; let revenue = 0; const by = {};
      for (const r of state.rows) {
        const o = calc(r.orders); const c = price(r); const s = earned(r);
        if ([o, c, s].some(Number.isNaN)) continue;
        qty += o; investment += conv(c, r.currency); revenue += conv(s, r.currency);
        const b = (by[r.currency] ||= { investment: 0, revenue: 0 }); b.investment += c; b.revenue += s;
      }
      return { orders: qty, investment: money2(investment), revenue: money2(revenue), profit: money2(revenue - investment), byCurrency: by };
    };

    // ---- turning a row into what the server takes ----
    const payload = (r) => {
      const qty = calc(r.orders); const inv = price(r); const rev = earned(r);
      if (Number.isNaN(qty) || !Number.isInteger(qty) || qty < 0) return { err: 'Qty must be a whole number' };
      if (Number.isNaN(inv) || inv < 0) return { err: 'Ali Exp Price is not a valid amount' };
      if (Number.isNaN(rev) || rev < 0) return { err: 'You Earned is not a valid amount' };
      const extra = {};
      for (const c of state.columns) {
        const raw = (r.extra[c.id] ?? '').trim();
        if (!raw) continue;
        if (c.kind === 'number') { const n = calc(raw); if (Number.isNaN(n)) return { err: `${c.label} must be a number` }; extra[c.id] = n; } else extra[c.id] = raw;
      }
      const body = { date: r.date, currency: r.currency, orders: qty, investment: money2(inv), revenue: money2(rev), extra };
      for (const f of TEXT_FIELDS) body[f] = r[f];
      if (!r.id) body.clientId = state.clientId;
      return { body };
    };
    const meaningful = (r) => {
      const p = payload(r);
      if (p.err) return true; // let the person see the message
      const b = p.body;
      return !!(b.orders || b.investment || b.revenue || TEXT_FIELDS.some((f) => (b[f] || '').trim()) || Object.keys(b.extra).length);
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
        if (r.id) await E.put(`/api/orders/${r.id}`, p.body); else { r.id = (await E.post('/api/orders', p.body)).id; state.totalRows += 1; }
        r.st = 'saved'; r.savedDate = p.body.date;
        markStale();
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
    // what the client sees is the copy sent with "Update client": any change makes it out of date until the next update
    let pubTimer;
    const markStale = () => {
      for (const p of state.published) p.upToDate = false;
      if (alive()) drawPub();
      clearTimeout(pubTimer); pubTimer = setTimeout(() => { if (alive()) refreshPub().catch(() => {}); }, 1800); // then ask the server: a change that was undone is up to date again
    };
    const myPub = () => state.published.find((p) => p.clientId === state.clientId);
    function drawPub() {
      const n = E.$('#pubstatus', el); if (!n) return;
      if (state.clientId === null) {
        E.mount(n, state.clients.length ? html`<div class="pubstatus"><div class="pub">This general sheet holds older rows. It is not shared with any client: open a client's sheet above to update that client.</div></div>`
          : html`<div class="pubstatus"><div class="pub">No client is assigned to you, so there is nobody to update. Your leader, head and admin see your sheet live.</div></div>`);
        return;
      }
      const p = myPub();
      const name = clientName();
      E.mount(n, html`<div class="pubstatus">${!p
        ? html`<div class="pub">Client <b>${name}</b> has not been sent this sheet yet. Press <b>Update client</b> to show it.</div>`
        : p.upToDate
          ? html`<div class="pub ok">✓ Client <b>${name}</b> sees this sheet as it is now (sent ${fmt.dateTime(p.publishedAt)}). <button type="button" class="btn sm" data-act="unpublish">Stop showing it</button></div>`
          : html`<div class="pub warn">⚠ Client <b>${name}</b> still sees the sheet sent ${fmt.dateTime(p.publishedAt)}. You changed it since: press <b>Update client</b> to send it. <button type="button" class="btn sm" data-act="unpublish">Stop showing it</button></div>`}</div>`);
    }
    window.onbeforeunload = () => (pendingCount() ? 'Some changes are still being saved.' : undefined);

    // ---- drawing ----
    const rowOf = (k) => state.rows.find((r) => String(r.k) === String(k));
    const trOf = (r) => box.querySelector(`tr[data-k="${r.k}"]`);
    const canonical = () => [...state.rows].sort((a, b) => a.date.localeCompare(b.date) || a.k - b.k);
    function paintSR() { canonical().forEach((r, i) => { const c = trOf(r)?.querySelector('.sr'); if (c) c.textContent = i + 1; }); }
    function paintRow(r, skipTotals) {
      const tr = trOf(r); if (!tr) return;
      const st = locked(r) ? STATUS.locked : STATUS[r.st] || STATUS.saved;
      const cell = tr.querySelector('.st');
      cell.className = `st ${st[2]}`; cell.textContent = st[0]; cell.title = r.err || st[1];
      const p = profitOf(r);
      tr.querySelector('.profit').innerHTML = p === null ? '-' : `<span class="${p < 0 ? 'neg' : 'pos'}">${moneyIn(p, r.currency)}</span>`;
      tr.querySelector('.roi').textContent = roiText(roiOf(r));
      for (const inp of tr.querySelectorAll('input[data-f]')) {
        const f = inp.dataset.f;
        const isNum = ['orders', 'investment', 'revenue'].includes(f) || (f.startsWith('x:') && state.columns.find((c) => String(c.id) === f.slice(2))?.kind === 'number');
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
      set('#tf-roi', t.investment > 0 ? roiText((t.profit / t.investment) * 100) : '-');
      set('#band-sales', fmt.money(t.revenue)); set('#band-cost', fmt.money(t.investment)); set('#band-profit', fmt.money(t.profit));
    }
    const cmp = (a, b) => {
      const v = (r) => (sort.f === 'profit' ? (profitOf(r) ?? -Infinity) : sort.f === 'roi' ? (roiOf(r) ?? -Infinity) : ['orders', 'investment', 'revenue'].includes(sort.f) ? (calc(r[sort.f]) || 0) : String(r[sort.f] ?? '').toLowerCase());
      const x = v(a); const y = v(b);
      return (x < y ? -1 : x > y ? 1 : a.k - b.k) * sort.dir;
    };
    const head = (def, extraCls = '') => {
      const key = def.f || def.calc;
      const can = SORTABLE.includes(key);
      return html`<th class="hd ${can ? 'sortable' : ''} ${def.num ? 'num' : ''} ${extraCls}" data-sort="${can ? key : ''}">${def.label}${extraCls.includes('team') ? html`<small>team only</small>` : ''}${sort.f === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    };
    function rowHtml(r) {
      const dis = locked(r) || !editing;
      const ro = dis ? E.raw('readonly') : '';
      const cellFor = (def) => {
        if (def.calc) return html`<td class="num ${def.calc}"></td>`;
        if (def.f === 'date') return html`<td><input class="cell" type="date" data-f="date" value="${r.date}" max="${E.today()}" ${ro}></td>`;
        if (def.f === 'currency') return html`<td><select class="cell" data-f="currency" ${dis ? E.raw('disabled') : ''}>${CUR_OPTS.map((o) => html`<option value="${o.value}" ${o.value === r.currency ? E.raw('selected') : ''}>${o.label}</option>`)}</select></td>`;
        if (def.num) return html`<td class="num"><input class="cell num" data-f="${def.f}" value="${r[def.f]}" inputmode="decimal" ${ro} autocomplete="off" placeholder="0"></td>`;
        return html`<td><input class="cell ${def.wide ? 'wide' : ''}" data-f="${def.f}" value="${r[def.f]}" ${ro} autocomplete="off"></td>`;
      };
      return html`<tr data-k="${r.k}" class="${locked(r) ? 'locked' : ''}"><td class="sr"></td>${PERMANENT.map(cellFor)}
        ${state.columns.map((c) => html`<td class="${c.kind === 'number' ? 'num' : ''}"><input class="cell ${c.kind === 'number' ? 'num' : ''}" data-f="x:${c.id}" value="${r.extra[c.id] ?? ''}" ${ro} autocomplete="off"></td>`)}
        ${TEAM_ONLY.map(cellFor)}
        <td class="st"></td><td class="x">${dis ? '' : html`<button type="button" class="iconbtn" data-del="${r.k}" title="Delete this row" aria-label="Delete this row">✕</button>`}</td></tr>`;
    }
    function draw() {
      const rows = [...state.rows].sort(cmp);
      const before = 1 + PERMANENT.findIndex((d) => d.f === 'revenue'); // columns before "You Earned", SR# included
      const totalCols = 1 + PERMANENT.length + state.columns.length + TEAM_ONLY.length + 2;
      const restCols = totalCols - before - 3;
      E.mount(box, html`<div class="sheetwrap"><table class="sheet">
        <thead>
          <tr class="band"><th colspan="${before}">${titleFor(from, to)}${clientName() ? html` <small>· ${clientName()}</small>` : ''}</th><th class="tot" id="band-sales"></th><th class="tot" id="band-cost"></th><th class="tot" id="band-profit"></th><th colspan="${restCols}"></th></tr>
          <tr><th class="hd">SR#</th>${PERMANENT.map((d) => head(d))}
            ${state.columns.map((c) => html`<th class="hd ${editing ? 'col' : ''} ${c.kind === 'number' ? 'num' : ''}" data-col="${c.id}" title="${editing ? 'Click to rename, change who sees it, or delete' : ''}">${c.label}${c.clientVisible ? '' : html`<small>team only</small>`}</th>`)}
            ${TEAM_ONLY.map((d) => head(d, 'team'))}<th class="hd"></th><th class="hd"></th></tr></thead>
        <tbody>${rows.map(rowHtml)}</tbody>
        <tfoot><tr><td colspan="4">Total <span class="muted small">(in ${E.settings.currency})</span></td><td class="num" id="tf-orders"></td><td></td><td></td><td class="num" id="tf-sales"></td><td class="num" id="tf-cost"></td><td class="num" id="tf-profit"></td><td class="num" id="tf-roi"></td><td colspan="${totalCols - 11}"></td></tr></tfoot>
      </table></div>${rows.length ? '' : html`<div class="muted center" style="padding:22px 0">${canAdd() ? html`This sheet is empty. Press <b>Edit</b>, then <b>+ Add row</b> and start typing: everything is saved by itself.` : 'This general sheet has no rows in this period.'}</div>`}`);
      for (const r of state.rows) paintRow(r, true);
      paintTotals(); paintSR();
    }

    // ---- tabs: one sheet per client ----
    function drawTabs() {
      const tabs = [...state.clients.map((c) => ({ key: c.id, label: c.username })), ...(state.hasGeneral ? [{ key: 'general', label: 'General' }] : [])];
      const cur = state.clientId === null ? 'general' : state.clientId;
      E.mount(E.$('#sheettabs', el), tabs.length > 1 || (tabs.length === 1 && tabs[0].key !== 'general')
        ? html`<div class="tabs sheetabs"><span class="muted small" style="align-self:center">Your sheets:</span>${tabs.map((t) => html`<button type="button" class="${t.key === cur ? 'on active' : ''}" data-tab="${t.key}">${t.label}</button>`)}</div>` : '');
    }

    // ---- loading ----
    async function load() {
      const q = { from, to };
      if (sheetKey !== undefined) q.client = sheetKey;
      const r = await E.get(`/api/orders/me${E.qs(q)}`);
      state = { ...state, columns: r.columns, clients: r.clients, hasGeneral: r.hasGeneral, clientId: r.clientId, totalRows: r.totalRows, published: r.published || [], fx: r.fx, editDays: r.editDays || 7,
        rows: r.rows.map(fromServer).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) };
      sheetKey = r.clientId === null ? 'general' : r.clientId;
      drawTabs(); drawBar(); draw(); drawPub();
    }
    const refreshPub = async () => { const r = await E.get(`/api/orders/me${E.qs({ from, to, client: sheetKey })}`); state.published = r.published || []; state.totalRows = r.totalRows; drawPub(); };
    const flushAll = async () => { await Promise.all(state.rows.filter((r) => ['dirty', 'error'].includes(r.st)).map(flush)); };

    // ---- adding rows ----
    function addRow(preset = {}, focus = 'orderId') {
      if (!editing || !canAdd()) return null;
      const r = { k: ++seq, id: null, date: E.today(), orderId: '', customer: '', orders: '', supplierOrderNo: '', currency: lastCurrency(), revenue: '', investment: '', comments: '', refunds: '', note: '', market: '', store: '', extra: {}, st: 'draft', err: '', ...preset };
      state.rows.push(r);
      sort = { f: 'date', dir: 1 };
      draw();
      box.querySelector(`tr[data-k="${r.k}"] [data-f="${focus}"]`)?.focus();
      box.querySelector(`tr[data-k="${r.k}"]`)?.scrollIntoView({ block: 'nearest' });
      return r;
    }

    // ---- pasting cells from Excel / Google Sheets: the same columns as the sheet ----
    const SHORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const ymd = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; };
    function parseDate(t) {
      t = String(t ?? '').trim();
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (m) return ymd(+m[1], +m[2], +m[3]);
      m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t); if (m) return ymd(+m[3], +m[2], +m[1]); // day first: 5/11/2026 is 5 November
      m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(t); if (m && SHORT_MONTHS.includes(m[2].toLowerCase())) return ymd(+m[3], SHORT_MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
      return null;
    }
    async function pasteRows(text) {
      const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
      const cells = lines.map((l) => l.split('\t').map((c) => c.trim()));
      const off = (c) => (parseDate(c[0]) ? 0 : 1); // a leading SR# column shifts everything by one
      if (cells.length && !parseDate(cells[0][off(cells[0])])) cells.shift(); // a header line
      if (!cells.length) return E.toast('Nothing to paste: each line needs a date (after the SR# if there is one)', 'bad');
      const bad = cells.findIndex((c) => !parseDate(c[off(c)]));
      if (bad >= 0) return E.toast(`Line ${bad + 1}: "${cells[bad][off(cells[bad])]}" is not a date (use 2026-11-05 or 5/11/2026)`, 'bad');
      if (cells.length > 100) return E.toast('Paste up to 100 rows at a time', 'bad');
      // pasted amounts carry no currency: the person says which one (a £ in the cells picks GBP)
      const guess = cells.some((c) => /£/.test(`${c[off(c) + 5] || ''}${c[off(c) + 6] || ''}`)) ? 'GBP' : lastCurrency();
      E.modal({
        title: `Add ${cells.length} row${cells.length === 1 ? '' : 's'} from the pasted cells`, submit: 'Add rows',
        body: html`<p>They go on ${clientNote(clientName())}. The columns must be the same as the sheet: SR#, Date, Order Id, Customer Details, Qty, Supplier Order No, You Earned, Ali Exp Price, Net Profit, ROI %, Comments, Refunds, Note about orders. Net Profit and ROI % are worked out here.</p>
          <div class="form">${E.field({ name: 'currency', label: 'Currency of these rows', type: 'select', value: guess, options: CUR_OPTS, required: true, full: true })}</div>`,
        onSubmit: async (v, { close }) => {
          close();
          await flushAll();
          let ok = 0; const errors = [];
          for (const [i, c] of cells.entries()) {
            const o = off(c);
            const qty = calc(c[o + 3] || 0); const rev = calc(c[o + 5] || 0); const inv = calc(c[o + 6] || 0);
            if ([qty, rev, inv].some(Number.isNaN)) { errors.push(`Line ${i + 1}: a number is not valid`); continue; }
            const body = {
              clientId: state.clientId, date: parseDate(c[o]), orderId: c[o + 1] || '', customer: c[o + 2] || '', orders: Math.round(qty), supplierOrderNo: c[o + 4] || '', currency: v.currency,
              revenue: money2(rev), investment: money2(inv), comments: c[o + 9] || '', refunds: c[o + 10] || '', note: c[o + 11] || '',
            };
            try { await E.post('/api/orders', body); ok++; } catch (ex) { errors.push(`Line ${i + 1}: ${ex.message}`); }
          }
          await load();
          E.toast(errors.length ? `${ok} added, ${errors.length} not added. ${errors[0]}` : `${ok} row${ok === 1 ? '' : 's'} added`, errors.length ? 'bad' : undefined);
        },
      });
    }

    // ---- Update client ----
    async function updateClient() {
      if (state.clientId === null) return E.toast("Open a client's sheet first (the tabs above).", 'bad');
      await flushAll();
      const broken = state.rows.find((r) => r.st === 'error');
      if (broken) return E.toast(`Fix the red row first: ${broken.err}`, 'bad');
      const shown = state.columns.filter((c) => c.clientVisible); const hidden = state.columns.filter((c) => !c.clientVisible);
      E.modal({
        title: `Update client ${clientName()}`, submit: 'Send update', wide: true,
        body: html`<p><b>${clientName()}</b> will see this sheet <b>exactly as it is now</b>: all <b>${state.totalRows} row${state.totalRows === 1 ? '' : 's'}</b> of it (not only the dates on screen), the permanent columns (SR#, Date, Order Id, Customer Details, Qty, Supplier Order No, Currency, You Earned, Ali Exp Price, Net Profit, ROI %, Comments, Refunds, Note about orders) and your own columns that you marked for the client. They never see your name.</p>
          <ul class="list small">
            <li>Your own columns shown to the client: <b>${shown.length ? shown.map((c) => c.label).join(', ') : 'none'}</b></li>
            <li>Your own columns kept for the team: <b>${hidden.length ? hidden.map((c) => c.label).join(', ') : 'none'}</b>. Market and Store always stay with the team.</li></ul>
          <p class="muted small">The next update replaces this one. ${state.totalRows ? '' : 'There is nothing to send yet: add rows first.'}</p>`,
        onSubmit: async (v, { close }) => {
          const r = await E.post('/api/orders/publish', { clientId: state.clientId });
          close(); E.toast(`Sent to ${r.username} (Account ${r.account}): ${r.rows} row${r.rows === 1 ? '' : 's'}`);
          await refreshPub();
        },
      });
    }

    // ---- the page ----
    E.mount(el, html`${E.pageHead('Daily Reports', 'Your daily sheet. Press Edit to change it: everything saves by itself. Your team leader, head of department and admin see it live. Your client sees it when you press Update client.', html`<div class="row" id="sheetbar" style="gap:8px;flex-wrap:wrap"></div>`)}
      <div id="sheettabs"></div>
      <form class="filters" id="range">${E.field({ name: 'from', label: 'From', type: 'date', value: from })}${E.field({ name: 'to', label: 'To', type: 'date', value: to })}</form>
      <div id="pubstatus"></div><div id="sheetstats"></div><div id="sheetbox"></div>
      <p class="muted small">Tips: press <b>Edit</b> to change the sheet and <b>Done editing</b> when finished. <b>Enter</b> moves down, <b>Tab</b> moves right. Number cells accept sums like <code>=12*3.5+4</code>. Paste your Google Sheet here (SR#, Date, Order Id, Customer Details, Qty, Supplier Order No, You Earned, Ali Exp Price, Net Profit, ROI %, Comments, Refunds, Note about orders). Rows older than ${state.editDays} days are locked. <b>Update client</b> sends the client a copy of this sheet as it is.</p>`);
    function drawBar() {
      const add = editing && canAdd();
      E.mount(E.$('#sheetbar', el), html`${add ? html`<button class="btn" data-act="form">Add with a form</button><button class="btn" data-act="column">+ Column</button><button class="btn" data-act="row">+ Add row</button>` : ''}
        <a class="btn" id="csv" href="#">Export CSV</a>
        <button class="btn ${editing ? 'primary' : ''}" data-act="edit">${editing ? '✓ Done editing' : '✎ Edit'}</button>
        ${state.clientId !== null ? html`<button class="btn ${editing ? '' : 'primary'}" data-act="update">⬆ Update client</button>` : ''}`);
      const csv = E.$('#csv', el); if (csv) csv.href = `/api/orders/me${E.qs({ from, to, client: sheetKey, format: 'csv' })}`;
    }
    box = E.$('#sheetbox', el);

    E.actions(el, {
      edit: async () => {
        if (editing) await flushAll();
        editing = !editing; drawBar(); draw();
        if (editing && !state.rows.length) addRow();
      },
      update: () => updateClient().catch((ex) => E.toast(ex.message, 'bad')),
      unpublish: async () => {
        if (!(await E.confirm(`Stop showing this sheet to client ${clientName()}? They will see nothing of it until your next update.`, { yes: 'Stop showing it', danger: true }))) return;
        try { await E.del(`/api/orders/publish/${state.clientId}`); E.toast('The client no longer sees this sheet'); await refreshPub(); } catch (ex) { E.toast(ex.message, 'bad'); }
      },
      row: () => addRow(),
      form: async () => { await flushAll(); orderForm(null, { clientId: state.clientId, clientName: clientName(), columns: state.columns, editDays: state.editDays, lastCurrency: lastCurrency() }, load); },
      column: () => columnModal(null, { clientId: state.clientId, clientName: clientName() }, async () => { await flushAll(); await load(); }),
    });
    E.$('#range', el).addEventListener('change', async (ev) => {
      const f = E.readForm(ev.currentTarget);
      if (!f.from || !f.to || f.from > f.to) return;
      await flushAll(); from = f.from; to = f.to;
      try { await load(); } catch (ex) { E.toast(ex.message, 'bad'); }
    });
    E.$('#sheettabs', el).addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-tab]'); if (!b) return;
      await flushAll();
      sheetKey = b.dataset.tab === 'general' ? 'general' : Number(b.dataset.tab);
      editing = false; // a new sheet opens read-only
      try { await load(); } catch (ex) { E.toast(ex.message, 'bad'); }
    });

    box.addEventListener('input', (ev) => {
      const t = ev.target.closest('[data-f]'); if (!t) return;
      const r = rowOf(t.closest('tr').dataset.k); if (!r || locked(r) || !editing) return;
      const f = t.dataset.f;
      if (f.startsWith('x:')) r.extra[f.slice(2)] = t.value; else r[f] = t.value;
      schedule(r); paintRow(r);
    });
    box.addEventListener('change', (ev) => {
      const t = ev.target.closest('[data-f]'); if (!t) return;
      const r = rowOf(t.closest('tr').dataset.k); if (!r || locked(r) || !editing) return;
      const f = t.dataset.f;
      if (t.tagName === 'SELECT' || t.type === 'date') { r[f] = t.value; if (f === 'date') paintSR(); }
      // a number cell shows the result of a typed sum when the person leaves it
      const isNum = ['orders', 'investment', 'revenue'].includes(f) || (f.startsWith('x:') && state.columns.find((c) => String(c.id) === f.slice(2))?.kind === 'number');
      if (isNum && t.value.trim()) { const v = calc(t.value); if (!Number.isNaN(v)) { const shown = f === 'orders' ? String(v) : String(money2(v)); t.value = shown; if (f.startsWith('x:')) r.extra[f.slice(2)] = shown; else r[f] = shown; } }
      schedule(r, 50); paintRow(r);
    });
    box.addEventListener('keydown', (ev) => {
      const t = ev.target.closest('input[data-f]'); if (!t || !editing) return;
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
      if (!editing || !canAdd() || !/[\t\n]/.test(text.trim())) return; // an ordinary paste into one cell
      ev.preventDefault();
      pasteRows(text);
    });
    box.addEventListener('click', async (ev) => {
      const th = ev.target.closest('th[data-sort]');
      if (th && th.dataset.sort) { sort = { f: th.dataset.sort, dir: sort.f === th.dataset.sort ? -sort.dir : 1 }; draw(); return; }
      const col = ev.target.closest('th[data-col]');
      if (col && editing) { columnModal(state.columns.find((c) => String(c.id) === col.dataset.col), { clientId: state.clientId, clientName: clientName() }, async () => { await flushAll(); await load(); }); return; }
      const del = ev.target.closest('[data-del]');
      if (del && editing) {
        const r = rowOf(del.dataset.del); if (!r) return;
        if (r.busy) return E.toast('Saving this row, try again in a moment', 'bad');
        if (r.id && !(await E.confirm('Delete this row?', { yes: 'Delete', danger: true }))) return;
        try { if (r.id) await E.del(`/api/orders/${r.id}`); clearTimeout(r.timer); state.rows = state.rows.filter((x) => x !== r); if (r.id) { state.totalRows -= 1; markStale(); } draw(); } catch (ex) { E.toast(ex.message, 'bad'); }
      }
    });

    await load();
    if (!state.rows.length && canAdd()) { editing = true; drawBar(); draw(); addRow({}, 'orderId'); }
  }

  E.page({ id: 'my-orders', title: 'Daily Reports', icon: '▤', roles: ['leader', 'member'], group: E.myGroup, order: 8, render: mySheet });

  // ====================================================================================
  // LEADER / HEAD / ADMIN: what members reported, live
  // ====================================================================================
  const byDate = (rows) => [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  // One person's sheets, read only, refreshing itself while the window is open.
  function sheetViewer(person) {
    let from = E.monthStart();
    let to = E.today();
    let sig = '';
    let key; // which sheet: undefined = the first with rows
    const { form } = E.modal({
      title: `${person.name}: daily sheet`, wide: true, cancel: 'Close',
      body: html`<div class="muted small" style="margin-bottom:8px">Read only. It refreshes by itself while this window is open.</div><div id="vtabs"></div>
        <div class="filters" id="vrange">${E.field({ name: 'from', label: 'From', type: 'date', value: from })}${E.field({ name: 'to', label: 'To', type: 'date', value: to })}</div><div id="viewer"></div>`,
    });
    const overlay = form.closest('.overlay');
    const box = E.$('#viewer', form);
    const pull = async () => {
      if (!document.body.contains(overlay)) { clearInterval(timer); return; }
      let r;
      try { r = await E.get(`/api/orders/sheet/${person.employeeId}${E.qs({ from, to, client: key })}`); } catch (ex) { E.mount(box, html`<div class="error">${ex.message}</div>`); return; }
      key = r.clientId === null ? 'general' : r.clientId;
      const next = JSON.stringify([r.rows.map((x) => [x.id, x.updatedAt]), r.columns, r.published, r.sheets, key]);
      if (next === sig) return;
      sig = next;
      E.mount(E.$('#vtabs', form), r.sheets.length > 1 || (r.sheets.length === 1 && r.sheets[0].clientId !== null)
        ? html`<div class="tabs sheetabs">${r.sheets.map((t) => html`<button type="button" class="${(t.clientId === null ? 'general' : t.clientId) === key ? 'on active' : ''}" data-tab="${t.clientId === null ? 'general' : t.clientId}">${t.username || 'General'} <span class="muted small">(${t.rows})</span></button>`)}</div>` : '');
      const pub = (r.published || []).find((p) => p.clientId === r.clientId);
      const name = r.sheets.find((t) => t.clientId === r.clientId)?.username;
      E.mount(box, html`${name ? (pub
        ? html`<div class="pub ${pub.upToDate ? 'ok' : 'warn'}" style="margin-bottom:8px">${pub.upToDate ? '✓' : '⚠'} Client <b>${name}</b> was sent this sheet ${fmt.dateTime(pub.publishedAt)} (${pub.rows} rows)${pub.upToDate ? '' : '. The sheet was changed after that update.'}</div>`
        : html`<div class="pub" style="margin-bottom:8px">Client <b>${name}</b> has not been sent this sheet yet.</div>`) : ''}
        ${totalsStats(r.totals)}${sheetTable({ columns: r.columns, rows: byDate(r.rows), team: true, title: titleFor(r.from, r.to), empty: 'No rows in this period.' })}`);
    };
    const timer = setInterval(pull, 8000);
    E.$('#vtabs', form).addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (!b) return; key = b.dataset.tab === 'general' ? 'general' : Number(b.dataset.tab); sig = ''; pull(); });
    E.$('#vrange', form).addEventListener('change', () => { const f = E.readForm(form); if (f.from && f.to && f.from <= f.to) { from = f.from; to = f.to; sig = ''; pull(); } });
    pull();
  }

  E.page({
    id: 'orders', title: 'Team Daily Reports', icon: '▤', roles: E.MANAGE, group: 'Operations', order: 15,
    async render(el) {
      const teams = E.isLeader() ? [] : await E.teams('');
      let people = [];
      const ctrl = await E.listPage(el, {
        title: 'Team daily reports', subtitle: E.isLeader() ? 'Daily sheets of the members of your team. They update here by themselves.' : 'Daily sheets of members and team leaders: one sheet per client. They update here by themselves.', dept: true,
        filters: [
          { name: 'from', label: 'From', type: 'date', value: E.monthStart() }, { name: 'to', label: 'To', type: 'date', value: E.today() },
          { name: 'search', label: 'Search', placeholder: 'Member, client, order id, customer, market or store' },
          ...(E.isLeader() ? [] : [{ name: 'teamId', label: 'Team', type: 'select', options: [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: E.isAdmin() ? `${t.departmentName} · ${t.name}` : t.name }))] }]),
        ],
        csv: (f) => `/api/orders${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          const r = await E.get(`/api/orders${E.qs(f)}`);
          people = r.byEmployee;
          return html`${totalsStats(r.totals)}
            ${r.byTeam.length > 1 ? html`<h3 style="margin:0 0 10px">By team</h3>${E.table([
              { label: 'Team', render: (x) => html`<b>${x.name}</b>` }, { label: 'Qty', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Ali Exp Price', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'You Earned', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Net Profit', class: 'num', render: (x) => profitCell(x.profit) },
            ], r.byTeam)}<div style="height:22px"></div>` : ''}
            <h3 style="margin:0 0 10px">By person</h3>${E.table([
              { label: 'Person', render: (x) => html`<b>${x.name}</b>${x.role === 'team_leader' ? html` <span class="badge ok">Team leader</span>` : ''}<div class="muted small">${x.empCode}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Qty', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Ali Exp Price', class: 'num', render: (x) => fmt.money(x.investment) },
              { label: 'You Earned', class: 'num', render: (x) => fmt.money(x.revenue) }, { label: 'Net Profit', class: 'num', render: (x) => profitCell(x.profit) },
              { label: 'Rows', class: 'num', key: 'entries' },
              { label: '', class: 'right', render: (x) => html`<button class="btn sm" data-act="sheet" data-id="${x.employeeId}">Open sheets</button>` },
            ], r.byEmployee, 'No reports were added in this period.')}
            <h3 style="margin:22px 0 10px">All rows</h3>${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Person', render: (x) => html`<b>${x.employeeName}</b>${x.employeeRole === 'team_leader' ? html` <span class="badge ok">Team leader</span>` : ''}<div class="muted small">${x.teamName || 'No team'}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              { label: 'Client', render: (x) => (x.clientUsername ? html`<b>${x.clientUsername}</b>` : html`<span class="muted">General</span>`) },
              { label: 'Order Id', render: (x) => dash(x.orderId) }, { label: 'Customer', class: 'wrap', render: (x) => dash(x.customer) },
              { label: 'Market / Store', render: (x) => dash([x.market, x.store].filter(Boolean).join(' · ')) },
              { label: 'Qty', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Currency', render: (x) => CUR_LABEL[x.currency] || x.currency },
              { label: 'You Earned', class: 'num', render: (x) => moneyIn(x.revenue, x.currency) }, { label: 'Ali Exp Price', class: 'num', render: (x) => moneyIn(x.investment, x.currency) },
              { label: 'Net Profit', class: 'num', render: (x) => profitCell(x.profit, x.currency) }, { label: 'ROI %', class: 'num', render: (x) => roiText(x.roi) },
              { label: 'Note about orders', class: 'wrap', render: (x) => x.note || '' },
            ], r.rows, 'Nothing here yet.')}`;
        },
        bind: (box) => E.actions(box, { sheet: (id) => { const p = people.find((x) => String(x.employeeId) === id); if (p) sheetViewer(p); } }),
      });
      keepFresh('orders', ctrl.refresh, 10000);
    },
  });

  // ====================================================================================
  // CLIENT PORTAL: the sheet the team sent, exactly as sent
  // ====================================================================================
  E.page({
    id: 'portal-sheet', title: 'Daily Sheet', icon: '▤', roles: ['client'], order: 4,
    async render(el) {
      let stamp = null;
      const month = {}; // chosen month of each account's sheet
      let data = { sheets: [] };
      let active = null; // the account (section) on screen
      const block = (sh) => {
        const months = [...new Set(sh.rows.map((r) => r.date.slice(0, 7)))].sort().reverse();
        const cur = month[sh.account] && months.includes(month[sh.account]) ? month[sh.account] : months[0];
        month[sh.account] = cur;
        const rows = sh.rows.filter((r) => r.date.slice(0, 7) === cur);
        const by = Object.entries(sh.totals || {});
        return html`<div class="card" style="margin-bottom:18px">
          <div class="row" style="justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="margin:0">${sh.title}</h3>
            <span class="row small muted" style="gap:8px">Month <select data-month="${sh.account}" style="min-width:150px">${months.map((m) => html`<option value="${m}" ${m === cur ? E.raw('selected') : ''}>${monthName(m)}</option>`)}</select> · updated ${fmt.dateTime(sh.publishedAt)}</span></div>
          ${by.map(([c, t]) => html`<div class="muted small" style="margin:12px 0 6px"><b>${CUR_LABEL[c] || c}</b> (all months)</div><div class="stats" style="margin:0">${E.stat('Qty', fmt.num(t.orders))}${E.stat('Ali Exp Price', moneyIn(t.investment, c))}${E.stat('You Earned', moneyIn(t.revenue, c), { cls: 'accent' })}${E.stat('Net Profit', moneyIn(t.profit, c), { cls: t.profit < 0 ? 'bad' : 'accent' })}</div>`)}
          <div style="margin-top:14px">${sheetTable({ columns: sh.columns, rows, title: cur ? `Profit Sheet ${monthName(cur)}` : 'Profit Sheet', empty: 'No rows in this month.' })}</div></div>`;
      };
      // One tab per account ("Account 1", "Account 2" ...): each person who works for you has a section of their own, all in this one portal.
      const paint = () => {
        const sheets = data.sheets;
        if (!sheets.length) { E.mount(E.$('#csheet', el), html`<div class="card empty">Nothing has been sent to you yet. When the team sends your sheet it appears here.</div>`); return; }
        if (!sheets.some((s) => s.account === active)) active = sheets[0].account;
        E.mount(E.$('#csheet', el), html`${sheets.length > 1 ? html`<div class="tabs sheetabs">${sheets.map((s) => html`<button type="button" class="${s.account === active ? 'on active' : ''}" data-acc="${s.account}">${s.title}</button>`)}</div>` : ''}${block(sheets.find((s) => s.account === active))}`);
      };
      const draw = async () => { data = await E.get('/api/portal/sheet'); paint(); };
      E.mount(el, html`${E.pageHead('Daily sheet', 'The sheet eTricks keeps for you, exactly as the team sent it. It updates here by itself when the team sends a new version.')}<div id="csheet"></div>`);
      E.$('#csheet', el).addEventListener('change', (ev) => { const s = ev.target.closest('[data-month]'); if (!s) return; month[s.dataset.month] = s.value; paint(); });
      E.$('#csheet', el).addEventListener('click', (ev) => { const t = ev.target.closest('[data-acc]'); if (!t) return; active = Number(t.dataset.acc); paint(); });
      stamp = (await E.get('/api/portal/sheet/stamp')).stamp;
      await draw();
      keepFresh('portal-sheet', async () => { try { const n = (await E.get('/api/portal/sheet/stamp')).stamp; if (n !== stamp) { stamp = n; await draw(); } } catch { /* try again next time */ } }, 10000);
    },
  });
})();
