// طبقة الاتصال بالـ API (مشتركة بين كل الصفحات)
const API = {
  base: '/api',

  async request(method, path, body, isForm = false) {
    const opts = {
      method,
      credentials: 'include',
      headers: {}
    };
    if (body) {
      if (isForm) {
        opts.body = body; // FormData
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(this.base + path, opts);
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const msg = (data && data.message) || 'حدث خطأ';
      const err = new Error(msg);
      err.status = res.status;
      err.errors = data && data.errors;
      throw err;
    }
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body, isForm) { return this.request('POST', path, body, isForm); },
  put(path, body, isForm) { return this.request('PUT', path, body, isForm); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); },

  // ===== اختصارات =====
  motorcycles(query = '') { return this.get('/motorcycles' + (query ? `?${query}` : '')); },
  motorcycle(id) { return this.get('/motorcycles/' + id); },
  featured() { return this.get('/motorcycles/featured'); },
  stats() { return this.get('/motorcycles/stats'); },
  filters() { return this.get('/motorcycles/filters'); },
  settings() { return this.get('/settings'); },
  renew(id) { return this.post('/motorcycles/' + id + '/renew'); }
};

// ===== أدوات مساعدة عامة =====
const Utils = {
  formatPrice(n, currency) {
    const num = Number(n || 0);
    const label = currency === 'YER' ? 'ريال يمني' : 'ريال سعودي';
    return num.toLocaleString('ar-SA') + ' ' + label;
  },
  statusLabel(s) {
    return ({ available: 'متاحة', reserved: 'محجوزة', sold: 'تم البيع' })[s] || s;
  },
  statusBadgeClass(s) {
    return ({ available: 'badge-available', reserved: 'badge-reserved', sold: 'badge-sold' })[s] || '';
  },
  statusDot(s) {
    return ({ available: '🟢', reserved: '🟡', sold: '🔴' })[s] || '';
  },
  img(url) {
    if (!url) return 'https://via.placeholder.com/600x400/141417/d4af37?text=%F0%9F%8F%8D%EF%B8%8F';
    // إرجاع الرابط المباشر من Supabase CDN (أسرع)
    // البروكسي يُستخدم فقط كـ fallback تلقائي عبر onerror في HTML
    return url;
  },

  // بناء رابط proxy للاستخدام في onerror
  imgProxy(url) {
    if (!url || !url.includes('supabase.co')) return url;
    return '/api/img/proxy?url=' + encodeURIComponent(url);
  },

  // بناء وسم img كامل مع fallback تلقائي للبروكسي
  imgTag(url, alt, cssClass, extraAttrs) {
    const direct = this.img(url);
    const proxy = this.imgProxy(url);
    const fallback = proxy !== direct
      ? `onerror="this.onerror=null;this.src='${proxy}'"`
      : `onerror="this.onerror=null;"`;
    return `<img src="${direct}" alt="${alt || ''}" ${cssClass ? `class="${cssClass}"` : ''} ${extraAttrs || ''} loading="lazy" ${fallback}>`;
  },

  // بناء رابط واتساب مع رسالة ديناميكية
  whatsappLink(phone, moto) {
    const clean = String(phone || '').replace(/[^0-9]/g, '');
    const msg =
      `مرحباً، أنا مهتم بهذه الدراجة من منصة "دراجتك عندنا":\n\n` +
      `🔖 رقم الإعلان: ${moto.ad_number || moto.id}\n` +
      `🏍️ الدراجة: ${moto.title}\n` +
      `💰 السعر: ${this.formatPrice(moto.price, moto.currency)}\n` +
      `📍 المدينة: ${moto.city || 'غير محدد'}\n\n` +
      `هل ما زالت متاحة؟`;
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  },
  // ===== المفضّلة (Favorites) =====
  getFavorites() {
    try { return JSON.parse(localStorage.getItem('favs') || '[]'); } catch { return []; }
  },
  setFavorites(ids) {
    localStorage.setItem('favs', JSON.stringify(ids));
  },
  toggleFavorite(id) {
    const favs = this.getFavorites();
    const idx = favs.indexOf(id);
    if (idx > -1) { favs.splice(idx, 1); this.setFavorites(favs); return false; }
    else { favs.push(id); this.setFavorites(favs); return true; }
  },
  isFavorite(id) {
    return this.getFavorites().includes(id);
  },
  // مراقبة الظهور التدريجي
  initReveal() {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
  },
  toast(message, type = 'info') {
    const colors = { info: '#d4af37', success: '#22c55e', error: '#ef4444' };
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:${colors[type]};color:#0b0b0d;padding:12px 22px;border-radius:12px;
      font-weight:700;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .3s;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
  }
};

window.API = API;
window.Utils = Utils;
