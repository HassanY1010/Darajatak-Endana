// ===== Header + Footer + Theme + Favorites page =====
let SITE = {};

// Theme
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') document.documentElement.classList.add('dark');
}
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = document.documentElement.classList.contains('dark') ? 'الوضع الفاتح' : 'الوضع الداكن';
}
initTheme();

async function loadSite() {
  try {
    const cached = sessionStorage.getItem('site_settings');
    if (cached) {
      SITE = JSON.parse(cached);
    } else {
      const res = await API.settings();
      SITE = res.data || {};
      sessionStorage.setItem('site_settings', JSON.stringify(SITE));
    }
  } catch {
    SITE = { site_name: 'دراجتك علينا', whatsapp_number: '967000000000' };
  }
  renderHeader();
  renderFooter();
  updateTitle();
  return SITE;
}

function siteName() { return SITE.site_name || 'دراجتك عندنا'; }
function siteNameHTML() {
  const n = siteName();
  const i = n.lastIndexOf(' ');
  if (i === -1) return n;
  return n.slice(0, i) + ' <span style="color:var(--primary)">' + n.slice(i + 1) + '</span>';
}

function updateTitle() {
  const t = document.querySelector('title');
  if (!t) return;
  const parts = t.textContent.split('|');
  if (parts.length > 1) {
    t.textContent = parts.slice(0, -1).join('|').trim() + ' | ' + siteName();
  } else {
    t.textContent = siteName();
  }
}

function renderHeader() {
  const mount = document.getElementById('site-header');
  if (!mount) return;
  const name = siteName();
  mount.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <div class="header-row">
          <a href="/" class="header-logo">
            ${SITE.logo_url ? '<img src="' + Utils.img(SITE.logo_url) + '" alt="' + name + '" class="header-logo-img" onerror="this.style.display=\'none\'"><span class="header-logo-text">' + siteNameHTML() + '</span>' : '<span class="header-logo-text">' + siteNameHTML() + '</span>'}
          </a>
          <div class="header-actions">
            <button id="theme-toggle" onclick="toggleTheme()" class="touch-btn header-icon-btn" title="الوضع الفاتح/الداكن" aria-label="تبديل الوضع">
              <i class="fas fa-circle-half-stroke"></i>
            </button>
            <a href="/favorites.html" class="touch-btn header-icon-btn" title="المفضّلة" aria-label="المفضّلة">
              <i class="fas fa-heart"></i>
            </a>
          </div>
        </div>
      </div>
    </header>`;
}

function renderFooter() {
  const mount = document.getElementById('site-footer');
  if (!mount) return;
  mount.innerHTML = `
    <footer class="site-footer">
      © ${new Date().getFullYear()} ${siteName()} — منصة الدراجات النارية في حضرموت
    </footer>`;
}
