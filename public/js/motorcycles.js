(function () {
  if (!document.getElementById('listings')) return;
  let state = { page: 1, limit: 12 };

  const $ = (id) => document.getElementById(id);
  const qs = (s) => (document.querySelector(s));

  function getFilters() {
    return {
      search:   ($('q-search') && $('q-search').value.trim()) || '',
      city:     ($('q-city') && $('q-city').value.trim()) || '',
      price:    ($('q-price') && $('q-price').value.trim()) || '',
      brand:    ($('q-brand') && $('q-brand').value.trim()) || '',
      sort:     ($('sort-select') && $('sort-select').value) || 'newest'
    };
  }

  function buildQuery() {
    const p = new URLSearchParams();
    const f = getFilters();
    if (f.search) p.set('search', f.search);
    if (f.city) p.set('city', f.city);
    if (f.price) p.set('maxPrice', f.price);
    if (f.brand) p.set('brand', f.brand);
    if (f.sort && f.sort !== 'newest') p.set('sort', f.sort);
    p.set('page', state.page);
    p.set('limit', state.limit);
    return p.toString();
  }

  function syncURL() {
    const p = new URLSearchParams();
    const f = getFilters();
    if (f.search) p.set('search', f.search);
    if (f.city) p.set('city', f.city);
    if (f.price) p.set('price', f.price);
    if (f.brand) p.set('brand', f.brand);
    if (f.sort && f.sort !== 'newest') p.set('sort', f.sort);
    if (state.page > 1) p.set('page', state.page);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  }

  function renderChips() {
    const f = getFilters();
    const chips = [];
    if (f.search) chips.push({ key: 'search', label: '"' + f.search + '"' });
    if (f.city) chips.push({ key: 'city', label: 'المدينة: ' + f.city });
    if (f.price) chips.push({ key: 'price', label: 'السعر حتى: ' + f.price });
    if (f.brand) chips.push({ key: 'brand', label: 'النوع: ' + f.brand });
    const container = $('active-chips');
    if (!container) return;
    if (!chips.length) { container.innerHTML = ''; container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    container.innerHTML = chips.map(c =>
      '<button class="chip" data-key="' + c.key + '">' + c.label + ' <i class="fas fa-times"></i></button>'
    ).join('');
    container.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === 'search' && $('q-search')) $('q-search').value = '';
        if (key === 'city' && $('q-city')) $('q-city').value = '';
        if (key === 'price' && $('q-price')) $('q-price').value = '';
        if (key === 'brand' && $('q-brand')) $('q-brand').value = '';
        state.page = 1; load();
      });
    });
  }

  async function load() {
    var g = $('listings');
    if (!g) return;
    g.innerHTML = renderSkeleton();
    syncURL();
    renderChips();
    try {
      const res = await API.motorcycles(buildQuery());
      render(res);
    } catch (e) {
      g.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>تعذّر التحميل</h3><p>' + e.message + '</p></div>';
    }
  }

  function render(res) {
    var g = $('listings');
    if (!g) return;
    const { data, total, page, limit } = res;
    var rc = $('result-count');
    if (rc) rc.textContent = total > 0 ? Number(total).toLocaleString('ar-SA') + ' نتيجة' : 'لا توجد نتائج';

    if (!data.length) {
      const hasFilters = Object.values(getFilters()).some(v => v);
      g.innerHTML = '<div class="empty-state"><i class="fas fa-motorcycle"></i><h3>' + (hasFilters ? 'لا توجد دراجات تطابق بحثك' : 'لا توجد دراجات متاحة') + '</h3><p>' + (hasFilters ? 'حاول تغيير الفلاتر' : '') + '</p></div>';
      var p = $('pagination');
      if (p) p.innerHTML = '';
      return;
    }

    g.innerHTML = data.map(renderCard).join('');

    var pEl = $('pagination');
    if (!pEl) return;
    const pages = Math.ceil(total / limit);
    if (pages <= 1) { pEl.innerHTML = ''; return; }

    let html = '';
    var prev = state.page > 1 ? state.page - 1 : 1;
    var next = state.page < pages ? state.page + 1 : pages;
    html += '<button data-page="' + prev + '" ' + (state.page <= 1 ? 'disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || (i >= state.page - 2 && i <= state.page + 2)) {
        html += '<button data-page="' + i + '" class="' + (i === state.page ? 'active' : '') + '">' + i + '</button>';
      } else if (i === state.page - 3 || i === state.page + 3) {
        html += '<span style="color:var(--text-muted);padding:0 4px;">...</span>';
      }
    }
    html += '<button data-page="' + next + '" ' + (state.page >= pages ? 'disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
    pEl.innerHTML = html;
    pEl.querySelectorAll('button[data-page]:not(:disabled)').forEach(b => {
      b.addEventListener('click', () => { state.page = Number(b.dataset.page); load(); });
    });
  }

  function loadFilterOptions() {}

  function readURLParams() {
    const params = new URLSearchParams(location.search);
    if (params.get('search') && $('q-search')) $('q-search').value = params.get('search');
    if (params.get('city') && $('q-city')) $('q-city').value = params.get('city');
    if (params.get('price') && $('q-price')) $('q-price').value = params.get('price');
    if (params.get('brand') && $('q-brand')) $('q-brand').value = params.get('brand');
    if (params.get('sort') && $('sort-select')) $('sort-select').value = params.get('sort');
    if (params.get('page')) state.page = Number(params.get('page'));
  }

  function bind() {
    const debounceLoad = () => {
      clearTimeout(window._sd);
      window._sd = setTimeout(() => { state.page = 1; load(); }, 350);
    };
    
    ['q-search', 'q-city', 'q-price', 'q-brand'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', debounceLoad);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            clearTimeout(window._sd);
            state.page = 1;
            load();
          }
        });
      }
    });

    [$('sort-select')].forEach(el => {
      if (el) el.addEventListener('change', () => { state.page = 1; load(); });
    });
  }

  (async function init() {
    await loadSite();
    readURLParams();
    bind();
    loadFilterOptions();
    renderChips();
    // تحميل الإحصائيات
    try {
      const st = await API.stats();
      var sb = $('stats-bar');
      if (sb && st.data) {
        sb.innerHTML = '<span class="stat-pill"><i class="fas fa-motorcycle"></i> ' + (st.data.available || 0) + ' متاحة</span>';
      }
    } catch(e) {}
    await load();
  })();
})();
