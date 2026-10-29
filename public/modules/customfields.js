(() => {
  const E = window.Etricks;
  const { html } = E;

  const ENTITIES = [{ value: 'employee', label: 'Employees' }, { value: 'task', label: 'Tasks' }, { value: 'finance', label: 'Finance entries' }];
  const TYPES = [{ value: 'text', label: 'Short text' }, { value: 'textarea', label: 'Long text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Dropdown' }, { value: 'checkbox', label: 'Yes / No' }];

  function fieldForm(entity, f, onSaved) {
    const e = f || { type: 'text', sort: 100 };
    E.modal({
      title: f ? `Edit field - ${f.label}` : 'Add field',
      body: html`<div class="form">${E.field({ name: 'label', label: 'Field name', value: e.label, required: true, full: true })}
        ${E.field({ name: 'type', label: 'Type', type: 'select', value: e.type, options: TYPES })}${E.field({ name: 'sort', label: 'Order', type: 'number', value: e.sort })}
        ${E.field({ name: 'options', label: 'Dropdown choices (one per line)', type: 'textarea', value: (e.options || []).join('\n'), help: 'Only used for dropdown fields' })}
        ${E.field({ name: 'required', label: 'Required', type: 'checkbox', value: e.required })}</div>`,
      onSubmit: async (v, { close }) => {
        if (f) await E.put(`/api/custom-fields/${f.id}`, v); else await E.post('/api/custom-fields', { ...v, entity });
        E.toast('Field saved'); close(); onSaved();
      },
    });
  }

  E.page({
    id: 'custom-fields', title: 'Custom Fields', icon: '✚', roles: ['admin'], group: 'Administration', order: 30,
    async render(el) {
      let entity = 'employee';
      const load = async () => {
        const rows = await E.get(`/api/custom-fields?entity=${entity}`);
        E.mount(el, html`${E.pageHead('Custom fields', 'Add your own fields to forms and reports without any programming.', html`<button class="btn primary" data-act="add">+ Add field</button>`)}
          <div class="tabs">${ENTITIES.map((x) => html`<button class="${x.value === entity ? 'active' : ''}" data-act="tab" data-id="${x.value}">${x.label}</button>`)}</div>
          ${E.table([{ label: 'Field', key: 'label' }, { label: 'Type', render: (f) => TYPES.find((t) => t.value === f.type)?.label }, { label: 'Choices', render: (f) => f.options.join(', ') || '-' },
            { label: 'Required', render: (f) => (f.required ? 'Yes' : 'No') },
            { label: '', class: 'right', render: (f) => html`<div class="actions"><button class="btn sm" data-act="edit" data-id="${f.id}">Edit</button><button class="btn sm danger" data-act="del" data-id="${f.id}">Remove</button></div>` }],
          rows, 'No custom fields yet for this section.')}`);
        E.actions(el, {
          tab: (id) => { entity = id; load(); },
          add: () => fieldForm(entity, null, load),
          edit: (id) => fieldForm(entity, rows.find((f) => String(f.id) === id), load),
          del: async (id) => { if (await E.confirm('Remove this field? Existing saved values are kept but no longer shown.', { yes: 'Remove', danger: true })) { await E.del(`/api/custom-fields/${id}`); load(); } },
        });
      };
      await load();
    },
  });
})();
