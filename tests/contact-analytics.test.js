// اختبارات ميزة إحصائيات نقرات زر «تواصل» (Contact Click Analytics)
// تغطي جميع الحالات العشر المطلوبة بدقة مع التحقق من عزل الصلاحيات ومنع التسريب

const assert = require('assert');
const db = require('../src/database/db');
const MotorcycleModel = require('../src/models/motorcycle.model');

async function runTests() {
  console.log('🧪 بدء تشغيل اختبارات Contact Click Analytics...');

  await db.ready;

  // جلب معرفات المشرفين الأربعة من قاعدة البيانات
  const adminsRes = await db.query('SELECT id, name, email, role, supervisor_type FROM admins ORDER BY id ASC');
  const admins = adminsRes.rows;

  const coastAdmin = admins.find(a => a.email === 'coast@darajtak.com' || a.supervisor_type === 'coast');
  const valleyAdmin = admins.find(a => a.email === 'valley@darajtak.com' || a.supervisor_type === 'valley');
  const generalAdmin = admins.find(a => a.email === 'admin@daragatuk.sa' || a.role === 'admin');
  const assistantAdmin = admins.find(a => a.email === 'ass@darajtak.com');

  assert(coastAdmin, 'يجب أن يكون حساب مشرف الساحل موجوداً');
  assert(valleyAdmin, 'يجب أن يكون حساب مشرف الوادي موجوداً');
  assert(generalAdmin, 'يجب أن يكون حساب المشرف العام موجوداً');
  assert(assistantAdmin, 'يجب أن يكون حساب مساعد المشرف موجوداً');

  console.log(`✅ تم تأكيد حسابات المشرفين الأربعة:
    - مشرف الساحل: ID=${coastAdmin.id} (${coastAdmin.email}) - Type=${coastAdmin.supervisor_type}
    - مشرف الوادي: ID=${valleyAdmin.id} (${valleyAdmin.email}) - Type=${valleyAdmin.supervisor_type}
    - المشرف العام: ID=${generalAdmin.id} (${generalAdmin.email}) - Role=${generalAdmin.role}
    - مساعد المشرف: ID=${assistantAdmin.id} (${assistantAdmin.email}) - Role=${assistantAdmin.role}`);

  // إنشاء 4 دراجات تجريبية مخصصة للاختبار (واحدة لكل مشرف)
  const prefix = `TEST_MOTO_${Date.now()}`;
  const motoCoast = await MotorcycleModel.create({
    title: `${prefix} الساحل`,
    brand: 'هوندا',
    price: 5000,
    created_by: coastAdmin.id
  });

  const motoValley = await MotorcycleModel.create({
    title: `${prefix} الوادي`,
    brand: 'ياماها',
    price: 6000,
    created_by: valleyAdmin.id
  });

  const motoGeneral = await MotorcycleModel.create({
    title: `${prefix} المشرف العام`,
    brand: 'سوزوكي',
    price: 7000,
    created_by: generalAdmin.id
  });

  const motoAssistant = await MotorcycleModel.create({
    title: `${prefix} مساعد المشرف`,
    brand: 'كوزاكي',
    price: 8000,
    created_by: assistantAdmin.id
  });

  console.log(`✅ تم إنشاء الدراجات التجريبية بنجاح:
    - دراجة الساحل: ID=${motoCoast.id} (created_by=${motoCoast.created_by})
    - دراجة الوادي: ID=${motoValley.id} (created_by=${motoValley.created_by})
    - دراجة المشرف العام: ID=${motoGeneral.id} (created_by=${motoGeneral.created_by})
    - دراجة مساعد المشرف: ID=${motoAssistant.id} (created_by=${motoAssistant.created_by})`);

  try {
    // -------------------------------------------------------------
    // Test 1: دراجة منشورة بواسطة مشرف الساحل + ضغط «تواصل» -> +1 للساحل
    // -------------------------------------------------------------
    const r1 = await MotorcycleModel.recordContactClick(motoCoast.id, '127.0.0.1');
    assert.strictEqual(r1.counted, true, 'Test 1 Failed: يجب احتساب نقرة الساحل');
    assert.strictEqual(r1.category, 'coast', 'Test 1 Failed: يجب أن تكون فئة النقرة الساحل');
    console.log('✅ Test 1 Passed: احتساب نقرة الساحل بنجاح (+1 للساحل)');

    // -------------------------------------------------------------
    // Test 2: دراجة منشورة بواسطة مشرف الوادي + ضغط «تواصل» -> +1 للوادي
    // -------------------------------------------------------------
    const r2 = await MotorcycleModel.recordContactClick(motoValley.id, '127.0.0.2');
    assert.strictEqual(r2.counted, true, 'Test 2 Failed: يجب احتساب نقرة الوادي');
    assert.strictEqual(r2.category, 'valley', 'Test 2 Failed: يجب أن تكون فئة النقرة الوادي');
    console.log('✅ Test 2 Passed: احتساب نقرة الوادي بنجاح (+1 للوادي)');

    // -------------------------------------------------------------
    // Test 3: دراجة منشورة بواسطة المشرف الثالث (المشرف العام) -> لا تحتسب نهائياً
    // -------------------------------------------------------------
    const r3 = await MotorcycleModel.recordContactClick(motoGeneral.id, '127.0.0.3');
    assert.strictEqual(r3.counted, false, 'Test 3 Failed: يجب عدم احتساب نقرة المشرف العام');
    assert.strictEqual(r3.reason, 'excluded_admin', 'Test 3 Failed: سبب الاستبعاد excluded_admin');
    console.log('✅ Test 3 Passed: استبعاد نقرة المشرف العام وعدم تسجيلها نهائياً');

    // -------------------------------------------------------------
    // Test 4: دراجة منشورة بواسطة المشرف الرابع (مساعد المشرف) -> لا تحتسب نهائياً
    // -------------------------------------------------------------
    const r4 = await MotorcycleModel.recordContactClick(motoAssistant.id, '127.0.0.4');
    assert.strictEqual(r4.counted, false, 'Test 4 Failed: يجب عدم احتساب نقرة مساعد المشرف');
    assert.strictEqual(r4.reason, 'excluded_admin', 'Test 4 Failed: سبب الاستبعاد excluded_admin');
    console.log('✅ Test 4 Passed: استبعاد نقرة مساعد المشرف وعدم تسجيلها نهائياً');

    // إضافة نقرة ثانية للساحل لتنويع الأرقام (الساحل = 2، الوادي = 1)
    await MotorcycleModel.recordContactClick(motoCoast.id, '127.0.0.5');

    // -------------------------------------------------------------
    // Test 5: فحص الإجمالي = نقرات الساحل + نقرات الوادي فقط في لوحة المشرف العام
    // -------------------------------------------------------------
    const generalAnalytics = await MotorcycleModel.getContactAnalytics({
      adminId: generalAdmin.id,
      supervisorType: generalAdmin.supervisor_type,
      adminRole: generalAdmin.role,
      adminEmail: generalAdmin.email,
      period: 'all'
    });

    assert.strictEqual(
      generalAnalytics.totalClicks,
      generalAnalytics.coastClicks + generalAnalytics.valleyClicks,
      'Test 5 Failed: إجمالي النقرات يجب أن يساوي نقرات الساحل + نقرات الوادي'
    );
    // التأكد من أن دراجات المشرفين الآخرين ليست مدرجة
    const hasOtherAdmins = generalAnalytics.motorcycles.some(
      m => m.publisher_label !== 'مشرف الساحل' && m.publisher_label !== 'مشرف الوادي'
    );
    assert.strictEqual(hasOtherAdmins, false, 'Test 5 Failed: لا يجوز ظهور دراجات مشرفين آخرين في الإحصائيات');
    console.log(`✅ Test 5 Passed: الإجمالي (${generalAnalytics.totalClicks}) = الساحل (${generalAnalytics.coastClicks}) + الوادي (${generalAnalytics.valleyClicks}) بدون أي دراجات لمشرفين آخرين`);

    // -------------------------------------------------------------
    // Test 6 & Test 9: عزل الصلاحيات ومنع تسريب البيانات لمشرف الساحل
    // -------------------------------------------------------------
    const coastAnalytics = await MotorcycleModel.getContactAnalytics({
      adminId: coastAdmin.id,
      supervisorType: coastAdmin.supervisor_type,
      adminRole: coastAdmin.role,
      adminEmail: coastAdmin.email,
      period: 'all'
    });

    assert.strictEqual(coastAnalytics.role_type, 'coast', 'Test 6 Failed: نوع الدور يجب أن يكون coast');
    assert.strictEqual(coastAnalytics.valleyClicks, 0, 'Test 6 Failed: مشرف الساحل يجب ألا يرى نقرات الوادي');
    // التأكد من أن كل الدراجات في قائمته هي دراجات الساحل فقط
    const hasValleyInCoast = coastAnalytics.motorcycles.some(m => m.id === motoValley.id);
    assert.strictEqual(hasValleyInCoast, false, 'Test 6 Failed: تسريب! ظهرت دراجة الوادي في لوحة الساحل');
    console.log(`✅ Test 6 Passed: عزل لوحة الساحل ومنع تسريب بيانات الوادي (نقرات الساحل=${coastAnalytics.totalClicks}, نقرات الوادي=${coastAnalytics.valleyClicks})`);

    // -------------------------------------------------------------
    // Test 7 & Test 9: عزل الصلاحيات ومنع تسريب البيانات لمشرف الوادي
    // -------------------------------------------------------------
    const valleyAnalytics = await MotorcycleModel.getContactAnalytics({
      adminId: valleyAdmin.id,
      supervisorType: valleyAdmin.supervisor_type,
      adminRole: valleyAdmin.role,
      adminEmail: valleyAdmin.email,
      period: 'all'
    });

    assert.strictEqual(valleyAnalytics.role_type, 'valley', 'Test 7 Failed: نوع الدور يجب أن يكون valley');
    assert.strictEqual(valleyAnalytics.coastClicks, 0, 'Test 7 Failed: مشرف الوادي يجب ألا يرى نقرات الساحل');
    const hasCoastInValley = valleyAnalytics.motorcycles.some(m => m.id === motoCoast.id);
    assert.strictEqual(hasCoastInValley, false, 'Test 7 Failed: تسريب! ظهرت دراجة الساحل في لوحة الوادي');
    console.log(`✅ Test 7 Passed: عزل لوحة الوادي ومنع تسريب بيانات الساحل (نقرات الوادي=${valleyAnalytics.totalClicks}, نقرات الساحل=${valleyAnalytics.coastClicks})`);

    // -------------------------------------------------------------
    // Test 8: فحص لوحة المشرف المساعد والمشرفين المستثنين -> 0 وقائمة فارغة
    // -------------------------------------------------------------
    const assistantAnalytics = await MotorcycleModel.getContactAnalytics({
      adminId: assistantAdmin.id,
      supervisorType: assistantAdmin.supervisor_type,
      adminRole: assistantAdmin.role,
      adminEmail: assistantAdmin.email,
      period: 'all'
    });

    assert.strictEqual(assistantAnalytics.role_type, 'excluded', 'Test 8 Failed: دور المساعد يجب أن يكون excluded');
    assert.strictEqual(assistantAnalytics.totalClicks, 0, 'Test 8 Failed: يجب أن تكون نقرات المساعد 0');
    assert.strictEqual(assistantAnalytics.motorcycles.length, 0, 'Test 8 Failed: قائمة دراجات المساعد يجب أن تكون فارغة');
    console.log('✅ Test 8 Passed: مساعد المشرف يرى 0 نقرات وقائمة فارغة بالكامل');

    // -------------------------------------------------------------
    // Test 9: مطابقة الأرقام في قاعدة البيانات بدقة (بدون Mock Data)
    // -------------------------------------------------------------
    const dbCountRes = await db.query('SELECT COUNT(*) AS c FROM contact_clicks WHERE motorcycle_id = $1', [motoCoast.id]);
    const actualCoastMotoClicks = parseInt(dbCountRes.rows[0].c, 10);
    const motoInCoastList = coastAnalytics.motorcycles.find(m => m.id === motoCoast.id);
    assert.strictEqual(
      motoInCoastList.contact_clicks,
      actualCoastMotoClicks,
      'Test 9 Failed: عدد النقرات في الاستعلام يجب أن يطابق سجلات قاعدة البيانات الفعلية'
    );
    console.log(`✅ Test 9 Passed: مطابقة أرقام اللوحة مع قاعدة البيانات الفعلية بدقة (${motoInCoastList.contact_clicks} نقرات فعلية)`);

    // -------------------------------------------------------------
    // Test 10: فحص الفلترة الزمنية والتأكد من أنها تعتمد على contact_clicks.created_at
    // -------------------------------------------------------------
    const todayAnalytics = await MotorcycleModel.getContactAnalytics({
      adminId: generalAdmin.id,
      supervisorType: generalAdmin.supervisor_type,
      adminRole: generalAdmin.role,
      adminEmail: generalAdmin.email,
      period: 'today'
    });
    assert(todayAnalytics.totalClicks >= 3, 'Test 10 Failed: نقرات اليوم يجب أن تسجل');
    console.log(`✅ Test 10 Passed: الفلترة الزمنية لليوم تعمل بنجاح واحتسبت نقرات اليوم (${todayAnalytics.totalClicks} نقرة)`);

  } finally {
    // تنظيف البيانات التجريبية لحماية نظافة قاعدة البيانات
    console.log('🧹 تنظيف الدراجات التجريبية وسجلات النقرات...');
    await db.query('DELETE FROM contact_clicks WHERE motorcycle_id IN ($1, $2, $3, $4)', [
      motoCoast.id, motoValley.id, motoGeneral.id, motoAssistant.id
    ]);
    await db.query('DELETE FROM motorcycles WHERE id IN ($1, $2, $3, $4)', [
      motoCoast.id, motoValley.id, motoGeneral.id, motoAssistant.id
    ]);
    console.log('✅ تم تنظيف بيانات الاختبار بنجاح.');
  }

  console.log('🎉 اكتملت جميع الاختبارات العشرة بنجاح تام وبأعلى درجات الموثوقية!');
}

runTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ فشل الاختبار:', err);
    process.exit(1);
  });
