(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const STAFF = ['admin', 'hod', 'leader', 'member'];
  const staffGroup = () => 'Clients';
  const money = (n) => fmt.money(n);
  const revenue = (n) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${money(n)}</span>`;
  const dash = (v) => v || html`<span class="muted">-</span>`;

  const CUR_LABEL = { AUD: 'AUD $', USD: 'USD $', GBP: 'GBP £' };
  const moneyIn = (n, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(n); } catch { return Number(n).toFixed(2); } };
  const profitIn = (n, cur) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${moneyIn(n, cur)}</span>`;
  // The four numbers of a period in one currency, as cards: qty, Ali Exp price, sales (you earned) and net profit.
  const numbers = (t, cur, { sub = '' } = {}) => html`<div class="stats quad">${E.stat('Qty', fmt.num(t.qty), { sub })}${E.stat('Ali Exp Price', moneyIn(t.investment, cur))}${E.stat('Sales', moneyIn(t.sales, cur), { cls: 'accent' })}
    ${E.stat('Net Profit', moneyIn(t.profit, cur), { cls: t.profit < 0 ? 'bad' : 'accent', sub: 'sales − Ali Exp Price' })}</div>`;

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
      try { r = await load(); } catch (ex) { if (ex.status === 403) { destroy(); E.toast(ex.message, 'bad'); } return; } // the chat became private to somebody else
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

  // Who answers this client, said in plain words above the chat. The conversation is private to the person who answered first.
  const ownerNote = (r) => {
    const admin = E.isAdmin();
    if (r.chat === 'mine') return html`<div class="ownernote mine">🔒 <b>This conversation is yours.</b> Only you and the admin can see it. Colleagues cannot read it and get no notification from this client.
      <button type="button" class="btn sm" data-own="release">Release it</button></div>`;
    if (admin && r.chatOwnerName) return html`<div class="ownernote">🔒 <b>Private to ${r.chatOwnerName}</b> (and you). Nobody else sees this conversation.
      <button type="button" class="btn sm" data-own="release">Release</button> <button type="button" class="btn sm" data-own="assign">Give to someone else</button></div>`;
    if (admin) return html`<div class="ownernote open">Nobody has answered yet. The first colleague who replies becomes the only one who sees this conversation. <button type="button" class="btn sm" data-own="assign">Give it to someone</button></div>`;
    return html`<div class="ownernote open">Nobody has answered this client yet. <b>When you reply, the conversation becomes private to you</b> (and the admin).</div>`;
  };

  // Admin: choose who answers this client.
  async function assignOwner(client, done) {
    const r = await E.get(`/api/clients/${client.id}/staff`);
    const people = r.candidates.filter((e) => e.chosen);
    if (!people.length) return E.toast('Nobody is chosen for this client yet. Add people under Members first.', 'bad');
    E.modal({
      title: `Who answers ${client.username}?`, submit: 'Give it',
      body: html`<p class="muted">The conversation becomes private to that person (and you).</p><div class="form">${E.field({ name: 'employeeId', label: 'Person', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select…' }, ...people.map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))] })}</div>`,
      onSubmit: async (v, { close }) => { await E.put(`/api/clients/${client.id}/chat-owner`, { employeeId: Number(v.employeeId) }); E.toast('Done'); close(); done(); },
    });
  }

  // The team's side of one client's chat, in a window.
  async function staffChat(client, channel, onClose) {
    const alert = channel === 'alert';
    let chat;
    try { await E.get(`/api/clients/${client.id}/chat?channel=${channel}`); } catch (ex) { E.toast(ex.message, 'bad'); onClose?.(); return; } // e.g. a colleague answers this client
    const { form, close } = E.modal({
      title: `${alert ? '🚨 Alerts' : 'Chat'} - ${client.username}`, wide: true, cancel: 'Close',
      body: html`<div id="ownernote"></div>${alert ? html`<div class="alertnote"><b>Urgent channel.</b> Use it for codes (OTP), confidential details and anything that must be answered at once. The text is never shown in notifications.</div>`
        : html`<div class="muted small" style="margin-bottom:8px">The client sees only "eTricks": not your name.</div>`}<div id="chatbox" class="chatbox ${alert ? 'alertbox' : ''}"></div>`,
    });
    const overlay = form.closest('.overlay');
    const note = E.$('#ownernote', form);
    note.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-own]'); if (!b) return;
      try {
        if (b.dataset.own === 'release') { await E.post(`/api/clients/${client.id}/chat/release`, {}); E.toast('Released'); chat.pull(true); }
        else await assignOwner(client, () => chat.pull(true));
      } catch (ex) { E.toast(ex.message, 'bad'); }
    });
    chat = mountChat(E.$('#chatbox', form), {
      load: async () => { const r = await E.get(`/api/clients/${client.id}/chat?channel=${channel}`); E.mount(note, ownerNote(r)); return r; },
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

  // "Select team members": the leader and members who work for a client. Only the people ticked here (and the head of the
  // department and the admin) can see that client, its updates, chat and alerts.
  function mountPicker(box, initial) {
    const state = { list: [], picked: new Set(initial || []), note: 'Select the department first.' };
    let seq = 0;
    // someone who already works for the most clients one person can have cannot be given another
    const full = (e) => e.limit && e.otherClients >= e.limit && !state.picked.has(e.id);
    const draw = () => {
      const n = state.list.length;
      E.mount(box, html`<div class="muted small" style="margin-bottom:8px">Tick the people who work for this client. Only they, the head of the department and you can see its sheet, chat and alerts.</div>
        ${n ? html`<div class="row" style="margin-bottom:8px;gap:8px"><button type="button" class="btn sm" data-pick="all">Select all</button><button type="button" class="btn sm" data-pick="none">Clear</button><span class="muted small cnt"></span></div>
          <div class="people">${state.list.map((e) => html`<label class="${full(e) ? 'full' : ''}"><input type="checkbox" data-pid="${e.id}" ${state.picked.has(e.id) ? E.raw('checked') : ''} ${full(e) ? E.raw('disabled') : ''}>
            <span><b>${e.name}</b> <span class="muted small">${e.empCode || ''}</span><span class="muted small"> · ${e.teamName || 'No team'}</span>
              ${e.otherClients ? html`<span class="muted small"> · works for ${e.otherClients} other client${e.otherClients === 1 ? '' : 's'}${full(e) ? ' (the most one person can have)' : ''}</span>` : ''}</span>
            ${e.role === 'Team leader' ? html`<span class="badge ok" style="margin-left:auto">Team leader</span>` : html`<span class="badge" style="margin-left:auto">Member</span>`}</label>`)}</div>
          <div class="small warnbox" hidden></div>`
          : html`<div class="muted">${state.note}</div>`}`);
      count();
    };
    const count = () => {
      const c = E.$('.cnt', box); if (!c) return;
      c.textContent = `${state.picked.size} of ${state.list.length} selected`;
      const w = E.$('.warnbox', box);
      w.hidden = state.picked.size > 0;
      w.textContent = 'Nobody is selected, so only the head of the department and you will see this client.';
    };
    box.addEventListener('change', (ev) => {
      const cb = ev.target.closest('input[data-pid]'); if (!cb) return;
      const id = Number(cb.dataset.pid);
      if (cb.checked) state.picked.add(id); else state.picked.delete(id);
      count();
    });
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pick]'); if (!b) return;
      state.picked = b.dataset.pick === 'all' ? new Set(state.list.filter((e) => !(e.limit && e.otherClients >= e.limit)).map((e) => e.id)) : new Set();
      for (const cb of box.querySelectorAll('input[data-pid]')) cb.checked = state.picked.has(Number(cb.dataset.pid));
      count();
    });
    const show = (list, note) => {
      state.list = list; state.note = note;
      const ok = new Set(list.map((e) => e.id));
      state.picked = new Set([...state.picked].filter((id) => ok.has(id))); // a person who is not on the chosen team drops out
      draw();
    };
    draw();
    return {
      ids: () => [...state.picked],
      preselect: (ids) => { seq++; state.picked = new Set(ids); },
      set: (list) => show(list, 'This team has no members yet. Add people to it first.'),
      async load(departmentId, teamId) {
        const mine = ++seq;
        if (!departmentId) return show([], 'Select the department first.');
        try {
          const list = await E.get(`/api/clients/candidates?departmentId=${departmentId}${teamId ? `&teamId=${teamId}` : ''}`);
          if (mine === seq) show(list, 'This team has no members yet. Add people to it first.');
        } catch (ex) { if (mine === seq) show([], ex.message); }
      },
    };
  }

  // Add or remove people of an existing client later (opened from the Clients list).
  async function peopleForm(c, onSaved) {
    const r = await E.get(`/api/clients/${c.id}/staff`);
    const { form } = E.modal({
      title: `Team members of ${c.username}`, submit: 'Save', wide: true,
      body: html`<p class="muted">${c.teamName ? html`Team: <b>${c.teamName}</b>.` : html`This client is not tied to one team, so you can choose from the whole department.`} A person you remove loses access to the client's chat and sheet at once.</p><div id="peopleBox"></div>`,
      onSubmit: async (v, { close }) => {
        const res = await E.put(`/api/clients/${c.id}/staff`, { employeeIds: picker.ids() });
        E.toast(`Saved: ${res.total} ${res.total === 1 ? 'person' : 'people'} on this client`); close(); onSaved();
      },
    });
    const picker = mountPicker(E.$('#peopleBox', form), r.candidates.filter((e) => e.chosen).map((e) => e.id));
    picker.set(r.candidates);
  }

  async function clientForm(existing, onSaved) {
    const [depts, teams] = await Promise.all([E.departments(), E.teams('')]);
    const c = existing || {};
    const teamOpts = (deptId) => [{ value: '', label: 'Whole department' }, ...teams.filter((t) => String(t.departmentId) === String(deptId)).map((t) => ({ value: t.id, label: t.name }))];
    let secretLoaded = false;
    let picker;
    const { form } = E.modal({
      title: existing ? `Client ${c.username}` : 'Add client', wide: true, submit: existing ? 'Save' : 'Create client',
      body: html`<div class="form">
        ${E.field({ name: 'username', label: 'Client ID (username)', value: c.username, placeholder: existing ? '' : 'Leave empty for an automatic ID like CL-0001', help: 'The team knows the client only by this ID. Letters, numbers, dot, dash.' })}
        ${existing ? E.field({ name: 'status', label: 'Status', type: 'select', value: c.status, options: [{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (cannot sign in)' }] })
          : E.field({ name: 'password', label: 'Portal password', type: 'password', required: true, help: 'At least 8 characters. You give it to the client.', attrs: 'autocomplete="new-password"' })}
        ${E.field({ name: 'departmentId', label: 'Department', type: 'select', required: true, value: c.departmentId ?? '', options: [{ value: '', label: 'Select…' }, ...E.idOptions(depts)] })}
        ${E.field({ name: 'teamId', label: 'Team that works for this client', type: 'select', value: c.teamId ?? '', options: teamOpts(c.departmentId), help: 'Pick the team, then choose below exactly which of its people work for this client.' })}
        <div class="sect">Select team members</div>
        <div class="full" id="peopleBox"></div>
        <div class="sect">Private details (only the admin sees these)</div>
        ${E.field({ name: 'displayName', label: 'Client name', value: c.displayName, full: true })}
        ${E.field({ name: 'contact', label: 'Contact (phone / email)', value: c.contact, full: true })}
        ${existing ? html`<div class="full"><div class="muted small" style="margin-bottom:6px">Account details (store logins and other secrets)</div>
            ${c.hasSecret ? html`<button type="button" class="btn sm" id="showSecret">Show / edit account details</button><span class="muted small"> Every viewing is written to the activity log.</span>` : html`<button type="button" class="btn sm" id="showSecret">Add account details</button>`}
            <textarea name="secretInfo" rows="5" hidden style="margin-top:8px" placeholder="Store login, email, anything private about the account"></textarea></div>`
          : E.field({ name: 'secretInfo', label: 'Account details (store logins and other secrets)', type: 'textarea', value: '', full: true, placeholder: 'Store login, email, anything private about the account' })}</div>`,
      onOpen: async (f) => {
        const dept = f.elements.departmentId;
        picker = mountPicker(E.$('#peopleBox', f), []);
        const reload = () => picker.load(dept.value, f.elements.teamId.value);
        dept.addEventListener('change', () => { E.mount(f.elements.teamId, html`${teamOpts(dept.value).map((o) => html`<option value="${o.value}">${o.label}</option>`)}`); reload(); });
        f.elements.teamId.addEventListener('change', reload);
        if (existing) {
          try {
            const r = await E.get(`/api/clients/${c.id}/staff`);
            picker.preselect(r.candidates.filter((e) => e.chosen).map((e) => e.id));
            picker.set(r.candidates);
          } catch (ex) { E.toast(ex.message, 'bad'); }
        } else reload();
        const b = E.$('#showSecret', f);
        if (b) b.onclick = async () => {
          try {
            const r = await E.get(`/api/clients/${c.id}/secret`);
            const ta = f.elements.secretInfo; ta.value = r.secretInfo; ta.hidden = false; secretLoaded = true; b.remove(); ta.focus();
          } catch (ex) { E.toast(ex.message, 'bad'); }
        };
      },
      onSubmit: async (v, { close }) => {
        const body = { ...v, teamId: v.teamId || null, departmentId: Number(v.departmentId), staffIds: picker.ids() };
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
              { label: 'Team members', render: (c) => (c.staffCount ? html`${c.staffCount} chosen` : html`<span class="badge warn">Nobody chosen</span>`) },
              { label: 'Status', render: (c) => (c.status === 'active' ? html`<span class="badge ok">Active</span>` : html`<span class="badge bad">Disabled</span>`) },
              { label: 'Today (sales)', class: 'num', render: (c) => money(c.today.sales) }, { label: 'Total sales', class: 'num', render: (c) => money(c.total.sales) },
              { label: 'Last sign-in', render: (c) => (c.lastLoginAt ? fmt.dateTime(c.lastLoginAt) : html`<span class="muted">Never</span>`) },
              { label: 'Answered by', render: (c) => (c.chatOwnerName ? html`🔒 ${c.chatOwnerName}` : html`<span class="muted">Nobody yet</span>`) },
              { label: 'Chat', render: (c) => html`${c.alertNeedsReply ? html`<span class="badge bad">Alert waiting</span> ` : ''}${c.inquiryNeedsReply ? html`<span class="badge warn">Message waiting</span>` : ''}${!c.alertNeedsReply && !c.inquiryNeedsReply ? html`<span class="muted">-</span>` : ''}` },
              { label: '', class: 'right', render: (c) => html`<div class="actions"><button class="btn sm" data-act="chat" data-id="${c.id}">Chat</button><button class="btn sm" data-act="alerts" data-id="${c.id}">Alerts</button><button class="btn sm" data-act="people" data-id="${c.id}">Members</button><button class="btn sm" data-act="edit" data-id="${c.id}">Edit</button><button class="btn sm" data-act="pw" data-id="${c.id}">🔑</button><button class="btn sm danger" data-act="del" data-id="${c.id}">Delete</button></div>` },
            ], rows, 'No clients yet. Add the first one.')}`;
        },
        bind: (box, refresh) => {
          const find = (id) => rows.find((c) => String(c.id) === id);
          E.actions(box, {
            edit: (id) => clientForm(find(id), refresh), people: (id) => peopleForm(find(id), refresh), pw: (id) => resetPassword(find(id)), del: (id) => deleteClient(find(id), refresh),
            chat: (id) => staffChat(find(id), 'inquiry', refresh), alerts: (id) => staffChat(find(id), 'alert', refresh),
          });
        },
      });
      E.actions(el, { add: () => clientForm(null, ctrl.refresh) });
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
              { label: 'Last message', render: (c) => (c.chat === 'colleague' ? html`<span class="muted">-</span>` : at(c) ? fmt.dateTime(at(c)) : html`<span class="muted">No messages yet</span>`) },
              { label: 'Status', render: (c) => (c.chat === 'colleague' ? html`<span class="badge">🔒 Private to a colleague</span>` : needs(c) ? html`<span class="badge bad">${alert ? 'ALERT: needs a reply now' : 'Needs a reply'}</span>` : at(c) ? html`<span class="badge ok">Answered</span>` : '') },
              { label: '', class: 'right', render: (c) => (c.chat === 'colleague' ? '' : html`<button class="btn sm ${needs(c) ? 'primary' : ''}" data-act="open" data-id="${c.id}">${needs(c) ? 'Answer now' : 'Open'}</button>`) },
            ], sorted, 'No client is assigned to you yet.')}`;
        },
        bind: (box, refresh) => E.actions(box, { open: (cid) => staffChat(clients.find((c) => String(c.id) === cid), channel, refresh) }),
      });
      E.actions(el, {
        raise: () => {
          E.modal({
            title: 'Raise an alert to a client', submit: 'Open the alert chat',
            body: html`<p class="muted">Use this when you need something from the client right now, for example a code (OTP). The client gets an urgent notification and a red banner.</p>
              <div class="form">${E.field({ name: 'clientId', label: 'Client ID', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select…' }, ...clients.filter((c) => c.status === 'active' && c.chat !== 'colleague').map((c) => ({ value: c.id, label: c.username }))] })}</div>`,
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
      let stamp = null;
      const monthName = (m) => { const [y, mo] = m.split('-'); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(mo) - 1]} ${y}`; };
      const block = (c, many) => {
        const max = Math.max(1, ...c.chart.map((x) => x.sales));
        return html`<section style="margin-bottom:34px">
          ${many ? html`<h2 style="margin:0 0 14px">${CUR_LABEL[c.currency] || c.currency}</h2>` : ''}
          <h3 style="margin:0 0 10px">Today <span class="muted" style="font-weight:400;font-size:14px">· ${fmt.date(E.today())}</span></h3>
          ${numbers(c.today, c.currency, { sub: c.today.qty ? 'sold today' : 'nothing on the sheet for today' })}
          <h3 style="margin:26px 0 10px">Daily</h3>
          <div class="card"><h3>Sales: last 14 days</h3><div class="bars">${c.chart.map((x) => html`<div class="b"><span class="val">${x.sales ? fmt.num(Math.round(x.sales)) : ''}</span><div class="track"><div class="fill" style="height:${(x.sales / max) * 100}%"></div></div><span class="lab">${x.date.slice(8)}</span></div>`)}</div></div>
          <div style="margin-top:14px">${E.table([
            { label: 'Date', render: (x) => html`<b>${fmt.date(x.date)}</b>` }, { label: 'Qty', class: 'num', render: (x) => fmt.num(x.qty) }, { label: 'Ali Exp Price', class: 'num', render: (x) => moneyIn(x.investment, c.currency) },
            { label: 'Sales', class: 'num', render: (x) => moneyIn(x.sales, c.currency) }, { label: 'Net Profit', class: 'num', render: (x) => profitIn(x.profit, c.currency) },
          ], c.days.slice(0, 31), 'No days yet.')}</div>
          ${c.days.length > 31 ? html`<p class="muted small" style="margin-top:6px">The latest 31 days are listed. Every day is in the monthly table and in the total.</p>` : ''}
          <h3 style="margin:26px 0 10px">Monthly <span class="muted" style="font-weight:400;font-size:14px">· this month so far: ${moneyIn(c.month.sales, c.currency)} sales, ${moneyIn(c.month.profit, c.currency)} net profit</span></h3>
          ${E.table([
            { label: 'Month', render: (x) => html`<b>${monthName(x.month)}</b>` }, { label: 'Qty', class: 'num', render: (x) => fmt.num(x.qty) }, { label: 'Ali Exp Price', class: 'num', render: (x) => moneyIn(x.investment, c.currency) },
            { label: 'Sales', class: 'num', render: (x) => moneyIn(x.sales, c.currency) }, { label: 'Net Profit', class: 'num', render: (x) => profitIn(x.profit, c.currency) },
          ], c.months, 'No months yet.')}
          <h3 style="margin:26px 0 10px">Total <span class="muted" style="font-weight:400;font-size:14px">· ${c.total.since ? `since ${fmt.date(c.total.since)} · ${c.total.days} day${c.total.days === 1 ? '' : 's'} with sales` : 'nothing yet'}</span></h3>
          ${numbers(c.total, c.currency, { sub: 'everything so far' })}</section>`;
      };
      const draw = async () => {
        const d = await E.get('/api/portal/sales');
        E.mount(el, html`${E.pageHead('Your sales', `Client ${d.username} · worked out from your daily sheet${d.updatedAt ? `, last updated ${fmt.dateTime(d.updatedAt)}` : ''}`)}
          ${d.currencies.length ? d.currencies.map((c) => block(c, d.currencies.length > 1)) : html`<div class="card empty">No sheet has been sent to you yet. Your sales appear here as soon as the team sends your daily sheet.</div>`}`);
      };
      stamp = (await E.get('/api/portal/sheet/stamp')).stamp;
      await draw();
      keepFresh('portal-sales', async () => {
        if (document.querySelector('.overlay')) return;
        try { const n = (await E.get('/api/portal/sheet/stamp')).stamp; if (n !== stamp) { stamp = n; const y = window.scrollY; await draw(); window.scrollTo(0, y); E.toast('Your sales were updated'); } } catch { /* try again next time */ }
      }, 20000);
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
