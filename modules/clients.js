(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const STAFF = ['admin', 'hod', 'leader', 'member'];
  const staffGroup = () => 'Clients';
  const dash = (v) => v || html`<span class="muted">-</span>`;

  // Every update has its own currency (AUD, USD or GBP). Figures are always shown in the currency they were written in.
  const CUR_LABEL = { AUD: 'AUD $', USD: 'USD $', GBP: 'GBP £' };
  const CUR_OPTS = ['AUD', 'USD', 'GBP'].map((c) => ({ value: c, label: CUR_LABEL[c] }));
  const moneyIn = (n, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(n || 0); } catch { return Number(n || 0).toFixed(2); } };
  const revenueIn = (n, cur) => html`<span class="${n < 0 ? 'neg' : 'pos'}">${moneyIn(n, cur)}</span>`;
  const defaultCur = () => { try { const v = localStorage.getItem('etx-update-currency'); if (CUR_LABEL[v]) return v; } catch { /* no storage */ } return CUR_LABEL[E.settings.currency] ? E.settings.currency : 'USD'; };
  // The four numbers of a client in one currency, as cards.
  const numbers = (t, cur, { sub = '' } = {}) => html`<div class="stats quad">${E.stat('Orders', fmt.num(t.orders), { sub })}${E.stat('Investment', moneyIn(t.investment, cur))}${E.stat('Sales', moneyIn(t.sales, cur), { cls: 'accent' })}
    ${E.stat('Revenue', moneyIn(t.revenue, cur), { cls: t.revenue < 0 ? 'bad' : 'accent', sub: 'sales − investment' })}</div>`;
  // The figures of a client in ITS currency: "AUD 3 orders · A$300.00 sales · revenue A$200.00"
  const inClientCurrency = (t, cur, full = false) => html`<div><span class="badge">${cur}</span> <b>${fmt.num(t.orders)}</b> order${t.orders === 1 ? '' : 's'} · ${full ? html`${moneyIn(t.investment, cur)} invested · ` : ''}<b>${moneyIn(t.sales, cur)}</b> sales · revenue ${moneyIn(t.revenue, cur)}</div>`;
  const salesCell = (t, cur) => html`<div>${moneyIn(t.sales, cur)}</div>`;

  // ====================================================================================
  // A chat that keeps itself up to date. Used inline by the client portal and in a window by the team.
  //   load()    -> { messages: [...] }       send(text)
  //   mine(m)   -> is it written by the person looking at the screen?     labelOf(m) -> name above the message
  // ====================================================================================
  const toDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('The file could not be read')); r.readAsDataURL(blob); });
  const MAX_PIC = 3 * 1024 * 1024, MAX_VOICE = 2.5 * 1024 * 1024, MAX_VOICE_SECONDS = 180; // kept under what a web host accepts in one request
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // A picture from the phone or computer, made smaller so it sends fast (longest side 1600 px).
  async function preparePicture(file) {
    if (!/^image\//.test(file.type)) throw new Error('Please choose a picture');
    const okType = /^image\/(jpeg|png|webp|gif)$/.test(file.type);
    if (okType && file.size <= 600 * 1024) return file;
    if (file.type === 'image/gif') { if (file.size > MAX_PIC) throw new Error('This GIF is too big (the most is 3 MB)'); return file; }
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      bmp.close?.();
      const out = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.82));
      if (!out) throw new Error('x');
      return out;
    } catch {
      if (okType && file.size <= MAX_PIC) return file;
      throw new Error('This picture cannot be used. Please choose a JPEG or PNG picture (the most is 3 MB)');
    }
  }

  function mountChat(box, { load, send, mine, labelOf, placeholder, quick = [], urgent = false, active, every = 3000, sendLabel = 'Send', fileUrl }) {
    E.mount(box, html`<div class="chatlog" tabindex="0" aria-live="polite"></div>
      <div class="chatform"><div class="chatcol"><div class="pendingbox" hidden></div><textarea rows="2" maxlength="2000" placeholder="${placeholder}"></textarea></div>
        <div class="chatbtns"><button type="button" class="btn icon" data-a="pic" title="Send a picture" aria-label="Send a picture"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg></button><button type="button" class="btn icon" data-a="mic" title="Record a voice note" aria-label="Record a voice note"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/></svg></button>
          <button type="button" class="btn primary send ${urgent ? 'danger-solid' : ''}">${sendLabel}</button><input type="file" accept="image/*" hidden></div></div>
      ${quick.length ? html`<div class="quick">${quick.map((q) => html`<button type="button" class="chip" data-q="${q}">${q}</button>`)}</div>` : ''}`);
    const log = E.$('.chatlog', box);
    const ta = E.$('textarea', box);
    const btn = E.$('.chatform .send', box);
    const picBtn = E.$('[data-a=pic]', box);
    const micBtn = E.$('[data-a=mic]', box);
    const micIdle = micBtn.innerHTML;
    const fileInput = E.$('input[type=file]', box);
    const pendingBox = E.$('.pendingbox', box);
    let msgs = [];
    let sig = '';
    let lastId = 0;
    let timer = null;
    let first = true;
    let pending = null; // { kind, blob, url } a picture or voice note waiting to be sent
    let rec = null; // the voice note being recorded
    let stick = true; // the log shows its bottom: stay there when a picture finishes loading
    log.addEventListener('scroll', () => { stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 80; });
    log.addEventListener('load', () => { if (stick) log.scrollTop = log.scrollHeight; }, true);

    const setPending = (p) => {
      if (pending?.url) URL.revokeObjectURL(pending.url);
      pending = p;
      pendingBox.hidden = !p;
      E.mount(pendingBox, p ? html`${p.kind === 'image' ? html`<img class="chatimg small" alt="Picture to send" src="${p.url}">` : html`<audio class="chataudio" controls src="${p.url}"></audio>`}<button type="button" class="btn sm" data-rm>✕ Remove</button>` : html``);
    };
    pendingBox.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) setPending(null); });

    const draw = () => {
      E.mount(log, msgs.length ? html`${msgs.map((m) => html`<div class="bubble ${mine(m) ? 'mine' : 'theirs'}"><div class="who">${labelOf(m)} · ${fmt.dateTime(m.createdAt)}</div>${m.file && fileUrl
        ? (m.file.kind === 'image' ? html`<a href="${fileUrl(m)}" target="_blank" rel="noopener"><img class="chatimg" loading="lazy" alt="Picture" src="${fileUrl(m)}"></a>` : html`<audio class="chataudio" controls preload="none" src="${fileUrl(m)}"></audio>`) : ''}${m.body ? html`<div class="body">${m.body}</div>` : ''}${mine(m) && m.seen ? html`<div class="seen">✓ Seen</div>` : ''}</div>`)}`
        : html`<div class="muted center" style="padding:24px 0">No messages yet.</div>`);
      log.scrollTop = log.scrollHeight;
    };
    const pull = async () => {
      let r;
      try { r = await load(); } catch (ex) { if (ex.status === 403 || ex.status === 404) { destroy(); E.toast(ex.message, 'bad'); } return; } // e.g. the person was taken off this client
      const next = `${r.messages.length}:${r.messages.at(-1)?.id}:${r.messages.filter((m) => m.seen).length}`;
      if (next === sig) return;
      if ([...log.querySelectorAll('audio')].some((x) => !x.paused && !x.ended)) return; // do not cut a voice note that is playing: show the new message right after it
      const newest = r.messages.at(-1)?.id || 0;
      if (!first && newest > lastId && r.messages.some((m) => m.id > lastId && !mine(m))) E.beep?.(urgent);
      sig = next; lastId = newest; first = false; msgs = r.messages; draw();
    };
    const submit = async () => {
      if (rec) { E.toast('Stop the recording first', 'bad'); return; }
      const text = ta.value.trim();
      if (!text && !pending) return;
      btn.disabled = true;
      try {
        const attachment = pending ? { data: (await toDataUrl(pending.blob)).split(',')[1] } : null;
        await send(text, attachment);
        ta.value = ''; setPending(null);
        await pull();
      } catch (ex) { E.toast(ex.message, 'bad'); } finally { btn.disabled = false; ta.focus(); }
    };
    btn.onclick = submit;
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });

    // a picture
    picBtn.onclick = () => { if (rec) return; fileInput.value = ''; fileInput.click(); };
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try { const blob = await preparePicture(f); setPending({ kind: 'image', blob, url: URL.createObjectURL(blob) }); } catch (ex) { E.toast(ex.message, 'bad'); }
    };

    // a voice note: tap the microphone to start, tap again to stop, listen, then send
    const stopRecording = (keep) => { if (rec) { rec.keep = keep; try { rec.mr.stop(); } catch { /* already stopped */ } } };
    micBtn.onclick = async () => {
      if (rec) { stopRecording(true); return; }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { E.toast('Voice notes need a newer browser, and a secure (https) address', 'bad'); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { E.toast('The microphone is blocked. Allow it for this website (lock icon next to the address) and try again.', 'bad'); return; }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t));
      let mr;
      try { mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 }); } catch { stream.getTracks().forEach((t) => t.stop()); E.toast('This browser cannot record voice notes', 'bad'); return; }
      const chunks = [];
      let secs = 0;
      rec = { mr, keep: true };
      setPending(null);
      micBtn.classList.add('rec'); micBtn.textContent = `⏹ ${clock(0)}`; micBtn.title = 'Stop recording';
      const tick = setInterval(() => { secs++; micBtn.textContent = `⏹ ${clock(secs)}`; if (secs >= MAX_VOICE_SECONDS) stopRecording(true); }, 1000);
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = () => {
        clearInterval(tick); stream.getTracks().forEach((t) => t.stop());
        const keep = rec?.keep; rec = null;
        micBtn.classList.remove('rec'); micBtn.innerHTML = micIdle; micBtn.title = 'Record a voice note';
        if (!keep || !chunks.length) return;
        const blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' });
        if (secs < 1) { E.toast('That was too short', 'bad'); return; }
        if (blob.size > MAX_VOICE) { E.toast('The voice note is too long. Please keep it under 3 minutes.', 'bad'); return; }
        setPending({ kind: 'audio', blob, url: URL.createObjectURL(blob) });
      };
      mr.start(1000);
    };

    box.addEventListener('click', (e) => { const c = e.target.closest('[data-q]'); if (c) { ta.value = c.dataset.q; ta.focus(); } });
    const destroy = () => { clearInterval(timer); timer = null; stopRecording(false); setPending(null); };
    timer = setInterval(() => { if (!active()) destroy(); else pull(); }, every);
    pull();
    return { destroy, pull, focus: () => ta.focus() };
  }

  // The team's side of one client's chat, in a window.
  async function staffChat(client, channel, onClose) {
    const alert = channel === 'alert';
    let chat;
    const { form, close } = E.modal({
      title: `${alert ? '🚨 Alerts' : 'Chat'} - ${client.username}`, wide: true, cancel: 'Close',
      body: html`${alert ? html`<div class="alertnote"><b>Urgent channel.</b> Use it for codes (OTP), confidential details and anything that must be answered at once. The text is never shown in notifications.</div>`
        : html`<div class="muted small" style="margin-bottom:8px">The client sees only "eTricks": not your name. Everybody chosen for this client, the head and the admin can write here.</div>`}<div id="chatbox" class="chatbox ${alert ? 'alertbox' : ''}"></div>`,
    });
    const overlay = form.closest('.overlay');
    chat = mountChat(E.$('#chatbox', form), {
      load: () => E.get(`/api/clients/${client.id}/chat?channel=${channel}`),
      send: (body, attachment) => E.post(`/api/clients/${client.id}/chat`, { channel, body, attachment }), fileUrl: (m) => `/api/clients/${client.id}/chat/files/${m.file.id}`,
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
      E.mount(box, html`<div class="muted small" style="margin-bottom:8px">Tick the people who work for this client. Only they, the head of the department and you can see its updates, chat and alerts.</div>
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
      body: html`<p class="muted">${c.teamName ? html`Team: <b>${c.teamName}</b>.` : html`This client is not tied to one team, so you can choose from the whole department.`} A person you remove loses access to the client's chat and updates at once.</p><div id="peopleBox"></div>`,
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
        ${E.field({ name: 'currency', label: 'Currency shown to this client', type: 'select', required: true, value: c.currency || defaultCur(), options: CUR_OPTS, help: 'The client sees all its sales in this currency. An update written in another currency is converted with the exchange rates in Settings.' })}
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
              { label: 'Client', render: (c) => html`<b>${c.username}</b> <span class="badge">${c.currency}</span>${c.displayName ? html`<div class="muted small">${c.displayName}</div>` : ''}` },
              { label: 'Department / team', render: (c) => html`${c.departmentName}<div class="muted small">${c.teamName || 'Whole department'}</div>` },
              { label: 'Team members', render: (c) => (c.staffCount ? html`${c.staffCount} chosen` : html`<span class="badge warn">Nobody chosen</span>`) },
              { label: 'Status', render: (c) => (c.status === 'active' ? html`<span class="badge ok">Active</span>` : html`<span class="badge bad">Disabled</span>`) },
              { label: 'Today (sales)', class: 'num', render: (c) => salesCell(c.today, c.currency) }, { label: 'Total sales', class: 'num', render: (c) => salesCell(c.total, c.currency) },
              { label: 'Last sign-in', render: (c) => (c.lastLoginAt ? fmt.dateTime(c.lastLoginAt) : html`<span class="muted">Never</span>`) },
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
  // TEAM: the day's work for a client
  // ====================================================================================
  function updateForm(clients, existing, preset, onSaved) {
    const e = existing || { date: E.today(), clientId: preset };
    const curOf = (id) => clients.find((c) => String(c.id) === String(id))?.currency;
    const { form } = E.modal({
      title: existing ? 'Edit client update' : 'Add client update', wide: true,
      body: html`<div class="form">
        ${E.field({ name: 'clientId', label: 'Client ID', type: 'select', required: true, value: e.clientId ?? '', full: true, options: [{ value: '', label: 'Select the client…' }, ...clients.map((c) => ({ value: c.id, label: c.username }))] })}
        ${E.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true, attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'market', label: 'Market', value: e.market, placeholder: 'e.g. Amazon US' })}
        ${E.field({ name: 'store', label: 'Store / account', value: e.store })}
        ${E.field({ name: 'orders', label: 'Orders', type: 'number', value: e.orders ?? '', attrs: 'min="0" step="1"' })}
        ${E.field({ name: 'investment', label: 'Investment', type: 'number', value: e.investment ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'sales', label: 'Sales', type: 'number', value: e.sales ?? '', attrs: 'min="0" step="0.01"' })}
        ${E.field({ name: 'currency', label: 'Currency', type: 'select', required: true, value: e.currency || curOf(e.clientId) || defaultCur(), options: CUR_OPTS })}
        <div class="muted small" style="align-self:end;padding-bottom:10px">It starts as the client's currency. If you write the update in another one, the client sees it converted into its own. Revenue is worked out: sales − investment.</div>
        ${E.field({ name: 'note', label: 'Update for the client (what was done today)', type: 'textarea', value: e.note, full: true, attrs: 'rows="4"', placeholder: 'e.g. Listed 20 products, shipped 5 orders, answered 2 buyer messages' })}</div>
        <p class="muted small"><b>The client reads this note.</b> It is shown as an update from "eTricks". Do not write your own name, a colleague's name or anything private.</p>`,
      onOpen: (f) => {
        // picking a client sets the currency to that client's, until somebody chooses a currency by hand
        let touched = !!existing;
        f.elements.currency.addEventListener('change', () => { touched = true; });
        f.elements.clientId.addEventListener('change', () => { const c = curOf(f.elements.clientId.value); if (!touched && c) f.elements.currency.value = c; });
      },
      onSubmit: async (v, { close }) => {
        const body = { ...v, clientId: Number(v.clientId) };
        try { localStorage.setItem('etx-update-currency', v.currency); } catch { /* no storage */ }
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
              <div class="muted small">Today</div>${inClientCurrency(c.today, c.currency)}
              <div class="muted small" style="margin-top:8px">All time</div>${inClientCurrency(c.total, c.currency, true)}</div>`)}</div>`
            : html`<div class="card empty" style="margin-bottom:16px">No client is assigned to you yet. The admin chooses which people work for each client.</div>`}
            ${E.table([
              { label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Client', render: (x) => html`<b>${x.username}</b>` },
              { label: 'Market / store', render: (x) => html`${dash(x.market)}<div class="muted small">${x.store || ''}</div>` },
              { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Investment', class: 'num', render: (x) => moneyIn(x.investment, x.currency) },
              { label: 'Sales', class: 'num', render: (x) => moneyIn(x.sales, x.currency) }, { label: 'Revenue', class: 'num', render: (x) => revenueIn(x.revenue, x.currency) },
              { label: 'Update the client reads', class: 'wrap', render: (x) => x.note || '' },
              { label: 'Written by', render: (x) => html`<span class="muted small">${x.by}</span>` },
              { label: '', class: 'right', render: (x) => (x.canEdit ? html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${x.id}">Delete</button></div>` : '') },
            ], rows, 'No updates in this period.')}
            ${rows.length ? html`<div class="muted small" style="margin-top:8px">Shown: ${(r.totalsBy || []).map((t, i) => html`${i ? ' | ' : ''}<b>${t.currency}</b> ${fmt.num(t.orders)} orders · investment ${moneyIn(t.investment, t.currency)} · sales ${moneyIn(t.sales, t.currency)} · revenue ${moneyIn(t.revenue, t.currency)}`)}</div>` : ''}`;
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
      const block = (c, many) => {
        const max = Math.max(1, ...c.chart.map((x) => x.sales));
        const cur = c.currency;
        return html`<section style="margin-bottom:34px">
          ${many ? html`<h2 style="margin:0 0 14px">${CUR_LABEL[cur] || cur}</h2>` : ''}
          <h3 style="margin:0 0 10px">Today <span class="muted" style="font-weight:400;font-size:14px">· ${fmt.date(c.today.date)}</span></h3>
          ${numbers(c.today, cur, { sub: c.today.orders ? 'received today' : 'nothing reported yet today' })}
          <h3 style="margin:26px 0 10px">Daily</h3>
          <div class="card"><h3>Sales: last 14 days (${cur})</h3><div class="bars">${c.chart.map((x) => html`<div class="b"><span class="val">${x.sales ? fmt.num(Math.round(x.sales)) : ''}</span><div class="track"><div class="fill" style="height:${(x.sales / max) * 100}%"></div></div><span class="lab">${x.date.slice(8)}</span></div>`)}</div></div>
          <div style="margin-top:14px">${E.table([
            { label: 'Date', render: (x) => html`<b>${fmt.date(x.date)}</b>` }, { label: 'Orders', class: 'num', render: (x) => fmt.num(x.orders) }, { label: 'Investment', class: 'num', render: (x) => moneyIn(x.investment, cur) },
            { label: 'Sales', class: 'num', render: (x) => moneyIn(x.sales, cur) }, { label: 'Revenue', class: 'num', render: (x) => revenueIn(x.revenue, cur) },
            { label: 'What eTricks did', class: 'wrap', render: (x) => html`${x.updates.filter((u) => u.note || u.market || u.store).map((u) => html`<div class="small">${[u.market, u.store].filter(Boolean).join(' · ')}${u.note ? html`${u.market || u.store ? ': ' : ''}${u.note}` : ''}</div>`)}${x.updates.every((u) => !u.note && !u.market && !u.store) ? html`<span class="muted small">-</span>` : ''}` },
          ], c.days, 'No updates in this period.')}</div>
          ${c.days.length ? html`<p class="muted small" style="margin-top:6px">In this period: ${fmt.num(c.range.orders)} orders · investment ${moneyIn(c.range.investment, cur)} · sales ${moneyIn(c.range.sales, cur)} · revenue ${moneyIn(c.range.revenue, cur)}</p>` : ''}
          <h3 style="margin:26px 0 10px">Total <span class="muted" style="font-weight:400;font-size:14px">· ${c.total.since ? `since ${fmt.date(c.total.since)} · ${c.total.days} day${c.total.days === 1 ? '' : 's'}` : 'nothing yet'}</span></h3>
          ${numbers(c.total, cur, { sub: 'everything so far' })}
          <p class="muted small">This month: ${fmt.num(c.month.orders)} orders · investment ${moneyIn(c.month.investment, cur)} · sales ${moneyIn(c.month.sales, cur)} · revenue ${moneyIn(c.month.revenue, cur)}</p></section>`;
      };
      const draw = async (from, to) => {
        const d = await load(from, to);
        E.mount(el, html`${E.pageHead('Your sales', `Client ${d.username} · ${d.currency} · updated daily by eTricks`, html`<button class="btn" data-act="refresh">↻ Refresh</button>`)}
          <form class="filters" id="range" style="margin-bottom:18px">${E.field({ name: 'from', label: 'From', type: 'date', value: d.from })}${E.field({ name: 'to', label: 'To', type: 'date', value: d.to })}</form>
          ${d.converted ? html`<p class="muted small" style="margin:-6px 0 16px">All figures are in ${CUR_LABEL[d.currency] || d.currency}. An update written in another currency is converted with the exchange rates of the day.</p>` : ''}
          ${d.currencies.length ? d.currencies.map((c) => block(c, false)) : html`<div class="card empty">Nothing has been reported yet. Your sales appear here as soon as the team adds the first update.</div>`}`);
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
          const sig = d.currencies.map((c) => `${c.currency}:${c.total.orders}|${c.total.sales}|${c.total.investment}|${c.today.orders}|${c.today.sales}|${c.days.length}`).join(';');
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
      load: () => E.get(`/api/portal/chat?channel=${channel}`), send: (body, attachment) => E.post('/api/portal/chat', { channel, body, attachment }), fileUrl: (m) => `/api/portal/chat/files/${m.file.id}`,
      mine: (m) => m.from === 'you', labelOf: (m) => (m.from === 'you' ? 'You' : 'eTricks'),
      placeholder: alert ? 'Type your urgent message…' : 'Type your message…', urgent: alert, every: alert ? 2500 : 3500,
      active: () => el.isConnected && location.hash === `#/${id}`, sendLabel: alert ? '🚨 Send alert' : 'Send', ...opts,
    });
  };
  E.page({ id: 'portal-chat', title: 'Chat & Inquiry', icon: '✉', roles: CLIENT, order: 2, render: clientChatPage('portal-chat', 'inquiry', 'Chat & inquiry', 'Send a question, an inquiry or any message. Our team answers here.') });
  E.page({ id: 'portal-alerts', title: 'Alerts', icon: '🚨', roles: CLIENT, order: 3, render: clientChatPage('portal-alerts', 'alert', 'Alerts', 'Use this only when something needs an answer immediately. We are notified at once, and we use it to ask you for codes (OTP) or confidential details that cannot wait. Nothing you write here appears in notifications.') });
})();
