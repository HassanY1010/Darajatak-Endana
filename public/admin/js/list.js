(function () {
  let state = { page: 1, limit: 10 };
  let timer;

  function statusSelect(m) {
    const opt = (v, l) => `<option value="${v}" ${m.status === v ? 'selected' : ''}>${l}</option>`;
    return `<select data-id="${m.id}" class="status-select rounded-lg px-2 py-1.5 text-xs outline-none min-h-[36px]">
      ${opt('available','🟢 متاحة')}${opt('reserved','🟡 محجوزة')}${opt('sold','🔴 تم البيع')}
    </select>`;
  }

  function expiryCell(expiresAt) {
    if (!expiresAt) return '<span style="color:var(--text-secondary)">—</span>';
    const d = new Date(expiresAt);
    const isExpired = d < new Date();
    const days = Math.ceil((d - new Date()) / 86400000);
    if (isExpired) return `<span class="px-2 py-0.5 rounded-lg text-xs font-bold" style="background:rgba(239,68,68,0.12);color:#ef4444">منتهي</span>`;
    if (days <= 5) return `<span class="px-2 py-0.5 rounded-lg text-xs font-bold" style="background:rgba(234,179,8,0.12);color:#eab308">${days} أيام</span>`;
    return `<span class="text-xs" style="color:var(--text-secondary)">${days} يوم</span>`;
  }

  function viewsCell(views) {
    const n = views || 0;
    let color = 'text-gray-400';
    if (n >= 100) color = 'text-gold';
    else if (n >= 30) color = 'text-blue-400';
    return `<span class="${color} font-bold flex items-center justify-center gap-1.5" title="${n.toLocaleString('ar-SA')} مشاهدة">
      <i class="fas fa-eye text-xs"></i> ${n}
    </span>`;
  }

  async function load() {
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="p-10 text-center"><div class="spinner mx-auto"></div></td></tr>';
    const p = new URLSearchParams();
    const s = document.getElementById('search').value.trim();
    if (s) p.set('search', s);
    if (document.getElementById('status-filter').value) p.set('status', document.getElementById('status-filter').value);
    const sort = document.getElementById('sort-filter').value;
    if (sort && sort !== 'newest') p.set('sort', sort);
    p.set('page', state.page); p.set('limit', state.limit);

    try {
      const res = await API.motorcycles(p.toString());
      render(res);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-red-400">${e.message}</td></tr>`;
    }
  }

  function render({ data, total, page, limit }) {
    const tbody = document.getElementById('tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-10 text-center text-gray-500">لا توجد دراجات.</td></tr>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }
    tbody.innerHTML = data.map(m => `
      <tr class="admin-table-row border-t">
        <td data-label=""><img src="${Utils.img(m.main_image)}" class="w-14 h-14 rounded-xl object-cover" alt=""></td>
        <td data-label="الاسم"><div class="font-bold">${m.title}</div><div class="text-xs text-gray-400">${m.brand} ${m.city ? ' | ' + m.city : ''}</div></td>
        <td data-label="السعر" class="font-bold whitespace-nowrap text-gold">${Utils.formatPrice(m.price, m.currency)}</td>
        <td data-label="الحالة">${statusSelect(m)}</td>
        <td data-label="المشاهدات" class="text-center">${viewsCell(m.views)}</td>
        <td data-label="الصلاحية" class="text-center">${expiryCell(m.expiresAt || m.expires_at)}</td>
        <td data-label="التاريخ" class="text-gray-400 whitespace-nowrap" dir="ltr">${(m.created_at || '').split(' ')[0]}</td>
        <td data-label="إجراءات" class="text-center">
          <div class="flex items-center justify-center gap-2">
            <a href="/admin/edit.html?id=${m.id}" title="تعديل" class="admin-action-btn admin-action-btn--edit touch-btn w-9 h-9 grid place-items-center rounded-xl"><i class="fas fa-pen"></i></a>
            <a href="/motorcycle.html?id=${m.id}" target="_blank" title="عرض" class="admin-action-btn admin-action-btn--view touch-btn w-9 h-9 grid place-items-center rounded-xl"><i class="fas fa-eye"></i></a>
            <button data-renew="${m.id}" title="تجديد 30 يوم" class="touch-btn w-9 h-9 grid place-items-center rounded-xl" style="background:rgba(34,197,94,0.12);color:#22c55e"><i class="fas fa-rotate-right"></i></button>
            <button data-del="${m.id}" title="حذف" class="touch-btn w-9 h-9 grid place-items-center rounded-xl" style="background:rgba(239,68,68,0.12);color:#ef4444"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await API.patch(`/motorcycles/${sel.dataset.id}/status`, { status: sel.value });
          Utils.toast('تم تحديث الحالة', 'success');
        } catch (e) { Utils.toast(e.message, 'error'); }
      });
    });

    tbody.querySelectorAll('button[data-renew]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await API.renew(btn.dataset.renew);
          Utils.toast('تم تجديد الإعلان لـ 30 يوماً', 'success');
          load();
        } catch (e) { Utils.toast(e.message, 'error'); }
      });
    });

    tbody.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذه الدراجة؟ لا يمكن التراجع.')) return;
        try {
          await API.del(`/motorcycles/${btn.dataset.del}`);
          Utils.toast('تم الحذف', 'success');
          load();
        } catch (e) { Utils.toast(e.message, 'error'); }
      });
    });

    const pages = Math.ceil(total / limit);
    const pag = document.getElementById('pagination');
    if (pages <= 1) { pag.innerHTML = ''; return; }
    let html = '<div class="flex items-center gap-1.5 flex-wrap justify-center">';
    const range = 2;
    const dots = '<span class="px-2 text-gray-500">...</span>';
    const btn = (label, p, disabled, active) =>
      `<button data-p="${p}" ${disabled ? 'disabled' : ''}
        class="admin-pag-btn touch-btn px-3 py-2 rounded-lg text-sm border transition
          ${active ? 'gold-gradient text-white border-transparent font-bold' : ''}
          ${disabled ? 'opacity-30 cursor-not-allowed' : ''}">${label}</button>`;
    html += btn('<i class="fas fa-chevron-right"></i>', page - 1, page <= 1, false);
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || (i >= page - range && i <= page + range)) {
        html += btn(i, i, false, i === page);
      } else if (i === page - range - 1 || i === page + range + 1) {
        html += dots;
      }
    }
    html += btn('<i class="fas fa-chevron-left"></i>', page + 1, page >= pages, false);
    html += '</div>';
    pag.innerHTML = html;
    pag.querySelectorAll('button[data-p]:not(:disabled)').forEach(b =>
      b.addEventListener('click', () => { state.page = Number(b.dataset.p); load(); }));
  }

  (async function init() {
    if (!await Admin.guard()) return;
    await Admin.initLayout('motorcycles');
    document.getElementById('search').addEventListener('input', () => {
      clearTimeout(timer); timer = setTimeout(() => { state.page = 1; load(); }, 350);
    });
    document.getElementById('status-filter').addEventListener('change', () => { state.page = 1; load(); });
    document.getElementById('sort-filter').addEventListener('change', () => { state.page = 1; load(); });
    load();
  })();
})();
