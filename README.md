# 🏍️ دراجتك علينا — منصة عرض وبيع الدراجات النارية

منصة إلكترونية متكاملة (Full-Stack) لعرض وبيع الدراجات النارية في المملكة العربية السعودية،
مع لوحة تحكم إدارية كاملة. التواصل يتم عبر **WhatsApp** فقط، بدون أنظمة دفع أو تسجيل مستخدمين عاديين.

> **التقنيات:** Node.js + Express.js + SQLite (better-sqlite3) | الواجهة: HTML5 + TailwindCSS (CDN) + Vanilla JS
> **التخزين:** قاعدة بيانات SQLite محلية + رفع الصور محلياً في `public/uploads`

---

## 📦 المتطلبات

- Node.js نسخة **18 أو أحدث**
- npm

> ملاحظة: مكتبة `better-sqlite3` تُبنى تلقائياً عند التثبيت. تحتاج أدوات بناء (build tools) متوفرة في معظم أنظمة Linux/Mac/Windows. على Linux قد تحتاج `sudo apt install build-essential python3`.

---

## 🚀 التشغيل السريع (محلياً)

```bash
# 1) تثبيت الاعتماديات
npm install

# 2) إنشاء ملف البيئة من المثال
cp .env.example .env
# (افتح .env وعدّل JWT_SECRET وبيانات المدير)

# 3) تهيئة قاعدة البيانات + بيانات تجريبية (اختياري)
npm run seed

# 4) تشغيل الخادم
npm start
# للتطوير مع إعادة التشغيل التلقائي:
npm run dev
```

ثم افتح:
- الموقع: `http://localhost:3000`
- لوحة التحكم: `http://localhost:3000/admin/login.html`

### 🔐 بيانات الدخول الافتراضية
| الحقل | القيمة |
|------|--------|
| البريد | `admin@daragatuk.sa` |
| كلمة المرور | `Admin@12345` |

> ⚠️ **غيّر كلمة المرور فوراً بعد أول دخول** من صفحة الإعدادات، وغيّر `JWT_SECRET` في `.env`.

---

## 🗂️ بنية المشروع

```
.
├── package.json
├── ecosystem.config.js          # إعدادات PM2
├── .env.example
├── data/                        # قاعدة بيانات SQLite (تُنشأ تلقائياً)
│   └── daragatuk.db
├── public/                      # الواجهة الأمامية (Static)
│   ├── index.html               # الصفحة الرئيسية
│   ├── motorcycles.html         # قائمة الدراجات + فلترة
│   ├── motorcycle.html          # تفاصيل الدراجة + Slider + WhatsApp
│   ├── about.html               # من نحن
│   ├── contact.html             # تواصل معنا
│   ├── css/style.css
│   ├── js/                      # api.js, layout.js, card.js, motorcycles.js, detail.js
│   ├── uploads/                 # الصور المرفوعة
│   └── admin/                   # لوحة التحكم
│       ├── login.html
│       ├── index.html           # Dashboard + إحصائيات + Chart
│       ├── motorcycles.html     # جدول الإدارة
│       ├── edit.html            # إضافة/تعديل دراجة + إدارة الصور
│       ├── settings.html        # إعدادات الموقع + كلمة المرور
│       └── js/                  # admin.js, list.js, edit.js
└── src/                         # الباك إند (Clean Architecture)
    ├── server.js                # نقطة الدخول
    ├── bootstrap.js             # إنشاء حساب المدير تلقائياً
    ├── config/                  # الإعدادات والمتغيرات
    ├── database/                # db.js (migrations) + seed.js
    ├── models/                  # motorcycle / admin / settings
    ├── controllers/             # منطق الأعمال
    ├── routes/                  # تعريف مسارات API
    └── middleware/              # auth (JWT) / validate / upload / error
```

---

## 🔌 توثيق الـ API

كل المسارات تحت `/api`. المسارات المحمية تتطلب جلسة مدير (Cookie `token` أو هيدر `Authorization: Bearer <token>`).

### المصادقة `/api/auth`
| الطريقة | المسار | الوصف | محمي |
|--------|--------|-------|------|
| POST | `/api/auth/login` | تسجيل الدخول `{email, password}` | ❌ |
| POST | `/api/auth/logout` | تسجيل الخروج | ❌ |
| GET | `/api/auth/me` | بيانات المدير الحالي | ✅ |
| POST | `/api/auth/change-password` | `{current_password, new_password}` | ✅ |

### الدراجات `/api/motorcycles`
| الطريقة | المسار | الوصف | محمي |
|--------|--------|-------|------|
| GET | `/api/motorcycles` | قائمة + فلترة `?search&city&brand&status&minPrice&maxPrice&sort&page&limit` | ❌ |
| GET | `/api/motorcycles/featured` | أحدث 6 دراجات متاحة | ❌ |
| GET | `/api/motorcycles/stats` | الإحصائيات (إجمالي/متاحة/محجوزة/مباعة/مشاهدات) | ❌ |
| GET | `/api/motorcycles/filters` | قيم الفلاتر (المدن/الشركات) | ❌ |
| GET | `/api/motorcycles/:id` | تفاصيل دراجة + صورها | ❌ |
| POST | `/api/motorcycles` | إضافة دراجة (FormData يدعم `images`) | ✅ |
| PUT | `/api/motorcycles/:id` | تعديل دراجة | ✅ |
| PATCH | `/api/motorcycles/:id/status` | تغيير الحالة `{status}` | ✅ |
| DELETE | `/api/motorcycles/:id` | حذف دراجة (+ صورها) | ✅ |
| POST | `/api/motorcycles/:id/images` | رفع صور (FormData `images`) | ✅ |
| POST | `/api/motorcycles/:id/images/url` | إضافة صورة برابط `{image_url}` | ✅ |
| DELETE | `/api/motorcycles/:id/images/:imageId` | حذف صورة | ✅ |
| PATCH | `/api/motorcycles/:id/main-image` | تعيين صورة رئيسية `{image_url}` | ✅ |
| PATCH | `/api/motorcycles/:id/images/reorder` | إعادة ترتيب `{order: [ids]}` | ✅ |

### الإعدادات `/api/settings`
| الطريقة | المسار | الوصف | محمي |
|--------|--------|-------|------|
| GET | `/api/settings` | إعدادات الموقع العامة | ❌ |
| PUT | `/api/settings` | تحديث الإعدادات | ✅ |
| POST | `/api/settings/logo` | رفع الشعار (FormData `logo`) | ✅ |

### فحص الصحة
- `GET /api/health` → `{ success: true, status: "ok" }`

---

## 🗄️ نموذج قاعدة البيانات

**جدول `motorcycles`**
`id, title, brand, model, year, color, mileage, city, price, description,
status(available|reserved|sold), negotiable(0/1), main_image, views, created_at, updated_at`

**جدول `images`**
`id, motorcycle_id (FK→motorcycles, ON DELETE CASCADE), image_url, order_index, created_at`

**جدول `admins`**
`id, email (UNIQUE), password_hash (bcrypt), created_at`

**جدول `settings`** (مفتاح/قيمة)
`site_name, site_description, whatsapp_number, logo_url, email`

---

## 💬 نظام واتساب

زر "تواصل عبر واتساب" في صفحة التفاصيل يفتح:
```
https://wa.me/{whatsapp_number}?text=<رسالة جاهزة>
```
الرسالة تتضمن تلقائياً: رقم الإعلان، اسم الدراجة، السعر، المدينة، السنة.
رقم واتساب يُدار من **لوحة التحكم → الإعدادات**.

---

## 🔐 ملاحظات أمنية

- كلمات المرور مشفّرة عبر **bcrypt**.
- المصادقة عبر **JWT** يُخزَّن في Cookie من نوع `httpOnly`.
- جميع المسارات الإدارية محمية بـ middleware `requireAuth`.
- **Validation** كامل لمدخلات الدراجات.
- حماية رفع الملفات (نوع MIME + حد أقصى للحجم عبر `MAX_UPLOAD_MB`).
- `helmet` + تحديد محاولات تسجيل الدخول (`express-rate-limit`).
- في الإنتاج: شغّل خلف **HTTPS** (Nginx) ليُفعّل الكوكي الآمن (`secure`).

---

## 🚢 النشر على VPS (Production)

### 1) إعداد الخادم
```bash
sudo apt update && sudo apt install -y nodejs npm git build-essential python3
sudo npm install -g pm2
```

### 2) جلب المشروع وتشغيله
```bash
git clone <repo-url> daragatuk && cd daragatuk
npm install --production
cp .env.example .env && nano .env   # عدّل JWT_SECRET وكلمة مرور المدير
npm run seed                        # (اختياري) بيانات تجريبية
pm2 start ecosystem.config.js
pm2 save && pm2 startup             # تشغيل دائم بعد إعادة الإقلاع
```

### 3) Nginx كـ Reverse Proxy (موصى به)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 10M;   # للسماح برفع الصور
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
ثم فعّل HTTPS عبر Certbot:
```bash
sudo certbot --nginx -d your-domain.com
```

### أوامر PM2 المفيدة
```bash
pm2 logs daragatuk-alayna     # السجلات
pm2 restart daragatuk-alayna  # إعادة التشغيل
pm2 stop daragatuk-alayna     # الإيقاف
pm2 monit                     # المراقبة
```

> **النسخ الاحتياطي:** انسخ مجلد `data/` (قاعدة البيانات) و`public/uploads/` (الصور) دورياً.

---

## ✅ الميزات المكتملة

- [x] واجهة زوار كاملة (رئيسية، قائمة، تفاصيل، من نحن، تواصل)
- [x] بحث مباشر + فلترة (مدينة/شركة/سعر/حالة) + ترتيب + ترقيم صفحات
- [x] صفحة تفاصيل مع Slider للصور وزر واتساب ديناميكي
- [x] لوحة تحكم: Dashboard بإحصائيات ورسم بياني
- [x] إدارة الدراجات (إضافة/تعديل/حذف/تغيير الحالة)
- [x] إدارة الصور (رفع متعدد / رابط / حذف / تعيين رئيسية)
- [x] إعدادات الموقع + رفع الشعار + تغيير كلمة المرور
- [x] مصادقة JWT + bcrypt + حماية المسارات + Validation
- [x] قاعدة بيانات SQLite + Migrations + Seeds
- [x] دليل النشر PM2 + Nginx

## 🔭 خطوات تطوير مقترحة (مستقبلية)

- إضافة سحب وإفلات (drag & drop) لإعادة ترتيب الصور بصرياً.
- تعدّد المدراء وصلاحيات مختلفة.
- صفحة "المفضلة" للزوار (Local Storage).
- توليد Sitemap وتحسين SEO + Open Graph.
- ضغط الصور تلقائياً عند الرفع (sharp).
- اختبارات آلية (Jest/Supertest) لمسارات الـ API.

---

© دراجتك علينا — جميع الحقوق محفوظة.
#   D a r a j a t a k - E n d a n a  
 