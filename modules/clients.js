(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const STAFF = ['admin', 'hod', 'leader', 'member'];
  const staffGroup = () => 'Clients';
  const money = (n) => fmt.money(n);
  const revenue = (n) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${money(n)}</span>`;
  const dash = (v) => v || html`<span class="muted">-</span>`;

  // The four numbers of a client, as cards.
  const numbers = (t, { sub = "" } = {}) => html`<div class="stats quad">${E.stat('Orders', fmt.num(t.orders), { sub })}${E.stat('Investment', money(t.investment))}${E.stat('Sales', money(t.sales), { cls: 'accent' })}
    ${E.stat('Revenue', money(t.revenue), { cls: t.revenue < 0 ? 'bad' : 'accent', sub: 'sales − investment' })}</div>`;

  // ====================================================================================
  // A chat that keeps itself up to date. Used inline by the client portal and in a window by the team.
  //   load()    -> { messages: [...] }       send(text)
  //   mine(m)   -> is it written by the person looking at the screen?     labelOf(m) -> name above the message
  // ====================================================================================
  function mountChat(box, { load, send, mine, labelOf, placeholder, quick = [], urgent = false, active, every = 3000, sendLabel = 'Send' }) {
    E.mount(box, html`<div class="chatlog" tabindex="0" aria-live="polite"></div>
      <div class="chatform"><textarea rows="2" maxlength="2000" placeholder="${placeholder}"></textarea><button type="button" class="btn primary ${urgent ? 'danger-solid' : ''}">${sendLabel}</button></div>
      ${quick.length ? html`<div class="quick">${quick.map((q) => html`<button type="button" class="chip" data-q="${q}">${q}</button>`)}</div>` : ''}`);
    const log = E.$('.chatlog', box);
    const ta = E.$('textarea', box);
    const btn = E.$('.chatform .btn', box);
    let msgs = [];
    let sig = '';
    let lastId = 0;
    let timer = null;
    let first = true;

    const draw = () => {
      E.mount(log, msgs.length ? html`${msgs.map((m) => html`<div class="bubble ${mine(m) ? 'mine' : 'theirs'}"><div class="who">${labelOf(m)} · ${fmt.dateTime(m.createdAt)}</div><div class="body">${m.body}</div>${mine(m) && m.seen ? html`<div class="seen">✓ Seen</div>` : ''}</div>`)}`
        : html`<div class="muted center" style="padding:24px 0">No messages yet.</div>`);
      log.scrollTop = log.scrollHeight;
    };
    const pull = async () => {
      let r;
      try { r = await load(); } catch { return; }
      const next = `${r.messages.length}:${r.messages.at(-1)?.id}:${r.messages.filter((m) => m.seen).length}`;
      if (next === sig) return;
      const newest = r.messages.at(-1)?.id || 0;
      if (!first && newest > lastId && r.messages.some((m) => m.id > lastId && !mine(m))) E.beep?.(urgent);
      sig = next; lastId = newest; first = false; msgs = r.messages; draw();
    };
    const submit = async () => {
      const text = ta.value.trim();
      if (!text) return;
      btn.disabled = true;
      try { await send(text); ta.value = ''; await pull(); } catch (ex) { E.toast(ex.message, 'bad'); } finally { btn.disabled = false; ta.focus(); }
    };
    btn.onclick = submit;
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    box.addEventListener('click', (e) => { const c = e.target.closest('[data-q]'); if (c) { ta.value = c.dataset.q; ta.focus(); } });
    const destroy = () => { clearInterval(timer); timer = null; };
    timer = setInterval(() => { if (!active()) destroy(); else pull(); }, every);
    pull();
    return { destroy, pull, focus: () => ta.focus() };
  }

  // The team's side of one client's chat, in a window.
  function staffChat(client, channel, onClose) {
    const alert = channel === 'alert';
    let chat;
    const { form, close } = E.modal({
      title: `${alert ? '🚨 Alerts' : 'Chat'} - ${client.username}`, wide: true, cancel: 'Close',
      body: html`${alert ? html`<div class="alertnote"><b>Urgent channel.</b> Use it for codes (OTP), confidential details and anything that must be answered at once. The text is never shown in notifications.</div>`
        : html`<div class="muted small" style="margin-bottom:8px">The client sees only "eTricks": not your name. Your colleagues see who answered.</div>`}<div id="chatbox" class="chatbox ${alert ? 'alertbox' : ''}"></div>`,
    });
    const overlay = form.closest('.overlay');
    chat = mountChat(E.$('#chatbox', form), {
      load: () => E.get(`/api/clients/${client.id}/chat?channel=${channel}`),
      send: (body) => E.post(`/api/clients/${client.id}/chat`, { channel, body }),
      mine: (m) => !m.fromClient, labelOf: (m) => (m.fromClient ? `Client ${client.username}` : `${m.author} (eTricks)`),
      placeholder: alert ? 'Reply to the alert…' : 'Write to the client…', urgent: alert, every: alert ? 2500 : 4000,
      quick: alert ? ['Received, thank you.', 'Please send the code (OTP) now.', 'Please confirm you are available.', 'Done. Please check.'] : [],
      active: () => document.body.contains(overlay), sendLabel: alert ? 'Send alert reply' : 'Send',
    });
    chat.focus();
    const obs = new MutationObserver(() => { if (!document.body.contains(overlay)) { obs.disconnect(); chat.destroy(); onClose?.(); } });
    obs.observe(document.body, { childList: true });
    void close;
  }

  // Page that refreshes itself quietly while it is open.
  const freshTimers = {};
  const keepFresh = (id, refresh, ms) => {
    clearInterval(freshTimers[id]);
    const t = freshTimers[id] = setInterval(() => { if (location.hash !== `#/${id}` || !document.getElementById('view')) clearInterval(t); else refresh(true); }, ms);
  };

  // ====================================================================================
  // ADMIN: the clients (private details, passwords)
  // ====================================================================================
  function credentials(c, password, headline) {
    E.modal({
      title: headline, cancel: 'Close',
      body: html`<p>Give these to the client. The password is shown only now: it cannot be read again later (you can set a new one).</p>
        <div class="card" style="font-size:15px;line-height:1.9">Website: <b>${location.origin}</b><br>Portal: <b>Client Portal</b> of the department<br>Client ID: <b>${c.username}</b><br>Password: <b>${password}</b></div>`,
    });
  }

  async function clientForm(existing, onSaved) {
    const [depts, teams] = await Promise.all([E.departments(), E.teams('')]);
    const c = existing || {};
    const teamOpts = (deptId) => [{ value: '', label: 'Whole department' }, ...teams.filter((t) => String(t.departmentId) === String(deptId)).map((t) => ({ value: t.id, label: t.name }))];
    let secretLoaded = false;
    const { form } = E.modal({
      title: existing ? `Client ${c.username}` : 'Add client', wide: true, submit: existing ? 'Save' : 'Create client',
      body: html`<div class="form">
        ${E.field({ name: 'username', label: 'Client ID (username)', value: c.username, placeholder: existing ? '' : 'Leave empty for an automatic ID like CL-0001', help: 'The team knows the client only by this ID. Letters, numbers, dot, dash.' })}
        ${existing ? E.field({ name: 'status', label: 'Status', type: 'select', value: c.status, options: [{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (cannot sign in)' }] })
          : E.field({ name: 'password', label: 'Portal password', type: 'password', required: true, help: 'At least 8 characters. You give it to the client.', attrs: 'autocomplete="new-password"' })}
        ${E.field({ name: 'departmentId', label: 'Department', type: 'select', required: true, value: c.departmentId ?? '', options: [{ value: '', label: 'Select…' }, ...E.idOptions(depts)] })}
        ${E.field({ name: 'teamId', label: 'Team that works for this client', type: 'select', value: c.teamId ?? '', options: teamOpts(c.departmentId), help: 'Only this team (and the head of department) sees the client. Leave "Whole department" for all teams.' })}
        <div class="sect">Private details (only the admin sees these)</div>
        ${E.field({ name: 'displayName', label: 'Client name', value: c.displayName, full: true })}
        ${E.field({ name: 'contact', label: 'Contact (phone / email)', value: c.contact, full: true })}
        ${existing ? html`<div class="full"><div class="muted small" style="margin-bottom:6px">Account details (store logins and other secrets)</div>
            ${c.hasSecret ? html`<button type="button" class="btn sm" id="showSecret">Show / edit account details</button><span class="muted small"> Every viewing is written to the activity log.</span>` : html`<button type="button" class="btn sm" id="showSecret">Add account details</button>`}
            <textarea name="secretInfo" rows="5" hidden style="margin-top:8px" placeholder="Store login, email, anything private about the account"></textarea></div>`
          : E.field({ name: 'secretInfo', label: 'Account details (store logins and other secrets)', type: 'textarea', value: '', full: true, placeholder: 'Store login, email, anything private about the account' })}</div>`,
      onOpen: (f) => {
        const dept = f.elements.departmentId;
        dept.addEventListener('change', () => E.mount(f.elements.teamId, html`${teamOpts(dept.value).map((o) => html`<option value="${o.value}">${o.label}</option>`)}`));
        const b = E.$('#showSecret', f);
        if (b) b.onclick = async () => {
          try {
            const r = await E.get(`/api/clients/${c.id}/secret`);
            const ta = f.elements.secretInfo; ta.value = r.secretInfo; ta.hidden = false; secretLoaded = true; b.remove(); ta.focus();
          } catch (ex) { E.toast(ex.message, 'bad'); }
        };
      },
      onSubmit: async (v, { close }) => {
        const body = { ...v, teamId: v.teamId || null, departmentId: Number(v.departmentId) };
        if (existing) {
          if (!secretLoaded) delete body.secretInfo; // untouched: keep what is stored
          await E.put(`/api/clients/${c.id}`, body);
          E.toast('Saved'); close(); onSaved();
        } else {
          const r = await E.post('/api/clients', body);
          close(); onSaved();
          credentials({ username: r.username }, v.password, 'Client created');
        }
      },
    });
    void form;
  }

  function resetPassword(c) {
    E.modal({
      title: `New password for ${c.username}`, submit: 'Save password',
      body: html`<p class="muted">The client is signed out at once and must use the new password.</p><div class="form">${E.field({ name: 'password', label: 'New password', type: 'password', full: true, required: true, help: 'At least 8 characters', attrs: 'autocomplete="new-password"' })}</div>`,
      onSubmit: async (v, { close }) => { await E.put(`/api/clients/${c.id}/password`, v); close(); credentials(c, v.password, 'Password changed'); },
    });
  }

  function deleteClient(c, onDone) {
    const { form } = E.modal({
      title: `Delete client ${c.username}`, submit: 'Delete permanently',
      body: html`<p><b>This cannot be undone.</b> The client, all their daily numbers and both chats are removed for good. To stop a client without losing anything, set the status to Disabled instead.</p>
        <div class="form">${E.field({ name: 'confirm', label: `Type the client ID (${c.username}) to confirm`, required: true, full: true, attrs: 'autocomplete="off"' })}</div>`,
      onSubmit: async (v, { close }) => {
        if (v.confirm.trim().toLowerCase() !== c.username.toLowerCase()) throw new Error('The ID you typed does not match');
        await E.del(`/api/clients/${c.id}`); E.toast('Client deleted'); close(); onDone();
      },
    });
    E.$('.btn.primary', form).classList.add('danger');
  }

  E.page({
    id: 'clients', title: 'Clients', icon: '◈', roles: ['admin'], group: 'Clients', order: 5,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Clients', subtitle: 'Every client gets a portal with their daily sales, a chat and urgent alerts. You keep their private details here; the team knows only the client ID.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ Add client</button>`,
        filters: [{ name: 'search', label: 'Search', placeholder: 'ID or name' }],
        load: async (f) => {
          rows = (await E.get('/api/clients')).filter((c) => (!f.departmentId || String(c.departmentId) === f.departmentId)
            && (!f.search || `${c.username} ${c.displayName || ''}`.toLowerCase().includes(f.search.toLowerCase())));
          const waiting = rows.filter((c) => c.alertNeedsReply).length;
          return html`<div class="stats">${E.stat('Clients', rows.length)}${E.stat('Active', rows.filter((c) => c.status === 'active').length, { cls: 'accent' })}${E.stat('Alerts waiting', waiting, { cls: waiting ? 'bad' : '' })}</div>
            ${E.table([
              { label: 'Client', render: (c) => html`<b>${c.username}</b>${c.displayName ? html`<div class="muted small">${c.displayName}</div>` : ''}` },
              { label: 'Department / team', render: (c) => html`${c.departmentName}<div class="muted small">${c.teamName || 'Whole department'}</div>` },
              { label: 'Status', render: (c) => (c.status === 'active' ? html`<span class="badge ok">Active</span>` : html`<span class="badge bad">Disabled</span>`) },
              { label: 'Today (sales)', class: 'num', render: (c) => money(c.today.sales) }, { label: 'Total sales', class: 'num', render: (c) => money(c.total.sales) },
              { label: 'Last sign-in', render: (c) => (c.lastLoginAt ? fmt.dateTime(c.lastLoginAt) : html`<span class="muted">Never</span>`) },
              { label: 'Chat', render: (c) => html`${c.alertNeedsReply ? html`<span class="badge bad">Alert waiting</span> ` : ''}${c.inquiryNeedsReply ? html`<span class="badge warn">Message waiting</span>` : ''}${!c.alertNeedsReply && !c.inquiryNeedsReply ? html`<span class="muted">-</span>` : ''}` },
              { label: '', class: 'right', render: (c) => html`<div class="actions"><button class="btn sm" data-act="chat" data-id="${c.id}">Chat</button><button class="btn sm" data-act="alerts" data-id="${c.id}">Alerts</button><button class="btn sm" data-act="edit" data-id="${c.id}">Edit</button><button class="btn sm" data-act="pw" data-id="${c.id}">🔑</button><button class="btn sm danger" data-act="del" data-id="${c.id}">Delete</button></div>` },
            ], rows, 'No clients yet. Add the first one.')}`;
        },
        bind: (box, refresh) => {
          const find = (id) => rows.find((c) => String(c.id) === id);
          E.actions(box, {
            edit: (id) => clientForm(find(id), refresh), pw: (id) => resetPassword(find(id)), del: (id) => deleteClient(find(id), refresh),
            chat: (id) => staffChat(find(id), 'inquiry', refresh), alerts: (id) => staffChat(find(id), 'alert', refresh),
          });
        },
      });
      E.actions(el, { add: () => clientForm(null, ctrl.refresh) });
    },
  });

  // ====================================================================================
  // TEAM: the day's work for a client
  // ====================================================================================
  function updateForm(clients, existing, preset, onSaved) {
    const e = existing || { date: E.today(), clientId: preset };
    E.modal({
      title: existing ? 'Edit client update' : 'Add client update', wide: true,
      body: html`<div class="form">
        ${E.field({ name: 'clientId', label: 'Client ID', type: 'select', required: true, value: e.clientId ?? '', full: true, options: [{ value: '', label: 'Select the client…' }, ...clients.map((c) => ({ value: c.id, label: c.username }))] })}
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true, attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'market', label: 'Market', value: e.market, placeholder: 'e.g. Amazon US' })}
        ${E.field({ name: 'store', label: 'Store / account', value: e.store })}
        ${E.field({ name: 'orders', label: 'Orders', type: 'number', value: e.orders ?? '', attrs: 'min="0" step="1"' })}
        ${E.field({ name: 'investment', label: 'Investment', type: 'number', value: e.investment ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'sales', label: 'Sales', type: 'number', value: e.sales ?? '', attrs: 'min="0" step="0.01"' })}
        <div class="muted small" style="align-self:end;padding-bottom:10px">Revenue is worked out for the client: sales − investment.</div>
        ${E.field({ name: 'note', label: 'Update for the client (what was done today)', type: 'textarea', value: e.note, full: true, attrs: 'rows="4"', placeholder: 'e.g. Listed 20 products, shipped 5 orders, answered 2 buyer messages' })}</div>
        <p class="muted small"><b>The client reads this note.</b> It is shown as an update from "eTricks". Do not write your own name, a colleague's name or anything private.</p>`,
      onSubmit: async (v, { close }) => {
        const body = { ...v, clientId: Number(v.clientId) };
        if (existing) await E.put(`/api/client-reports/${existing.id}`, body); else await E.post('/api/client-reports', body);
        E.toast('Saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'client-updates', title: 'Client Updates', icon: '◫', roles: STAFF, group: staffGroup, order: 10,
    async render(el) {
      let rows = [];
      let clients = [];
      const ctrl = await E.listPage(el, {
        title: 'Client updates', subtitle: 'Write the day\'s orders, investment and sales for each client ID. The client sees the numbers and your note, labelled "eTricks": never your name.',
        actions: html`<button class="btn primary" data-act="add">+ Add update</button>`,
        filters: [
          { name: 'clientId', label: 'Client', type: 'select', options: [{ value: '', label: 'All clients' }] },
          { name: 'from', label: 'From', type: 'date', value: E.addDays(E.today(), -6) }, { name: 'to', label: 'To', type: 'date', value: E.today() },
        ],
        load: async (f) => {
          clients = await E.get('/api/clients');
          const sel = E.$('select[name=clientId]', el);
          if (sel && sel.options.length === 1) { for (const c of clients) sel.append(new Option(c.username, c.id)); sel.value = f.clientId || ''; }
          const r = await E.get(`/api/client-reports${E.qs(f)}`);
          rows = r.rows;
          const day = E.today();
          return html`${clients.length ? html`<div class="grid cols-2" style="margin-bottom:16px">${clients.filter((c) => !f.clientId || String(c.id) === f.clientId).map((c) => html`<div class="card">
              <h3><span>${c.username}</span><button class="btn sm primary" data-act="addfor" data-id="${c.id}">+ Update</button></h3>
              <div class="muted small">Today</div><div><b>${fmt.num(c.today.orders)}</b> orders · <b>${money(c.today.sales)}</b> sales · revenue ${money(c.today.revenue)}</div>
              <div class="muted small" style="margin-top:8px">All time</div><div><b>${fmt.num(c.total.orders)}</b> orders · ${money(c.total.investment)} invested · <b>${money(c.total.sales)}</b> sales · revenue ${money(c.total.revenue)}</div></div>`)}</div>`
            : html`<div class="card empty" style="margin-bottom:16px">No client is assigned to you yet. The admin creates clients and gives each one a team.</div>`}
            ${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Client', render: (x) => html`<b>${x.username}</b>` },
              { label: 'Market / store', render: (x) => html`${dash(x.market)}<div class="muted small">${x.store || ''}</div>` },
              { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Investment', class: 'num', render: (x) => money(x.investment) },
              { label: 'Sales', class: 'num', render: (x) => money(x.sales) }, { label: 'Revenue', class: 'num', render: (x) => revenue(x.revenue) },
              { label: 'Update the client reads', class: 'wrap', render: (x) => x.note || '' },
              { label: 'Written by', render: (x) => html`<span class="muted small">${x.by}</span>` },
              { label: '', class: 'right', render: (x) => (x.canEdit ? html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${x.id}">Delete</button></div>` : '') },
            ], rows, 'No updates in this period.')}
            ${rows.length ? html`<p class="muted small" style="margin-top:8px">Shown: ${fmt.num(r.totals.orders)} orders · investment ${money(r.totals.investment)} · sales ${money(r.totals.sales)} · revenue ${money(r.totals.revenue)}</p>` : ''}`;
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => updateForm(clients, rows.find((r) => String(r.id) === id), null, refresh),
          addfor: (id) => updateForm(clients, null, Number(id), refresh),
          del: async (id) => { if (await E.confirm('Delete this update? The client will no longer see it.', { yes: 'Delete', danger: true })) { await E.del(`/api/client-reports/${id}`); E.toast('Deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => updateForm(clients, null, null, ctrl.refresh) });
    },
  });

  // ====================================================================================
  // TEAM: chat and alerts with clients
  // ====================================================================================
  function chatList(id, channel, title, subtitle) {
    return async (el) => {
      const alert = channel === 'alert';
      let clients = [];
      const ctrl = await E.listPage(el, {
        title, subtitle,
        actions: alert ? html`<button class="btn primary" data-act="raise">🚨 Raise an alert to a client</button>` : '',
        load: async () => {
          clients = await E.get('/api/clients');
          const needs = (c) => (alert ? c.alertNeedsReply : c.inquiryNeedsReply);
          const at = (c) => (alert ? c.lastAlertAt : c.lastInquiryAt);
          const sorted = [...clients].filter((c) => c.status === 'active').sort((a, b) => Number(needs(b)) - Number(needs(a)) || String(at(b) || '').localeCompare(String(at(a) || '')));
          const waiting = sorted.filter(needs).length;
          return html`${waiting ? html`<div class="alertnote"><b>${waiting} client${waiting === 1 ? ' is' : 's are'} waiting for an answer.</b> Answer first, then the rest.</div>` : ''}
            ${E.table([
              { label: 'Client', render: (c) => html`<b>${c.username}</b>` },
              { label: 'Last message', render: (c) => (at(c) ? fmt.dateTime(at(c)) : html`<span class="muted">No messages yet</span>`) },
              { label: 'Status', render: (c) => (needs(c) ? html`<span class="badge bad">${alert ? 'ALERT: needs a reply now' : 'Needs a reply'}</span>` : at(c) ? html`<span class="badge ok">Answered</span>` : '') },
              { label: '', class: 'right', render: (c) => html`<button class="btn sm ${needs(c) ? 'primary' : ''}" data-act="open" data-id="${c.id}">${needs(c) ? 'Answer now' : 'Open'}</button>` },
            ], sorted, 'No client is assigned to you yet.')}`;
        },
        bind: (box, refresh) => E.actions(box, { open: (cid) => staffChat(clients.find((c) => String(c.id) === cid), channel, refresh) }),
      });
      E.actions(el, {
        raise: () => {
          E.modal({
            title: 'Raise an alert to a client', submit: 'Open the alert chat',
            body: html`<p class="muted">Use this when you need something from the client right now, for example a code (OTP). The client gets an urgent notification and a red banner.</p>
              <div class="form">${E.field({ name: 'clientId', label: 'Client ID', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select…' }, ...clients.filter((c) => c.status === 'active').map((c) => ({ value: c.id, label: c.username }))] })}</div>`,
            onSubmit: async (v, { close }) => { close(); staffChat(clients.find((c) => String(c.id) === v.clientId), 'alert', ctrl.refresh); },
          });
        },
      });
      keepFresh(id, ctrl.refresh, alert ? 5000 : 8000);
    };
  }

  E.page({ id: 'client-chat', title: 'Client Chat', icon: '✉', roles: STAFF, group: staffGroup, order: 20, render: chatList('client-chat', 'inquiry', 'Client chat', 'Simple messages and inquiries from your clients. They see only "eTricks".') });
  E.page({ id: 'client-alerts', title: 'Client Alerts', icon: '🚨', roles: STAFF, group: staffGroup, order: 30, render: chatList('client-alerts', 'alert', 'Client alerts', 'Urgent messages: codes (OTP), confidential details, things that need an answer right now.') });

  // ====================================================================================
  // THE CLIENT PORTAL
  // ====================================================================================
  const CLIENT = ['client'];

  E.page({
    id: 'portal-sales', title: 'Sales', icon: '▦', roles: CLIENT, order: 1,
    async render(el) {
      const load = async (from, to) => E.get(`/api/portal/sales${E.qs({ from, to })}`);
      const draw = async (from, to) => {
        const d = await load(from, to);
        const max = Math.max(1, ...d.chart.map((x) => x.sales));
        E.mount(el, html`${E.pageHead('Your sales', `Client ${d.username} · updated daily by eTricks`, html`<button class="btn" data-act="refresh">↻ Refresh</button>`)}
          <h3 style="margin:0 0 10px">Today <span class="muted" style="font-weight:400;font-size:14px">· ${fmt.date(d.today.date)}</span></h3>
          ${numbers(d.today, { sub: d.today.orders ? 'received today' : 'nothing reported yet today' })}
          <h3 style="margin:26px 0 10px">Daily</h3>
          <div class="card"><h3>Sales - last 14 days</h3><div class="bars">${d.chart.map((x) => html`<div class="b"><span class="val">${x.sales ? fmt.num(Math.round(x.sales)) : ''}</span><div class="track"><div class="fill" style="height:${(x.sales / max) * 100}%"></div></div><span class="lab">${x.date.slice(8)}</span></div>`)}</div></div>
          <form class="filters" id="range" style="margin-top:14px">${E.field({ name: 'from', label: 'From', type: 'date', value: d.from })}${E.field({ name: 'to', label: 'To', type: 'date', value: d.to })}</form>
          ${E.table([
            { label: 'Date', render: (x) => html`<b>${fmt.date(x.date)}</b>` }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Investment', class: 'num', render: (x) => money(x.investment) },
            { label: 'Sales', class: 'num', render: (x) => money(x.sales) }, { label: 'Revenue', class: 'num', render: (x) => revenue(x.revenue) },
            { label: 'What eTricks did', class: 'wrap', render: (x) => html`${x.updates.filter((u) => u.note || u.market || u.store).map((u) => html`<div class="small">${[u.market, u.store].filter(Boolean).join(' · ')}${u.note ? html`${u.market || u.store ? ': ' : ''}${u.note}` : ''}</div>`)}${x.updates.every((u) => !u.note && !u.market && !u.store) ? html`<span class="muted small">-</span>` : ''}` },
          ], d.days, 'No updates in this period.')}
          ${d.days.length ? html`<p class="muted small" style="margin-top:6px">In this period: ${fmt.num(d.range.orders)} orders · investment ${money(d.range.investment)} · sales ${money(d.range.sales)} · revenue ${money(d.range.revenue)}</p>` : ''}
          <h3 style="margin:26px 0 10px">Total <span class="muted" style="font-weight:400;font-size:14px">· ${d.total.since ? `since ${fmt.date(d.total.since)} · ${d.total.days} day${d.total.days === 1 ? '' : 's'}` : 'nothing yet'}</span></h3>
          ${numbers(d.total, { sub: 'everything so far' })}
          <p class="muted small">This month: ${fmt.num(d.month.orders)} orders · investment ${money(d.month.investment)} · sales ${money(d.month.sales)} · revenue ${money(d.month.revenue)}</p>`);
        E.$('#range', el).addEventListener('change', (ev) => { const f = E.readForm(ev.currentTarget); if (f.from && f.to) draw(f.from, f.to).catch((ex) => E.toast(ex.message, 'bad')); });
      };
      const current = () => { const f = E.$('#range', el) ? E.readForm(E.$('#range', el)) : {}; return [f.from, f.to]; };
      E.actions(el, { refresh: () => draw(...current()) });
      await draw();
      let seen = '';
      const timer = setInterval(async () => {
        if (!el.isConnected || location.hash !== '#/portal-sales') { clearInterval(timer); return; }
        if (document.querySelector('.overlay') || el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
        try {
          const d = await load(...current());
          const sig = `${d.total.orders}|${d.total.sales}|${d.total.investment}|${d.today.orders}|${d.today.sales}|${d.days.length}`;
          if (seen && sig !== seen) { const y = window.scrollY; await draw(...current()); window.scrollTo(0, y); E.toast('Your sales were updated'); }
          seen = sig;
        } catch { /* try again next time */ }
      }, 30000);
    },
  });

  const clientChatPage = (id, channel, title, intro, opts = {}) => async (el) => {
    const alert = channel === 'alert';
    E.mount(el, html`${E.pageHead(title, alert ? 'For urgent matters only.' : 'Ask us anything. You are talking to eTricks.')}
      ${alert ? html`<div class="alertnote"><b>Urgent channel.</b> ${intro}</div>` : html`<div class="muted small" style="margin-bottom:8px">${intro}</div>`}
      <div id="chatbox" class="chatbox big ${alert ? 'alertbox' : ''}"></div>`);
    mountChat(E.$('#chatbox', el), {
      load: () => E.get(`/api/portal/chat?channel=${channel}`), send: (body) => E.post('/api/portal/chat', { channel, body }),
      mine: (m) => m.from === 'you', labelOf: (m) => (m.from === 'you' ? 'You' : 'eTricks'),
      placeholder: alert ? 'Type your urgent message…' : 'Type your message…', urgent: alert, every: alert ? 2500 : 3500,
      active: () => el.isConnected && location.hash === `#/${id}`, sendLabel: alert ? '🚨 Send alert' : 'Send', ...opts,
    });
  };
  E.page({ id: 'portal-chat', title: 'Chat & Inquiry', icon: '✉', roles: CLIENT, order: 2, render: clientChatPage('portal-chat', 'inquiry', 'Chat & inquiry', 'Send a question, an inquiry or any message. Our team answers here.') });
  E.page({ id: 'portal-alerts', title: 'Alerts', icon: '🚨', roles: CLIENT, order: 3, render: clientChatPage('portal-alerts', 'alert', 'Alerts', 'Use this only when something needs an answer immediately. We are notified at once, and we use it to ask you for codes (OTP) or confidential details that cannot wait. Nothing you write here appears in notifications.') });
})();
