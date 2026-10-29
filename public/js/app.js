/* Landing page, portal sign-in, application shell and router. */
(() => {
  'use strict';
  const E = window.Etricks;
  const { html } = E;
  const app = document.getElementById('app');
  const loadedScripts = new Set();
  let routeHandler = null;

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (loadedScripts.has(src)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { loadedScripts.add(src); resolve(); };
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });

  // ---------------- landing ----------------
  async function showLanding() {
    document.title = `${E.settings.companyName || 'eTricks'} Hub`;
    const depts = await E.get('/api/public/departments');
    E.mount(app, html`<div class="landing">
      <header><span></span><button class="btn" data-portal="admin">Admin portal</button></header>
      <main>
        <div class="hero">${E.logo(true)}
          <h1>Welcome to the ${E.settings.companyName || 'eTricks'} Hub</h1>
          <p>Choose your department and portal to continue. Team leaders manage attendance, requests, tasks and finance. Team members mark their own attendance and work.</p>
        </div>
        <div class="dept-grid">${depts.map((d) => html`<div class="dept-card" style="--c:${d.color}">
          <h3><span class="dot"></span>${d.name}</h3>
          <div class="btns">
            <button class="btn primary" data-portal="leader" data-dept="${d.id}"><span>Team Leader Portal</span><span>→</span></button>
            <button class="btn" data-portal="member" data-dept="${d.id}"><span>Team Member Portal</span><span>→</span></button>
          </div></div>`)}</div>
      </main>
      <footer>${E.settings.companyName || 'eTricks'} internal system. Authorised staff only. All activity is logged.</footer></div>`);
    E.actions(app, {});
    app.onclick = (e) => {
      const btn = e.target.closest('[data-portal]');
      if (!btn) return;
      openLogin(btn.dataset.portal, depts.find((d) => String(d.id) === btn.dataset.dept));
    };
  }

  function openLogin(portal, dept) {
    const titles = { admin: 'Admin portal', leader: `Team Leader Portal - ${dept?.name}`, member: `Team Member Portal - ${dept?.name}` };
    const finish = async (close) => { close(); await boot(); };

    if (portal !== 'member') {
      E.modal({
        title: titles[portal], submit: 'Sign in',
        body: html`<div class="form">${E.field({ name: 'password', label: 'Password', type: 'password', required: true, full: true, attrs: 'autocomplete="current-password"' })}</div>`,
        onSubmit: async (v, { close }) => {
          await E.post('/api/auth/login', { portal, departmentId: dept?.id, password: v.password });
          await finish(close);
        },
      });
      return;
    }

    // Member: step 1 department password -> step 2 pick name + personal PIN (same modal, two steps)
    let password = '';
    let step = 1;
    E.modal({
      title: titles.member, submit: 'Continue',
      body: html`<div class="form">${E.field({ name: 'password', label: 'Department password', type: 'password', required: true, full: true, help: 'Ask your team leader if you do not have it.' })}</div>`,
      onSubmit: async (v, { form, close }) => {
        if (step === 1) {
          const names = await E.post('/api/auth/members', { departmentId: dept.id, password: v.password });
          password = v.password;
          step = 2;
          E.mount(E.$('.mbody', form), html`<div class="form">${E.field({ name: 'employeeId', label: 'Your name', type: 'select', required: true, full: true,
            options: [{ value: '', label: 'Select your name…' }, ...names.map((n) => ({ value: n.id, label: `${n.name} (${n.empCode})` }))] })}
            ${E.field({ name: 'pin', label: 'Your personal PIN', type: 'password', required: true, full: true, attrs: 'inputmode="numeric" autocomplete="off"', help: 'The 6-digit PIN your team leader gave you.' })}</div>`);
          E.$('.btn.primary', form).textContent = 'Sign in';
          E.$('select', form).focus();
          return;
        }
        await E.post('/api/auth/login', { portal: 'member', departmentId: dept.id, password, employeeId: Number(v.employeeId), pin: v.pin });
        await finish(close);
      },
    });
  }

  // ---------------- shell ----------------
  const GROUP_ORDER = ['', 'People', 'Operations', 'Insights', 'Administration'];

  // ---------------- notifications (bell) ----------------
  let notifTimer = null;
  let notifLastId = null;
  let notifItems = [];
  const stopNotifications = () => { clearInterval(notifTimer); notifTimer = null; notifLastId = null; notifItems = []; };

  const ago = (iso) => {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return E.fmt.date(new Date(iso).toLocaleDateString('en-CA'));
  };

  function paintBell(unread) {
    for (const el of E.$$('.bell-count')) { el.textContent = unread > 99 ? '99+' : unread; el.hidden = !unread; }
    document.title = document.title.replace(/^\(\d+\+?\) /, '');
    if (unread) document.title = `(${unread}) ${document.title}`;
  }

  async function pollNotifications() {
    try {
      const d = await E.get('/api/notifications?limit=30');
      const fresh = notifLastId === null ? [] : d.items.filter((n) => n.id > notifLastId && !n.readAt);
      for (const n of fresh.slice(0, 3).reverse()) E.toast(`🔔 ${n.title}`);
      if (fresh.length) {
        if (!document.hidden) beep();
        // Without server push (e.g. plain http), still show a system pop-up while the tab is open in the background.
        if (document.hidden && !push.active && 'Notification' in window && Notification.permission === 'granted') {
          for (const n of fresh.slice(0, 3)) {
            try { const p = new Notification(n.title, { body: n.body || '', icon: '/img/icon-192.png', tag: `etricks-${n.id}` }); p.onclick = () => { window.focus(); goLink(n.link); p.close(); }; } catch { /* not supported here */ }
          }
        }
      }
      notifLastId = Math.max(notifLastId ?? 0, d.items[0]?.id ?? 0);
      notifItems = d.items;
      paintBell(d.unread);
    } catch { /* offline or signed out: try again next time */ }
  }


  // ---------------- push: system pop-ups on this phone / computer ----------------
  const push = { active: false };
  const goLink = (link) => { if (!link) return; if (location.hash === link) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = link; };
  const pushSupported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const keyToBytes = (b64) => { const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  const bytesToKey = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

  async function swRegistration() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
    await navigator.serviceWorker.register('/sw.js');
    return navigator.serviceWorker.ready;
  }

  // Makes sure this browser is subscribed and that the server knows who it belongs to.
  async function syncPush() {
    push.active = false;
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    try {
      const reg = await swRegistration();
      const { key } = await E.get('/api/push/key');
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options.applicationServerKey && bytesToKey(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
      await E.post('/api/push/subscribe', { subscription: sub.toJSON() });
      push.active = true;
    } catch (e) { console.warn('[push]', e.message); }
    return push.active;
  }

  // On sign-out the device stops receiving this person's notifications (important on shared computers).
  async function dropPushFromServer() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await E.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    } catch { /* nothing to remove */ }
    push.active = false;
  }

  async function enablePush() {
    if (!pushSupported()) throw new Error('This browser or address cannot show pop-up notifications');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.');
    if (!(await syncPush())) throw new Error('Could not turn on notifications on this device');
  }

  async function disablePush() {
    await dropPushFromServer();
    const reg = await navigator.serviceWorker?.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  }

  function pushState() {
    if (!window.isSecureContext) return 'insecure';
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    return push.active ? 'on' : 'off';
  }

  function beep() {
    try {
      const ctx = (beep.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
    } catch { /* sound is optional */ }
  }

  function pushStatusHtml() {
    const s = pushState();
    const text = {
      on: 'Pop-up notifications are ON for this device, even when eTricks is closed.',
      off: 'Turn on pop-ups to get notified on this device, like a messaging app, even when eTricks is closed.',
      blocked: 'Notifications are blocked for this site. Allow them in your browser settings (lock icon next to the address), then come back here.',
      insecure: 'Pop-ups on a phone need a secure (https) address. Ask your admin to set up HTTPS. On this computer you can use http://localhost:3000.',
      unsupported: 'This browser cannot show pop-ups. On iPhone: tap Share, then "Add to Home Screen", and open eTricks from the new icon.',
    }[s];
    return html`<div class="pushbox ${s}"><span>${text}</span>
      <div class="row">${s === 'off' ? html`<button type="button" class="btn sm primary" data-act="push-on">Turn on</button>` : ''}
      ${s === 'on' ? html`<button type="button" class="btn sm" data-act="push-test">Send test</button><button type="button" class="btn sm" data-act="push-off">Turn off</button>` : ''}</div></div>`;
  }

  function renderPushBanner() {
    const el = E.$('#pushBanner');
    if (!el) return;
    const show = pushState() === 'off' && Notification.permission === 'default' && !lsGet('etx-push-dismissed');
    if (!show) { el.innerHTML = ''; return; }
    E.mount(el, html`<div class="push-banner"><span>🔔 Get pop-up alerts on this device, even when eTricks is closed.</span>
      <span class="row"><button class="btn sm primary" id="pushOn">Turn on</button><button class="btn sm" id="pushLater">Not now</button></span></div>`);
    E.$('#pushOn').onclick = async () => { try { await enablePush(); E.toast('Notifications are on'); } catch (ex) { E.toast(ex.message, 'bad'); } renderPushBanner(); };
    E.$('#pushLater').onclick = () => { lsSet('etx-push-dismissed', '1'); renderPushBanner(); };
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'push' && notifTimer) pollNotifications();
      if (e.data?.type === 'open') goLink(e.data.link);
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && notifTimer) pollNotifications(); });

  function openNotifications() {
    const body = () => html`${pushStatusHtml()}${list()}`;
    const list = () => (notifItems.length
      ? html`<div class="notifs">${notifItems.map((n, i) => html`<button type="button" class="notif ${n.readAt ? '' : 'unread'}" data-act="open" data-id="${i}">
          <b>${n.title}</b>${n.body ? html`<span>${n.body}</span>` : ''}<small>${ago(n.createdAt)}</small></button>`)}</div>`
      : html`<div class="empty">No notifications yet.</div>`);
    const { form, close } = E.modal({ title: 'Notifications', cancel: 'Close', body: body() });
    const markAll = document.createElement('button');
    markAll.type = 'button'; markAll.className = 'btn'; markAll.textContent = 'Mark all as read';
    markAll.onclick = async () => { await E.post('/api/notifications/read', { all: true }); await pollNotifications(); E.mount(E.$('.mbody', form), body()); };
    E.$('.foot', form).prepend(markAll);
    const redraw = () => { E.mount(E.$('.mbody', form), body()); renderPushBanner(); };
    E.actions(form, {
      'push-on': async () => { try { await enablePush(); E.toast('Notifications are on'); } catch (ex) { E.toast(ex.message, 'bad'); } redraw(); },
      'push-off': async () => { await disablePush(); E.toast('Notifications are off for this device'); redraw(); },
      'push-test': async () => { await E.post('/api/push/test'); E.toast('Test sent. It should pop up in a moment.'); setTimeout(pollNotifications, 1500); },
      open: async (i) => {
        const n = notifItems[Number(i)];
        if (!n.readAt) { await E.post('/api/notifications/read', { ids: [n.id] }); pollNotifications(); }
        close();
        goLink(n.link);
      },
    });
  }

  function visiblePages() {
    return E.pages
      .filter((p) => p.roles.includes(E.user.role) && (!p.module || E.enabled.has(p.module)))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order);
  }

  function showShell() {
    const pages = visiblePages();
    const roleName = { admin: 'Admin', leader: 'Team Leader', member: 'Team Member' }[E.user.role];
    let lastGroup = null;
    const nav = pages.map((p) => {
      const head = p.group && p.group !== lastGroup ? html`<div class="grp">${p.group}</div>` : '';
      lastGroup = p.group;
      return html`${head}<a href="#/${p.id}" data-page="${p.id}"><span class="ico">${p.icon}</span>${p.title}</a>`;
    });
    E.mount(app, html`<div class="shell">
      <aside class="side" id="side">
        ${E.logo()}
        <div class="who"><span class="muted">${roleName}</span><b>${E.user.label}</b></div>
        <button class="btn bell" id="bell" type="button">🔔 Notifications <span class="bell-count" hidden></span></button>
        <nav class="nav">${nav}</nav>
        <div class="spacer"></div>
        <button class="btn" id="logout">Sign out</button>
      </aside>
      <div>
        <div class="topbar"><button class="btn sm" id="burger" aria-label="Menu">☰</button>${E.logo()}<span class="grow"></span><button class="btn sm bell" id="bell2" type="button" aria-label="Notifications">🔔<span class="bell-count" hidden></span></button></div>
        <div id="pushBanner"></div>
        <main class="main" id="view"></main>
      </div></div>`);
    E.$('#logout').onclick = async () => { await dropPushFromServer(); await E.post('/api/auth/logout').catch(() => {}); E.user = null; location.hash = ''; boot(); };
    E.$('#burger').onclick = () => E.$('#side').classList.toggle('open');
    E.$('#bell').onclick = openNotifications;
    E.$('#bell2').onclick = openNotifications;
    stopNotifications();
    pollNotifications();
    swRegistration().then(syncPush).catch(() => {}).finally(renderPushBanner);
    notifTimer = setInterval(pollNotifications, 20000);
    E.$('#side').onclick = (e) => { if (e.target.closest('a')) E.$('#side').classList.remove('open'); };

    const go = async () => {
      const id = location.hash.replace(/^#\//, '').split('?')[0] || pages[0]?.id;
      const page = pages.find((p) => p.id === id) || pages[0];
      if (!page) { E.mount(E.$('#view'), html`<div class="empty">No pages are available for your role.</div>`); return; }
      E.$$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page.id));
      document.title = `${page.title} - ${E.settings.companyName || 'eTricks'}`;
      const view = E.$('#view');
      view._acts = {}; // drop click handlers from the previous page
      E.mount(view, html`<div class="muted">Loading…</div>`);
      try { await page.render(view); } catch (ex) { E.mount(view, html`<div class="error">${ex.message}</div>`); }
    };
    if (routeHandler) window.removeEventListener('hashchange', routeHandler);
    routeHandler = go;
    window.addEventListener('hashchange', go);
    go();
  }

  // ---------------- boot ----------------
  async function boot() {
    try {
      const pub = await E.get('/api/public/settings');
      E.settings.companyName = pub.companyName;
      const { user } = await E.get('/api/auth/me');
      E.user = user;
      if (!user) { stopNotifications(); app.onclick = null; await showLanding(); return; }

      const [mods, settings] = await Promise.all([E.get('/api/modules'), E.get('/api/settings')]);
      Object.assign(E.settings, settings);
      E.enabled = new Set(mods.filter((m) => m.enabled).map((m) => m.id));
      E.modules = mods;
      for (const m of mods.filter((x) => x.enabled && x.ui)) {
        E.currentModule = m.id;
        await loadScript(m.ui);
      }
      E.currentModule = null;
      app.onclick = null;
      showShell();
    } catch (ex) {
      E.mount(app, html`<div class="boot"><div class="error">${ex.message}</div></div>`);
    }
  }
  E.boot = boot;
  boot();
})();
