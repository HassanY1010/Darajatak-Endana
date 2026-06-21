// أدوات لوحة التحكم المشتركة: حارس المصادقة + الشريط الجانبي

// === Theme toggle ===
(function initAdminTheme() {
  var saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
})();

function updateThemeLabel() {
  var label = document.getElementById('theme-label');
  if (label) {
    label.textContent = document.documentElement.classList.contains('dark')
      ? 'الوضع الفاتح'
      : 'الوضع الداكن';
  }
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  updateThemeLabel();
  window.dispatchEvent(new CustomEvent('admin-theme-change'));
}

function adminChartColors() {
  var dark = document.documentElement.classList.contains('dark');
  return {
    legend: dark ? '#e5e5e5' : '#3c4043',
    border: dark ? '#141417' : '#ffffff'
  };
}

function initTheme() {}

const Admin = {
  me: null,
  site: {},

  async guard() {
    try {
      const res = await API.get('/auth/me');
      this.me = res.admin;
      return true;
    } catch (e) {
      location.href = '/admin/login.html';
      return false;
    }
  },

  async loadSettings() {
    try {
      const res = await API.settings();
      this.site = res.data || {};
    } catch { this.site = {}; }
  },

  async logout() {
    try { await API.post('/auth/logout'); } catch (e) {}
    location.href = '/admin/login.html';
  },

  renderSidebar(active) {
    const mount = document.getElementById('admin-sidebar');
    if (!mount) return;
    const item = (href, icon, label, key) => `
      <a href="${href}" class="admin-nav-link flex items-center gap-3 px-4 py-3 rounded-xl transition
         ${active === key ? 'gold-gradient text-white font-bold' : ''}">
        <i class="fas ${icon} w-5 text-center"></i> <span>${label}</span>
      </a>`;
    mount.innerHTML = `
      <div class="flex items-center gap-2 px-2 py-4 mb-2 border-b border-white/10">
        ${this.site.logo_url ? '<img src="' + this.site.logo_url + '" alt="دراجتك عندنا" style="height:36px;max-width:120px;object-fit:contain;margin-left:6px"><span class="font-extrabold gold-text-gradient">لوحة التحكم</span>' : '<span class="text-2xl">🏍️</span><span class="font-extrabold gold-text-gradient">لوحة التحكم</span>'}
      </div>
      <nav class="space-y-1">
        ${item('/admin/', 'fa-gauge-high', 'الرئيسية', 'dashboard')}
        ${item('/admin/motorcycles.html', 'fa-motorcycle', 'الدراجات', 'motorcycles')}
        ${item('/admin/edit.html', 'fa-circle-plus', 'إضافة دراجة', 'add')}
        ${item('/admin/settings.html', 'fa-gear', 'الإعدادات', 'settings')}
      </nav>
      <div class="mt-auto pt-4 border-t border-white/10 space-y-1">
        <a href="/" target="_blank" class="admin-nav-link flex items-center gap-3 px-4 py-3 rounded-xl">
          <i class="fas fa-globe w-5 text-center"></i> <span>عرض الموقع</span>
        </a>
        <button type="button" onclick="toggleTheme()" class="admin-nav-link w-full flex items-center gap-3 px-4 py-3 rounded-xl">
          <i class="fas fa-circle-half-stroke w-5 text-center"></i> <span id="theme-label">الوضع الفاتح</span>
        </button>
        <button onclick="Admin.logout()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10">
          <i class="fas fa-right-from-bracket w-5 text-center"></i> <span>تسجيل الخروج</span>
        </button>
      </div>`;
  },

  closeSidebar() {
    const aside = document.getElementById('sidebar-aside');
    const overlay = document.getElementById('admin-overlay');
    if (aside) aside.classList.add('sidebar-closed');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  },

  openSidebar() {
    const aside = document.getElementById('sidebar-aside');
    const overlay = document.getElementById('admin-overlay');
    if (aside) aside.classList.remove('sidebar-closed');
    if (overlay) overlay.classList.add('open');
    document.body.classList.add('sidebar-open');
  },

  // غلاف الصفحة: شريط جانبي ثابت + زر قائمة للجوال
  async initLayout(active) {
    await this.loadSettings();
    this.renderSidebar(active);
    updateThemeLabel();
    const topbar = document.getElementById('admin-topbar');
    const aside = document.getElementById('sidebar-aside');
    if (aside) aside.classList.add('sidebar-closed');

    let overlay = document.getElementById('admin-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'admin-overlay';
      overlay.className = 'admin-overlay';
      overlay.addEventListener('click', () => this.closeSidebar());
      document.body.appendChild(overlay);
    }

    if (topbar) {
      topbar.innerHTML = `
        <button id="sb-toggle" type="button" class="lg:hidden touch-btn admin-menu-btn" aria-label="فتح القائمة">
          <i class="fas fa-bars"></i>
        </button>
        <span class="admin-topbar-greet text-gray-400 text-sm truncate">مرحباً، <span class="text-gold font-bold">${this.me ? (this.me.name || this.me.email) : ''}</span></span>`;
      const toggle = document.getElementById('sb-toggle');
      if (toggle && aside) {
        toggle.addEventListener('click', () => {
          if (aside.classList.contains('sidebar-closed')) this.openSidebar();
          else this.closeSidebar();
        });
      }
    }

    aside?.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 1023px)').matches) this.closeSidebar();
      });
    });

    window.addEventListener('resize', () => {
      if (window.matchMedia('(min-width: 1024px)').matches) this.closeSidebar();
    });
  }
};
window.Admin = Admin;
