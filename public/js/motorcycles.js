(function () {
  if (!document.getElementById('listings')) return;
  let state = { page: 1, limit: 12 };

  const $ = (id) => document.getElementById(id);
  const qs = (s) => (document.querySelector(s));

  function getFilters() {
    return {
      search:   ($('q-search') && $('q-search').value.trim()) || '',
      city:     ($('f-city') && $('f-city').value) || '',
      brand:    ($('f-brand') && $('f-brand').value) || '',
      status:   ($('f-status') && $('f-status').value) || '',
      sort:     ($('sort-select') && $('sort-select').value) || 'newest',
      minPrice: ($('f-min-price') && $('f-min-price').value) || '',
      maxPrice: ($('f-max-price') && $('f-max-price').value) || ''
    };
  }

  function buildQuery() {
    const p = new URLSearchParams();
    const f = getFilters();
    if (f.search) p.set('search', f.search);
    if (f.city) p.set('city', f.city);
    if (f.brand) p.set('brand', f.brand);
    if (f.status) p.set('status', f.status);
    if (f.sort && f.sort !== 'newest') p.set('sort', f.sort);
    if (f.minPrice) p.set('minPrice', f.minPrice);
    if (f.maxPrice) p.set('maxPrice', f.maxPrice);
    p.set('page', state.page);
    p.set('limit', state.limit);
    return p.toString();
  }

  function syncURL() {
    const p = new URLSearchParams();
    const f = getFilters();
    if (f.search) p.set('search', f.search);
    if (f.city) p.set('city', f.city);
    if (f.brand) p.set('brand', f.brand);
    if (f.status) p.set('status', f.status);
    if (f.sort && f.sort !== 'newest') p.set('sort', f.sort);
    if (f.minPrice) p.set('minPrice', f.minPrice);
    if (f.maxPrice) p.set('maxPrice', f.maxPrice);
    if (state.page > 1) p.set('page', state.page);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  }

  function renderChips() {
    const f = getFilters();
    const chips = [];
    if (f.search) chips.push({ key: 'search', label: '"' + f.search + '"' });
    if (f.city) chips.push({ key: 'city', label: f.city });
    if (f.brand) chips.push({ key: 'brand', label: f.brand });
    if (f.status) chips.push({ key: 'status', label: ({ available: 'متاح', sold: 'تم البيع' })[f.status] || f.status });
    if (f.minPrice) chips.push({ key: 'minPrice', label: '≥ ' + Number(f.minPrice).toLocaleString('ar-SA') + ' ريال سعودي' });
    if (f.maxPrice) chips.push({ key: 'maxPrice', label: '≤ ' + Number(f.maxPrice).toLocaleString('ar-SA') + ' ريال سعودي' });
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
        else if (key === 'city' && $('f-city')) $('f-city').value = '';
        else if (key === 'brand' && $('f-brand')) $('f-brand').value = '';
        else if (key === 'status' && $('f-status')) $('f-status').value = '';
        else if (key === 'minPrice' && $('f-min-price')) $('f-min-price').value = '';
        else if (key === 'maxPrice' && $('f-max-price')) $('f-max-price').value = '';
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
    if (params.get('city') && $('f-city')) $('f-city').value = params.get('city');
    if (params.get('brand') && $('f-brand')) $('f-brand').value = params.get('brand');
    if (params.get('status') && $('f-status')) $('f-status').value = params.get('status');
    if (params.get('sort') && $('sort-select')) $('sort-select').value = params.get('sort');
    if (params.get('minPrice') && $('f-min-price')) $('f-min-price').value = params.get('minPrice');
    if (params.get('maxPrice') && $('f-max-price')) $('f-max-price').value = params.get('maxPrice');
    if (params.get('page')) state.page = Number(params.get('page'));
  }

  function bind() {
    var searchEl = $('q-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        clearTimeout(window._sd);
        window._sd = setTimeout(() => { state.page = 1; load(); }, 350);
      });
      searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(window._sd); state.page = 1; load(); } });
    }
    [$('f-city'), $('f-brand'), $('f-status'), $('sort-select')].forEach(el => {
      if (el) el.addEventListener('change', () => { state.page = 1; load(); });
    });
    var goBtn = $('filter-go-btn');
    if (goBtn) goBtn.addEventListener('click', () => { state.page = 1; load(); });
    [$('f-min-price'), $('f-max-price')].forEach(el => {
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.page = 1; load(); } });
    });
    var ft = $('filter-toggle-btn');
    var fd = $('filter-desktop');
    if (ft && fd) ft.addEventListener('click', () => fd.classList.toggle('open'));
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
        sb.innerHTML = '<span class="stat-pill"><i class="fas fa-motorcycle"></i> ' + (st.data.available || 0) + ' متاحة</span>' +
          '<span class="stat-pill"><i class="fas fa-eye"></i> ' + (st.data.totalViews || 0) + ' مشاهدة</span>';
      }
    } catch(e) {}
    await load();
  })();
})();
