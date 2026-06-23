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
        <img src="${img}" alt="${m.title}" loading="lazy">
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
  return Array.from({ length: 6 }, () => `
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>`).join('');
}

function toggleFav(id, btn) {
  const now = Utils.toggleFavorite(id);
  btn.classList.toggle('fav-active', now);
  btn.querySelector('i').className = now ? 'fas fa-heart' : 'far fa-heart';
  Utils.toast(now ? 'تمت الإضافة إلى المفضّلة' : 'تمت الإزالة من المفضّلة', 'success');
}
