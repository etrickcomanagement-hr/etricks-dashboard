(() => {
  const E = window.Etricks;
  const { html, fmt } = E;

  const SEV_KIND = { low: '', medium: 'warn', high: 'bad' };
  const STATUS_KIND = { open: 'bad', under_review: 'warn', resolved: 'ok', dismissed: '' };
  const sevBadge = (s) => html`<span class="badge ${SEV_KIND[s]}">${fmt.label(s)}</span>`;
  const statusBadge = (s) => html`<span class="badge ${STATUS_KIND[s]}">${fmt.label(s)}</span>`;
  E.complaintBadges = { sevBadge, statusBadge };

  // ---------------- leader / admin ----------------
  async function fileForm(onSaved) {
    const [meta, emps] = await Promise.all([E.get('/api/complaints/meta'), E.employees(E.isAdmin() ? '' : E.user.departmentId)]);
    E.modal({
      title: 'File a complaint', wide: true, submit: 'File complaint',
      body: html`<div class="form">
        ${E.field({ name: 'employeeId', label: 'Person', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select a person…' }, ...emps.filter((e) => e.id !== E.user.employeeId).map((e) => ({ value: e.id, label: `${e.name} (${e.empCode})${e.role !== 'member' ? ` - ${E.roleLabel[e.role]}` : ''}${E.isAdmin() ? ` - ${e.departmentName}` : ''}` }))] })}
        ${E.field({ name: 'category', label: 'Category', type: 'select', required: true, options: meta.categories })}
        ${E.field({ name: 'severity', label: 'Severity', type: 'select', value: 'medium', options: meta.severities })}
        ${E.field({ name: 'incidentDate', label: 'Date it happened', type: 'date', value: E.today(), attrs: `max="${E.today()}"` })}
        ${E.field({ name: 'description', label: 'What happened?', type: 'textarea', required: true })}</div>
        <p class="muted small">The person is notified and can see this complaint and reply to it. Their head of department (and the admin) are told too. It also appears in their performance report.</p>`,
      onSubmit: async (v, { close }) => { await E.post('/api/complaints', v); E.toast('Complaint filed. The member has been notified.'); close(); onSaved(); },
    });
  }

  async function updateForm(c, onSaved) {
    const meta = await E.get('/api/complaints/meta');
    E.modal({
      title: `Complaint about ${c.employeeName}`, wide: true, submit: 'Save',
      body: html`<p><b>${c.category}</b> · ${sevBadge(c.severity)} · filed by ${c.filedBy} on ${fmt.date(c.createdAt)}</p><p>${c.description}</p>
        ${c.memberResponse ? html`<div class="card" style="margin-bottom:12px"><div class="muted small">${c.employeeName}'s reply (${fmt.date(c.respondedAt)})</div>${c.memberResponse}</div>` : html`<p class="muted small">No reply from the member yet.</p>`}
        <div class="form">${E.field({ name: 'status', label: 'Status', type: 'select', value: c.status, options: meta.statuses.map((s) => ({ value: s, label: fmt.label(s) })) })}
          ${E.field({ name: 'severity', label: 'Severity', type: 'select', value: c.severity, options: meta.severities })}
          ${E.field({ name: 'resolutionNote', label: 'Resolution / action taken', type: 'textarea', value: c.resolutionNote })}</div>`,
      onSubmit: async (v, { close }) => { await E.put(`/api/complaints/${c.id}`, v); E.toast('Complaint updated'); close(); onSaved(); },
    });
  }

  E.page({
    id: 'complaints', title: 'Complaints', icon: '⚠', roles: E.MANAGE, group: 'People', order: 50,
    async render(el) {
      let rows = [];
      const ctrl = await E.listPage(el, {
        title: 'Complaints', subtitle: 'Raise a complaint about somebody below you. They are notified and it is added to their report.', dept: true,
        actions: html`<button class="btn primary" data-act="add">+ File complaint</button>`,
        filters: [
          { name: 'search', label: 'Search', placeholder: 'Member or text' },
          { name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, 'open', 'under_review', 'resolved', 'dismissed'] },
          { name: 'severity', label: 'Severity', type: 'select', options: [{ value: '', label: 'Any' }, 'low', 'medium', 'high'] },
        ],
        csv: (f) => `/api/complaints${E.qs({ ...f, format: 'csv' })}`,
        load: async (f) => {
          rows = await E.get(`/api/complaints${E.qs(f)}`);
          return E.table([
            { label: 'Filed', render: (c) => html`${fmt.date(c.createdAt)}<div class="muted small">${c.filedBy}</div>` },
            { label: 'About', render: (c) => html`<b>${c.employeeName}</b>${c.employeeRole !== 'member' ? html` <span class="badge ${c.employeeRole === 'hod' ? 'info' : 'ok'}">${E.roleLabel[c.employeeRole]}</span>` : ''}<div class="muted small">${c.empCode}${E.isAdmin() ? ` · ${c.departmentName}` : ''}</div>` },
            { label: 'Complaint', class: 'wrap', render: (c) => html`<b>${c.category}</b> ${sevBadge(c.severity)}<div>${c.description}</div>${c.memberResponse ? html`<div class="muted small">Member replied: “${c.memberResponse}”</div>` : ''}${c.resolutionNote ? html`<div class="muted small">Action: ${c.resolutionNote}</div>` : ''}` },
            { label: 'Status', render: (c) => statusBadge(c.status) },
            { label: '', class: 'right', render: (c) => html`<div class="actions">${c.canManage ? html`<button class="btn sm" data-act="edit" data-id="${c.id}">Update</button>` : ''}${E.isAdmin() ? html`<button class="btn sm danger" data-act="del" data-id="${c.id}">Delete</button>` : ''}</div>` },
          ], rows, 'No complaints found.');
        },
        bind: (box, refresh) => E.actions(box, {
          edit: (id) => updateForm(rows.find((c) => String(c.id) === id), refresh),
          del: async (id) => { if (await E.confirm('Delete this complaint permanently? It is recorded in the activity log.', { yes: 'Delete', danger: true })) { await E.del(`/api/complaints/${id}`); E.toast('Deleted'); refresh(); } },
        }),
      });
      E.actions(el, { add: () => fileForm(ctrl.refresh) });
    },
  });

  // =============================================================================================
  // Complaints & Issues: a person can (1) answer complaints filed about them and (2) write their own
  // complaint or issue to the team leader, the head of department or the admin, and follow the replies.
  // =============================================================================================
  const ISSUE_KIND = { open: 'warn', in_review: 'info', resolved: 'ok', closed: '' };
  const issueStatus = (s) => html`<span class="badge ${ISSUE_KIND[s]}">${fmt.label(s)}</span>`;
  const priorityBadge = (p) => (p === 'urgent' ? html`<span class="badge bad">Urgent</span>` : html`<span class="badge">Normal</span>`);
  const ROLE_NAME = { leader: 'Team Leader', hod: 'Head of Department', admin: 'Admin' };
  const MAX_FILE = 1_000_000;
  const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(blob);
  });

  // Pictures are shrunk automatically (phone photos are big); PDFs must already be small.
  async function prepareFile(file) {
    if (file.type === 'application/pdf') {
      if (file.size > MAX_FILE) throw new Error(`${file.name} is bigger than 1 MB`);
      return { name: file.name, data: await toBase64(file) };
    }
    if (!file.type.startsWith('image/')) throw new Error(`${file.name}: only pictures and PDF files can be attached`);
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error(`${file.name} could not be read as a picture`); }
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_FILE) return { name: `${file.name.replace(/\.[^.]*$/, '')}.jpg`, data: await toBase64(blob) };
      scale *= 0.8;
    }
    throw new Error(`${file.name} is too large even after shrinking`);
  }

  async function submitForm(onSaved) {
    const [meta, rcpts] = await Promise.all([E.get('/api/issues/meta'), E.get('/api/issues/recipients')]);
    E.modal({
      title: 'Submit a complaint or issue', wide: true, submit: 'Send',
      body: html`<div class="form">
        ${E.field({ name: 'recipient', label: 'Send to', type: 'select', required: true, full: true,
          options: [{ value: '', label: 'Choose who should read it…' }, ...rcpts.map((r) => ({ value: r.role, label: `${ROLE_NAME[r.role]}${r.role === 'admin' ? '' : ` - ${r.name}`}` }))],
          help: 'Complaint about your senior? Send it straight to the Admin: only the Admin will see it.' })}
        ${E.field({ name: 'category', label: 'Category', type: 'select', required: true, options: [{ value: '', label: 'Select…' }, ...meta.categories] })}
        ${E.field({ name: 'priority', label: 'Priority', type: 'select', value: 'normal', options: [{ value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }] })}
        ${E.field({ name: 'subject', label: 'Subject', required: true, full: true, attrs: 'maxlength="150"', placeholder: 'A short title' })}
        ${E.field({ name: 'details', label: 'Complaint details', type: 'textarea', required: true, full: true, attrs: 'rows="5" maxlength="3000"', placeholder: 'What happened? Please give as much detail as you can.' })}
        ${E.field({ name: 'storeName', label: 'Store / account name (if it applies)', full: true })}
        <label class="full">Attachments (optional)<input type="file" name="files" multiple accept="image/*,application/pdf"><span class="help">Up to 3 pictures or PDF files. Pictures are made smaller automatically.</span></label></div>
        <p class="muted small">Your complaint is private. Only the person you send it to and the Admin can read it. You will be told when they reply or change its status.</p>`,
      onSubmit: async (v, { close, form }) => {
        const chosen = [...form.elements.files.files];
        if (chosen.length > 3) throw new Error('You can attach up to 3 files');
        const attachments = [];
        for (const f of chosen) attachments.push(await prepareFile(f));
        const { files, ...body } = v; void files;
        await E.post('/api/issues', { ...body, storeName: body.storeName || undefined, attachments });
        E.toast('Sent. You will be notified when it is answered.');
        close();
        onSaved();
      },
    });
  }

  // The conversation about one complaint (the writer and the person it went to).
  async function openIssue(id, onChange) {
    const i = await E.get(`/api/issues/${id}`);
    const meId = E.user.employeeId;
    const mine = (m) => (m.authorEmployeeId != null ? m.authorEmployeeId === meId : m.authorRole === E.user.role);
    const { close } = E.modal({
      title: i.subject, wide: true, cancel: 'Close', submit: i.canRespond ? 'Send reply' : 'Send follow-up',
      body: html`<div class="row" style="gap:6px">${issueStatus(i.status)}${priorityBadge(i.priority)}<span class="badge">${i.category}</span></div>
        <p class="muted small" style="margin:8px 0">${i.mine ? `Sent to ${i.sentTo}` : `From ${i.submitterName} (${E.roleLabel[i.submitterRole] || i.submitterRole}${i.teamName ? `, ${i.teamName}` : ''}${E.isAdmin() ? `, ${i.departmentName}` : ''}) · sent to ${i.sentTo}`} · ${fmt.dateTime(i.createdAt)}</p>
        ${i.storeName ? html`<p><b>Store / account:</b> ${i.storeName}</p>` : ''}
        <div class="card" style="white-space:pre-wrap;word-break:break-word">${i.details}</div>
        ${i.files.length ? html`<div class="attach">${i.files.map((f) => html`<a href="/api/issues/${i.id}/files/${f.id}" download>📎 ${f.name} (${size(f.size)})</a>`)}</div>` : ''}
        <div class="thread">${i.messages.map((m) => html`<div class="msg ${mine(m) ? 'mine' : ''}"><div class="who">${m.authorLabel} · ${fmt.dateTime(m.createdAt)}${m.statusSet ? html` · status: <b>${fmt.label(m.statusSet)}</b>` : ''}</div>${m.body ? html`<div class="body">${m.body}</div>` : ''}</div>`)}</div>
        <div class="form">${E.field({ name: 'body', label: i.canRespond ? 'Your reply' : 'Add a follow-up', type: 'textarea', full: true, attrs: 'rows="3" maxlength="2000"' })}
          ${i.canRespond ? E.field({ name: 'status', label: 'Status', type: 'select', value: i.status, full: true, options: [{ value: 'open', label: 'Open' }, { value: 'in_review', label: 'In review' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }], help: 'The writer is notified when you reply or change the status.' }) : ''}</div>
        ${!i.canRespond && (i.status === 'resolved' || i.status === 'closed') ? html`<p class="muted small">This complaint is ${i.status}. A follow-up reopens it.</p>` : ''}`,
      onSubmit: async (v, { close: c }) => {
        await E.post(`/api/issues/${id}/messages`, { body: v.body || undefined, status: v.status || undefined });
        E.toast('Sent');
        c();
        onChange();
        openIssue(id, onChange);
      },
    });
    void close;
  }

  // ---------------- everybody below the admin: complaints about me + my own complaints ----------------
  let myTab = 'sent';
  E.page({
    id: 'my-complaints', title: 'Complaints & Issues', icon: '⚠', roles: E.SELF, group: E.myGroup, order: 35,
    async render(el) {
      const [about, sent] = await Promise.all([E.get('/api/complaints/me'), E.get('/api/issues/me')]);
      const openAbout = about.filter((c) => c.status === 'open' || c.status === 'under_review').length;
      const waiting = sent.filter((x) => x.status === 'open' || x.status === 'in_review').length;
      const reload = () => E.pages.find((p) => p.id === 'my-complaints').render(el);
      const sentTable = E.table([
        { label: 'Sent', render: (x) => fmt.date(x.createdAt) },
        { label: 'Subject', class: 'wrap', render: (x) => html`<a href="#" data-act="open" data-id="${x.id}"><b>${x.subject}</b></a>${x.storeName ? html`<div class="muted small">${x.storeName}</div>` : ''}` },
        { label: 'Sent to', render: (x) => x.sentTo }, { label: 'Category', render: (x) => x.category }, { label: 'Priority', render: (x) => priorityBadge(x.priority) },
        { label: 'Status', render: (x) => issueStatus(x.status) },
        { label: 'Replies', class: 'num', render: (x) => x.messageCount || '-' },
        { label: '', class: 'right', render: (x) => html`<button class="btn sm" data-act="open" data-id="${x.id}">Open</button>` },
      ], sent, 'You have not sent any complaint yet. Use "Submit complaint" to write to your team leader, head of department or the admin.');
      const aboutList = about.length ? html`<div class="grid">${about.map((c) => html`<div class="card">
          <h3><span>${c.category} ${sevBadge(c.severity)}</span>${statusBadge(c.status)}</h3>
          <div>${c.description}</div>
          <div class="muted small" style="margin-top:6px">Filed by ${c.filedBy} on ${fmt.date(c.createdAt)}${c.incidentDate ? ` · happened on ${fmt.date(c.incidentDate)}` : ''}</div>
          ${c.resolutionNote ? html`<div style="margin-top:8px"><b>Action taken:</b> ${c.resolutionNote}</div>` : ''}
          ${c.memberResponse ? html`<div class="card" style="margin-top:10px;background:var(--panel2)"><div class="muted small">Your reply (${fmt.date(c.respondedAt)})</div>${c.memberResponse}</div>` : ''}
          <div style="margin-top:10px"><button class="btn sm ${c.memberResponse ? '' : 'primary'}" data-act="reply" data-id="${c.id}">${c.memberResponse ? 'Change my reply' : 'Reply'}</button></div></div>`)}</div>`
        : html`<div class="card empty">No complaints have been filed about you. Keep it up!</div>`;
      E.mount(el, html`${E.pageHead('Complaints & Issues', 'Raise a complaint or issue with your team leader, head of department or the admin, and follow the replies. Complaints filed about you are listed too.', html`<button class="btn primary" data-act="submit">+ Submit complaint</button>`)}
        <div class="tabs"><button type="button" class="${myTab === 'sent' ? 'on' : ''}" data-act="tab" data-id="sent">My submitted complaints (${sent.length}${waiting ? `, ${waiting} waiting` : ''})</button>
          <button type="button" class="${myTab === 'about' ? 'on' : ''}" data-act="tab" data-id="about">Complaints about me (${about.length}${openAbout ? `, ${openAbout} open` : ''})</button></div>
        ${myTab === 'sent' ? sentTable : aboutList}`);
      E.actions(el, {
        tab: (id) => { myTab = id; reload(); },
        submit: () => submitForm(() => { myTab = 'sent'; reload(); }),
        open: (id) => openIssue(id, reload),
        reply: (id) => {
          const c = about.find((x) => String(x.id) === id);
          E.modal({
            title: 'Reply to complaint', submit: 'Send reply',
            body: html`<p class="muted">${c.category}: ${c.description}</p><div class="form">${E.field({ name: 'response', label: 'Your reply', type: 'textarea', required: true, value: c.memberResponse })}</div>`,
            onSubmit: async (v, { close }) => { await E.post(`/api/complaints/${id}/respond`, v); E.toast('Reply sent'); close(); reload(); },
          });
        },
      });
    },
  });

  // ---------------- leader / head / admin: complaints and issues sent to me ----------------
  E.page({
    id: 'issues', title: 'Issues Received', icon: '✉', roles: E.MANAGE, group: 'People', order: 55,
    async render(el) {
      const meta = await E.get('/api/issues/meta');
      await E.listPage(el, {
        title: 'Issues received', subtitle: E.isAdmin() ? 'Complaints and issues written to you, and everything else sent in. Private to the writer, the person it was sent to and you.' : 'Complaints and issues that team members wrote to you. They are private: only you, the writer and the admin can read them.',
        filters: [
          { name: 'search', label: 'Search', placeholder: 'Person, subject or store' },
          { name: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'Any' }, { value: 'open', label: 'Open' }, { value: 'in_review', label: 'In review' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }] },
          { name: 'priority', label: 'Priority', type: 'select', options: [{ value: '', label: 'Any' }, { value: 'urgent', label: 'Urgent' }, { value: 'normal', label: 'Normal' }] },
          { name: 'category', label: 'Category', type: 'select', options: [{ value: '', label: 'Any' }, ...meta.categories] },
        ],
        load: async (f) => {
          const rows = await E.get(`/api/issues${E.qs(f)}`);
          const waiting = rows.filter((x) => x.status === 'open' || x.status === 'in_review');
          return html`<div class="stats">${E.stat('Shown', rows.length)}${E.stat('Waiting for an answer', waiting.length, { cls: waiting.length ? 'accent' : '' })}${E.stat('Urgent', waiting.filter((x) => x.priority === 'urgent').length, { cls: waiting.some((x) => x.priority === 'urgent') ? 'bad' : '' })}</div>
            ${E.table([
              { label: 'Priority', render: (x) => priorityBadge(x.priority) },
              { label: 'Subject', class: 'wrap', render: (x) => html`<a href="#" data-act="open" data-id="${x.id}"><b>${x.subject}</b></a><div class="muted small">${x.category}${x.storeName ? ` · ${x.storeName}` : ''}</div>` },
              { label: 'From', render: (x) => html`${x.submitterName}<div class="muted small">${E.roleLabel[x.submitterRole] || ''}${x.teamName ? ` · ${x.teamName}` : ''}${E.isAdmin() ? ` · ${x.departmentName}` : ''}</div>` },
              ...(E.isAdmin() ? [{ label: 'Sent to', render: (x) => x.sentTo }] : []),
              { label: 'Status', render: (x) => issueStatus(x.status) },
              { label: 'Last update', render: (x) => fmt.date(x.updatedAt) }, { label: 'Replies', class: 'num', render: (x) => x.messageCount || '-' },
              { label: '', class: 'right', render: (x) => html`<button class="btn sm ${x.status === 'open' ? 'primary' : ''}" data-act="open" data-id="${x.id}">${x.status === 'open' ? 'Answer' : 'Open'}</button>` },
            ], rows, 'Nothing here. When someone writes a complaint to you it appears here.')}`;
        },
        bind: (box, refresh) => E.actions(box, { open: (id) => openIssue(id, refresh) }),
      });
    },
  });
})();
