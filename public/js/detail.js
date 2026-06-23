// ===== صفحة تفاصيل الدراجة — تصميم نظيف =====
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
    const images = (m.images && m.images.length) ? m.images.map(i => i.image_url) : [Utils.img(m.main_image)];
    let mainImg = m.main_image && images.includes(m.main_image) ? m.main_image : images[0];
    const phone = m.admin_phone || (window.SITE ? window.SITE.whatsapp_number : '');
    const waLink = Utils.whatsappLink(phone, m);

    document.title = m.title + ' | دراجتك عندنا';
    setMeta('description', m.title + ' — ' + m.brand + ' بسعر ' + Utils.formatPrice(m.price, m.currency));
    setMeta('og:title', m.title + ' | دراجتك عندنا');
    setMeta('og:description', m.brand);
    setMeta('og:image', m.main_image || '/images/og-default.jpg');
    setMeta('og:url', location.href);

    document.getElementById('detail').innerHTML = `
      <div class="breadcrumb">
        <a href="/">الرئيسية</a> <i class="fas fa-chevron-left" style="font-size:.6rem;"></i>
        <a href="/motorcycles.html">الدراجات</a> <i class="fas fa-chevron-left" style="font-size:.6rem;"></i>
        <span style="color:var(--primary)">${m.title}</span>
      </div>

      <div class="detail-body">
      <div class="detail-images">
        <img id="main-image" src="${Utils.img(mainImg)}" alt="${m.title}" class="detail-main-img" loading="lazy">
        ${images.length > 1 ? `
        <div class="detail-thumbs">
          ${images.map((url, i) => '<img src="' + url + '" class="' + (url === mainImg ? 'active' : '') + '" data-url="' + url + '" alt="صورة ' + (i+1) + '" loading="lazy">').join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="prev-img" class="btn-primary" style="height:40px;padding:0 16px;font-size:.85rem;flex:1;border-radius:10px;"><i class="fas fa-chevron-right"></i> السابق</button>
          <button id="next-img" class="btn-primary" style="height:40px;padding:0 16px;font-size:.85rem;flex:1;border-radius:10px;">التالي <i class="fas fa-chevron-left"></i></button>
        </div>` : ''}
      </div>

      <div class="detail-info">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          ${m.status === 'sold' ? '<span class="badge-sold">تم البيع</span>' : '<span class="badge-available">متاح</span>'}
          ${m.ad_number ? `<span class="badge-ad-number">رقم العرض: ${m.ad_number}</span>` : ''}
          <span class="text-muted" style="font-size:.8rem;"><i class="fas fa-eye"></i> ${(m.views||0).toLocaleString('ar-SA')}</span>
        </div>

        <h1 class="detail-title">${m.title}</h1>
        <div class="detail-price">${Utils.formatPrice(m.price, m.currency)}</div>

        <div class="detail-specs">
          ${m.brand ? '<div class="detail-spec"><div class="detail-spec-label">الشركة</div><div class="detail-spec-value">' + m.brand + '</div></div>' : ''}
          ${m.city ? '<div class="detail-spec"><div class="detail-spec-label">المدينة</div><div class="detail-spec-value">' + m.city + '</div></div>' : ''}
        </div>

        ${m.description ? '<div class="detail-desc">' + m.description + '</div>' : ''}

        <div class="detail-actions">
          <a href="${waLink}" target="_blank" class="btn-whatsapp whatsapp-pulse ${m.status === 'sold' ? 'opacity-50 pointer-events-none' : ''}">
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
        if (mainEl) mainEl.src = images[idx];
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
    try {
      const { data } = await API.motorcycle(id);
      render(data);
    } catch (e) {
      document.getElementById('detail').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>الدراجة غير موجودة</h3></div>';
    }
  })();
})();
