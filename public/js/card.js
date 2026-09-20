// ===== بطاقة دراجة — تصميم جديد ومحسن للأداء =====
function renderCard(m) {
  const phone = m.admin_phone || (window.SITE ? window.SITE.whatsapp_number : '');
  const waLink = Utils.whatsappLink(phone, m);
  const isFav = Utils.isFavorite(m.id);
  const isSold = m.status === 'sold';

  return `
    <div class="moto-card" data-id="${Utils.escapeHtml(m.id)}">
      <a href="/motorcycle.html?id=${encodeURIComponent(m.id)}" class="moto-card-img">
        ${Utils.imgTag(m.main_image, m.title, 'moto-card-img-el', '', true)}
        <span class="moto-card-status">
          ${isSold
            ? '<span class="badge-sold">تم البيع</span>'
            : '<span class="badge-available">متاح</span>'
          }
        </span>
        <button class="moto-card-fav ${isFav ? 'fav-active' : ''}" onclick="event.preventDefault(); event.stopPropagation(); toggleFav(${encodeURIComponent(m.id)}, this)" title="المفضّلة">
          <i class="fa${isFav ? 's' : 'r'} fa-heart"></i>
        </button>
      </a>
      <div class="moto-card-body">
        <div class="moto-card-title" title="${Utils.escapeHtml(m.title)}">${Utils.escapeHtml(m.title)}</div>
        <div class="moto-card-price">${Utils.formatPrice(m.price, m.currency)}</div>
        ${m.city ? `<div class="moto-card-city"><i class="fas fa-location-dot"></i> ${Utils.escapeHtml(m.city)}</div>` : ''}
        <a href="${Utils.escapeHtml(waLink)}" target="_blank" class="btn-whatsapp moto-card-wa ${isSold ? 'opacity-50 pointer-events-none' : 'whatsapp-pulse'}" onclick="event.stopPropagation()">
          <i class="fab fa-whatsapp"></i> تواصل
        </a>
      </div>
    </div>`;
}

function renderSkeleton() {
  return Array.from({ length: 8 }, () => `
    <div class="skeleton-card">
      <div class="skeleton-img" style="display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); aspect-ratio: 4/3; position: relative; overflow: hidden;">
        <i class="fas fa-motorcycle" style="font-size: 2.2rem; color: var(--primary); opacity: 0.15; animation: pulse-logo 1.5s infinite ease-in-out;"></i>
      </div>
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div class="skeleton-line" style="width: 80%; height: 16px; margin: 0;"></div>
        <div class="skeleton-line" style="width: 40%; height: 20px; margin: 0;"></div>
        <div class="skeleton-line" style="width: 50%; height: 14px; margin: 0;"></div>
        <div class="skeleton-line" style="width: 100%; height: 38px; border-radius: 12px; margin: 4px 0 0 0;"></div>
      </div>
    </div>`).join('');
}

function toggleFav(id, btn) {
  const now = Utils.toggleFavorite(id);
  btn.classList.toggle('fav-active', now);
  btn.querySelector('i').className = now ? 'fas fa-heart' : 'far fa-heart';
  Utils.toast(now ? 'تمت الإضافة إلى المفضّلة' : 'تمت الإزالة من المفضّلة', 'success');
}
