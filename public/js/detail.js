// ===== صفحة تفاصيل الدراجة — تصميم نظيف ومحسن للأداء =====
(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  function setMeta(name, content) {
    if (!content) return;
    const sel = name.startsWith('og:') || name.startsWith('twitter:') ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    let el = document.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(name.startsWith('og:') || name.startsWith('twitter:') ? 'property' : 'name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function render(m) {
    const images = (m.images && m.images.length) ? m.images.map(i => i.image_url) : [m.main_image];
    let mainImg = m.main_image && images.includes(m.main_image) ? m.main_image : images[0];
    const phone = m.admin_phone || (window.SITE ? window.SITE.whatsapp_number : '');
    const waLink = Utils.whatsappLink(phone, m);

    document.title = m.title + ' | دراجتك عندنا';
    setMeta('description', m.title + ' — ' + (m.brand || '') + ' بسعر ' + Utils.formatPrice(m.price, m.currency));
    setMeta('og:title', m.title + ' | دراجتك عندنا');
    setMeta('og:description', m.brand || '');
    setMeta('og:image', Utils.img(m.main_image, false));
    setMeta('og:url', location.href);

    const safeTitle = Utils.escapeHtml(m.title);
    const safeBrand = Utils.escapeHtml(m.brand);
    const safeCity = Utils.escapeHtml(m.city);
    const safeAdNumber = Utils.escapeHtml(m.ad_number);
    const safeDesc = m.description ? Utils.escapeHtml(m.description).replace(/\n/g, '<br>') : '';

    document.getElementById('detail').innerHTML = `
      <div class="breadcrumb">
        <a href="/">الرئيسية</a> <i class="fas fa-chevron-left" style="font-size:.6rem;"></i>
        <a href="/motorcycles.html">الدراجات</a> <i class="fas fa-chevron-left" style="font-size:.6rem;"></i>
        <span style="color:var(--primary)">${safeTitle}</span>
      </div>

      <div class="detail-body">
      <div class="detail-images">
        ${Utils.imgTag(mainImg, m.title, 'detail-main-img', 'id="main-image"', false)}
        ${images.length > 1 ? `
        <div class="detail-thumbs">
          ${images.map((url, i) => Utils.imgTag(url, 'صورة ' + (i+1), (url === mainImg ? 'active' : ''), 'data-url="' + Utils.escapeHtml(url) + '"', true)).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="prev-img" class="btn-primary" style="height:40px;padding:0 16px;font-size:.85rem;flex:1;border-radius:10px;"><i class="fas fa-chevron-right"></i> السابق</button>
          <button id="next-img" class="btn-primary" style="height:40px;padding:0 16px;font-size:.85rem;flex:1;border-radius:10px;">التالي <i class="fas fa-chevron-left"></i></button>
        </div>` : ''}
      </div>

      <div class="detail-info">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          ${m.status === 'sold' ? '<span class="badge-sold">تم البيع</span>' : '<span class="badge-available">متاح</span>'}
          ${safeAdNumber ? `<span class="badge-ad-number">رقم العرض: ${safeAdNumber}</span>` : ''}
          <span class="text-muted" style="font-size:.8rem;"><i class="fas fa-eye"></i> ${(m.views||0).toLocaleString('ar-SA')}</span>
        </div>

        <h1 class="detail-title">${safeTitle}</h1>
        <div class="detail-price">${Utils.formatPrice(m.price, m.currency)}</div>

        <div class="detail-specs">
          ${safeBrand ? '<div class="detail-spec"><div class="detail-spec-label">الشركة</div><div class="detail-spec-value">' + safeBrand + '</div></div>' : ''}
          ${safeCity ? '<div class="detail-spec"><div class="detail-spec-label">المدينة</div><div class="detail-spec-value">' + safeCity + '</div></div>' : ''}
        </div>

        ${safeDesc ? '<div class="detail-desc">' + safeDesc + '</div>' : ''}

        <div class="detail-actions">
          <a href="${Utils.escapeHtml(waLink)}" target="_blank" class="btn-whatsapp whatsapp-pulse ${m.status === 'sold' ? 'opacity-50 pointer-events-none' : ''}">
            <i class="fab fa-whatsapp"></i> تواصل مع المشرف
          </a>
          <button class="detail-share" onclick="navigator.clipboard.writeText(location.href).then(()=>Utils.toast('تم نسخ الرابط','success')).catch(()=>Utils.toast('فشل نسخ الرابط','error'))">
            <i class="fas fa-link"></i> نسخ رابط الإعلان
          </button>
        </div>
      </div>
      </div>`;

    // Slider
    if (images.length > 1) {
      let idx = images.indexOf(mainImg);
      const mainEl = document.getElementById('main-image');
      function setIdx(i) {
        idx = (i + images.length) % images.length;
        if (mainEl) mainEl.src = Utils.img(images[idx], false);
        document.querySelectorAll('.detail-thumbs img').forEach(t => t.classList.toggle('active', t.dataset.url === images[idx]));
      }
      var prevBtn = document.getElementById('prev-img');
      var nextBtn = document.getElementById('next-img');
      if (prevBtn) prevBtn.addEventListener('click', () => setIdx(idx - 1));
      if (nextBtn) nextBtn.addEventListener('click', () => setIdx(idx + 1));
      document.querySelectorAll('.detail-thumbs img').forEach(t => t.addEventListener('click', () => setIdx(images.indexOf(t.dataset.url))));
    }
  }

  (async function init() {
    await loadSite();
    if (!id) {
      document.getElementById('detail').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>معرّف الدراجة مفقود</h3></div>';
      return;
    }
      
    document.getElementById('detail').innerHTML = `
      <div class="breadcrumb" style="opacity: 0.5; margin-bottom: 24px;">
        <div class="skeleton-line" style="width: 150px; height: 14px; margin: 0;"></div>
      </div>
      <div class="detail-body">
        <div class="detail-images">
          <div class="skeleton-card" style="aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); border-radius: 16px; border: 1px solid var(--border-light); width: 100%;">
            <i class="fas fa-motorcycle" style="font-size: 3rem; color: var(--primary); opacity: 0.15; animation: pulse-logo 1.5s infinite ease-in-out;"></i>
          </div>
        </div>
        <div class="detail-info" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="skeleton-line" style="width: 120px; height: 24px; margin: 0;"></div>
          <div class="skeleton-line" style="width: 80%; height: 32px; margin: 0;"></div>
          <div class="skeleton-line" style="width: 150px; height: 28px; margin: 0;"></div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
            <div class="skeleton-line" style="width: 100%; height: 16px; margin: 0;"></div>
            <div class="skeleton-line" style="width: 90%; height: 16px; margin: 0;"></div>
          </div>
          <div class="skeleton-line" style="width: 100%; height: 48px; border-radius: 12px; margin: 24px 0 0 0;"></div>
        </div>
      </div>`;

    try {
      const { data } = await API.motorcycle(id);
      render(data);
    } catch (e) {
      document.getElementById('detail').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>الدراجة غير موجودة</h3></div>';
    }
  })();
})();
