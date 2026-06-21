// إضافة/تعديل دراجة + إدارة الصور (رفع/رابط/حذف/تعيين رئيسية)
(function () {
  const params = new URLSearchParams(location.search);
  let id = params.get('id');
  let current = null;

  const g = (x) => document.getElementById(x);

  function fill(m) {
    g('f-title').value = m.title || '';
    g('f-brand').value = m.brand || '';
    g('f-price').value = m.price || '';
    g('f-currency').value = m.currency || 'SAR';
    g('f-status').value = m.status || 'available';
    g('f-description').value = m.description || '';
  }

  function collect() {
    return {
      title: g('f-title').value, brand: g('f-brand').value,
      price: g('f-price').value, currency: g('f-currency').value, status: g('f-status').value,
      description: g('f-description').value
    };
  }

  function renderImages() {
    const grid = g('images-grid');
    const hint = g('images-hint');
    if (!id) { hint.classList.remove('hidden'); grid.innerHTML = ''; return; }
    hint.classList.add('hidden');
    const imgs = (current && current.images) || [];
    if (!imgs.length) { grid.innerHTML = '<p class="col-span-full text-gray-500 text-sm">لا توجد صور بعد.</p>'; return; }
    grid.innerHTML = imgs.map(im => {
      const isMain = current.main_image === im.image_url;
      return `
      <div class="relative group rounded-xl overflow-hidden border-2 ${isMain ? 'border-gold' : 'admin-img-border'}">
        <img src="${im.image_url}" class="w-full aspect-square object-cover" alt="">
        ${isMain ? '<span class="absolute top-1 right-1 text-[10px] admin-img-main-badge px-1.5 py-0.5 rounded font-bold">رئيسية</span>' : ''}
        <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
          ${!isMain ? `<button type="button" data-main="${im.image_url}" title="تعيين رئيسية" class="w-8 h-8 grid place-items-center rounded-lg bg-gold text-black"><i class="fas fa-star"></i></button>` : ''}
          <button type="button" data-delimg="${im.id}" title="حذف" class="w-8 h-8 grid place-items-center rounded-lg bg-red-500 text-white"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('button[data-main]').forEach(b =>
      b.addEventListener('click', async () => {
        await API.patch(`/motorcycles/${id}/main-image`, { image_url: b.dataset.main });
        await reload(); Utils.toast('تم تعيين الصورة الرئيسية', 'success');
      }));
    grid.querySelectorAll('button[data-delimg]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('حذف هذه الصورة؟')) return;
        await API.del(`/motorcycles/${id}/images/${b.dataset.delimg}`);
        await reload(); Utils.toast('تم حذف الصورة', 'success');
      }));
  }

  async function reload() {
    const { data } = await API.motorcycle(id);
    current = data;
    renderImages();
  }

  async function uploadFiles(files) {
    if (!files.length || !id) return;
    const fd = new FormData();
    [...files].forEach(f => fd.append('images', f));
    await API.post(`/motorcycles/${id}/images`, fd, true);
    await reload();
    Utils.toast('تم رفع الصور', 'success');
  }

  function bind() {
    g('moto-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('save-btn');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
      try {
        const body = collect();
        if (id) {
          await API.put(`/motorcycles/${id}`, body);
          // ارفع أي ملفات مختارة
          if (g('f-files').files.length) await uploadFiles(g('f-files').files);
          await reload();
          Utils.toast('تم حفظ التعديلات', 'success');
        } else {
          // إنشاء عبر FormData (لدعم رفع الصور مع الإنشاء)
          const fd = new FormData();
          Object.entries(body).forEach(([k, v]) => fd.append(k, v));
          [...g('f-files').files].forEach(f => fd.append('images', f));
          await API.post('/motorcycles', fd, true);
          Utils.toast('تمت إضافة الدراجة', 'success');
          setTimeout(() => { location.href = '/admin/motorcycles.html'; }, 600);
        }
      } catch (ex) {
        Utils.toast((ex.errors && ex.errors[0]) || ex.message, 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk ml-1"></i> حفظ';
      }
    });

    // رفع فوري عند اختيار ملفات (في وضع التعديل)
    g('f-files').addEventListener('change', async () => {
      if (id && g('f-files').files.length) {
        await uploadFiles(g('f-files').files);
        g('f-files').value = '';
      }
    });

    // زر الإلغاء — رجوع إلى قائمة الدراجات
    g('cancel-btn').addEventListener('click', () => {
      const hasData = Array.from(g('moto-form').querySelectorAll('input:not([type=file]), textarea, select'))
        .some(el => el.type === 'checkbox' ? el.checked : el.value.trim() !== '');
      if (hasData && !confirm('سيتم فقدان التغييرات غير المحفوظة. هل تريد الاستمرار؟')) return;
      location.href = '/admin/motorcycles.html';
    });

    // إضافة صورة عبر رابط
    g('add-url-btn').addEventListener('click', async () => {
      const url = g('f-url').value.trim();
      if (!url) return;
      if (!id) { Utils.toast('احفظ الدراجة أولاً', 'error'); return; }
      try {
        await API.post(`/motorcycles/${id}/images/url`, { image_url: url });
        g('f-url').value = '';
        await reload();
        Utils.toast('تمت إضافة الصورة', 'success');
      } catch (e) { Utils.toast(e.message, 'error'); }
    });
  }

  (async function init() {
    if (!await Admin.guard()) return;
    await Admin.initLayout(id ? 'motorcycles' : 'add');
    bind();
    if (id) {
      g('page-title').innerHTML = 'تعديل <span class="gold-text-gradient">الدراجة</span>';
      try {
        const { data } = await API.motorcycle(id);
        current = data; fill(data); renderImages();
        g('views-badge').classList.remove('hidden');
        g('views-count').textContent = (data.views || 0).toLocaleString('ar-SA');
      } catch (e) { Utils.toast('تعذّر تحميل الدراجة', 'error'); }
    } else {
      renderImages();
    }
  })();
})();
