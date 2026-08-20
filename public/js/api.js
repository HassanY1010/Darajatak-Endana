// طبقة الاتصال بالـ API مع نظام الكاش الذكي من جانب العميل (Client-Side Caching)
const API = {
  base: '/api',
  _cache: new Map(),

  // مدد صلاحية الكاش حسب نوع البيانات (بالمللي ثانية)
  _ttls: {
    '/settings': 10 * 60 * 1000,          // 10 دقائق
    '/motorcycles/filters': 10 * 60 * 1000,// 10 دقائق
    '/motorcycles/stats': 2 * 60 * 1000,    // دقيقتان
    '/motorcycles/featured': 5 * 60 * 1000, // 5 دقائق
    '/motorcycles': 60 * 1000,              // دقيقة واحدة لقوائم البحث
    '/motorcycles/': 2 * 60 * 1000          // دقيقتان لتفاصيل الدراجة
  },

  _getTTL(path) {
    if (this._ttls[path]) return this._ttls[path];
    if (path.startsWith('/motorcycles?')) return this._ttls['/motorcycles'];
    if (path.startsWith('/motorcycles/')) return this._ttls['/motorcycles/'];
    return 0; // بدون كاش افتراضياً للعمليات الأخرى
  },

  clearCache() {
    this._cache.clear();
  },

  async request(method, path, body, isForm = false) {
    const isGet = method === 'GET';
    const ttl = isGet ? this._getTTL(path) : 0;
    const now = Date.now();

    // 1. التحقق من الكاش المحلي للطلبات القابلة للتخزين
    if (isGet && ttl > 0 && this._cache.has(path)) {
      const entry = this._cache.get(path);
      if (now - entry.time < ttl) {
        return JSON.parse(JSON.stringify(entry.data)); // إرجاع نسخة آمنة من الكاش
      } else {
        this._cache.delete(path);
      }
    }

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

    // 2. تخزين النتيجة في الكاش
    if (isGet && ttl > 0 && data) {
      this._cache.set(path, { time: now, data });
    }

    // 3. إبطال الكاش عند إجراء أي تعديل (POST / PUT / DELETE)
    if (!isGet) {
      this.clearCache();
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

  // تحويل رابط الصورة إلى مسار الكاش الداخلي للسيرفر مع دعم الصور المصغرة
  img(url, isThumb = false) {
    if (!url) return '/real_car.png';

    // إذا كان رابط صورة من Supabase Storage نقوم بتحويله لكاش السيرفر الداخلي
    if (typeof url === 'string' && url.includes('.supabase.co/storage/v1/object/public/motorcycles/')) {
      const filename = url.split('/motorcycles/').pop().split('?')[0];
      return `/api/images/${filename}${isThumb ? '?w=400' : ''}`;
    }

    return url;
  },

  // رابط الصورة المباشر أو المحول
  imgProxy(url, isThumb = false) {
    return this.img(url, isThumb);
  },

  // بناء وسم img مع كاش و lazy loading و async decoding
  imgTag(url, alt, cssClass, extraAttrs, isThumb = false) {
    const src = this.img(url, isThumb);
    return `<img src="${src}" alt="${alt || ''}" ${cssClass ? `class="${cssClass}"` : ''} ${extraAttrs || ''} loading="lazy" decoding="async">`;
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
