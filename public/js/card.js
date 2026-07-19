// ===== بطاقة دراجة — تصميم جديد =====
function renderCard(m) {
  const img = Utils.img(m.main_image);
  const phone = m.admin_phone || (window.SITE ? window.SITE.whatsapp_number : '');
  const waLink = Utils.whatsappLink(phone, m);
  const isFav = Utils.isFavorite(m.id);
  const isSold = m.status === 'sold';

  return `
    <div class="moto-card" data-id="${m.id}">
      <a href="/motorcycle.html?id=${m.id}" class="moto-card-img">
        ${Utils.imgTag(m.main_image, m.title, 'moto-card-img-el')}
        <span class="moto-card-status">
          ${isSold
            ? '<span class="badge-sold">تم البيع</span>'
            : '<span class="badge-available">متاح</span>'
          }
        </span>
        <button class="moto-card-fav ${isFav ? 'fav-active' : ''}" onclick="event.preventDefault(); event.stopPropagation(); toggleFav(${m.id}, this)" title="المفضّلة">
          <i class="fa${isFav ? 's' : 'r'} fa-heart"></i>
        </button>
      </a>
      <div class="moto-card-body">
        <div class="moto-card-title" title="${m.title}">${m.title}</div>
        <div class="moto-card-price">${Utils.formatPrice(m.price, m.currency)}</div>
        ${m.city ? `<div class="moto-card-city"><i class="fas fa-location-dot"></i> ${m.city}</div>` : ''}
        <a href="${waLink}" target="_blank" class="btn-whatsapp moto-card-wa ${isSold ? 'opacity-50 pointer-events-none' : 'whatsapp-pulse'}" onclick="event.stopPropagation()">
          <i class="fab fa-whatsapp"></i> تواصل
        </a>
      </div>
    </div>`;
}

function renderSkeleton() {
  const logo = (window.SITE && window.SITE.logo_url) 
    ? Utils.img(window.SITE.logo_url) 
    : 'https://tbogujraszjmiykxinfd.supabase.co/storage/v1/object/public/motorcycles/logo-1782041024871-73cb3a6f.jpg';
  
  return `
    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; gap: 16px; width: 100%;">
      <div style="position: relative; width: 80px; height: 80px; margin: 0 auto;">
        <img src="${logo}" alt="جاري التحميل" style="width: 100%; height: 100%; border-radius: 50%; border: 3px solid var(--primary); object-fit: cover; animation: pulse-logo 1.5s infinite ease-in-out;">
        <div style="position: absolute; top: -6px; left: -6px; width: 92px; height: 92px; border: 3px solid transparent; border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      </div>
      <span style="color: var(--text-muted); font-weight: 600; font-size: 0.95rem;">جاري تحميل الدراجات...</span>
    </div>`;
}

function toggleFav(id, btn) {
  const now = Utils.toggleFavorite(id);
  btn.classList.toggle('fav-active', now);
  btn.querySelector('i').className = now ? 'fas fa-heart' : 'far fa-heart';
  Utils.toast(now ? 'تمت الإضافة إلى المفضّلة' : 'تمت الإزالة من المفضّلة', 'success');
}
