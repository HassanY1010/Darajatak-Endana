const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const ImageController = require('../src/controllers/image.controller');
const config = require('../src/config');

const TEST_PORT = 3999;
const CACHE_DIR = config.paths.cacheDir;

// إعداد خادم تجريبي لاختبار الـ Endpoints
const app = express();
app.get('/api/images/:filename', ImageController.serveImage);

let server;

function request(pathStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: pathStr,
      method: 'GET',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 1 — IMAGE CACHE HARDENING TESTS');
  console.log('====================================================\n');

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // تنظيف ملفات الاختبار السابقة
  const testFiles = ['test_img_1.jpg', 'test_img_2.jpg', 'test_corrupt.jpg', 'test_nonexistent.jpg'];
  testFiles.forEach(f => {
    const p1 = path.join(CACHE_DIR, f);
    const p2 = path.join(CACHE_DIR, `${f.split('.')[0]}_w400.jpg`);
    try { if (fs.existsSync(p1)) fs.unlinkSync(p1); } catch (_) {}
    try { if (fs.existsSync(p2)) fs.unlinkSync(p2); } catch (_) {}
  });

  server = app.listen(TEST_PORT);
  console.log(`[TEST-SERVER] Running on port ${TEST_PORT}\n`);

  try {
    // ----------------------------------------------------
    // TEST 1: طلب صورة غير موجودة في الكاش (Cache MISS -> Origin Fetch)
    // ----------------------------------------------------
    console.log('▶ TEST 1: Request uncached image (logo-1782041024871-73cb3a6f.jpg)');
    // نضمن عدم وجودها في الكاش قبل الاختبار
    const testLogo = 'logo-1782041024871-73cb3a6f.jpg';
    const cachedLogoPath = path.join(CACHE_DIR, testLogo);
    if (fs.existsSync(cachedLogoPath)) fs.unlinkSync(cachedLogoPath);

    ImageController.Metrics.reset();
    const res1 = await request(`/api/images/${testLogo}`);
    
    console.log(`   Status: ${res1.statusCode}`);
    console.log(`   X-Cache Header: ${res1.headers['x-cache']}`);
    console.log(`   ETag: ${res1.headers['etag']}`);
    console.log(`   Metrics:`, ImageController.Metrics.getSummary());

    if (res1.statusCode === 200 && res1.headers['x-cache'] === 'MISS-FETCHED' && ImageController.Metrics.originFetch === 1 && fs.existsSync(cachedLogoPath)) {
      console.log('   ✅ TEST 1 PASSED: Single Origin Fetch & Cached to Disk successfully.\n');
    } else {
      throw new Error(`TEST 1 FAILED: Expected 200 MISS-FETCHED with 1 origin fetch. Got ${res1.statusCode} with ${ImageController.Metrics.originFetch} fetches`);
    }

    // ----------------------------------------------------
    // TEST 2: طلب نفس الصورة مرة ثانية (Cache HIT -> No Supabase Fetch)
    // ----------------------------------------------------
    console.log('▶ TEST 2: Request same image again (Cache HIT)');
    ImageController.Metrics.reset();
    const res2 = await request(`/api/images/${testLogo}`);

    console.log(`   Status: ${res2.statusCode}`);
    console.log(`   X-Cache Header: ${res2.headers['x-cache']}`);
    console.log(`   Metrics:`, ImageController.Metrics.getSummary());

    if (res2.statusCode === 200 && res2.headers['x-cache'] === 'HIT-SERVER' && ImageController.Metrics.originFetch === 0 && ImageController.Metrics.cacheHit === 1) {
      console.log('   ✅ TEST 2 PASSED: Served from Local Cache with 0 Supabase Fetches.\n');
    } else {
      throw new Error('TEST 2 FAILED: Expected HIT-SERVER with 0 origin fetch');
    }

    // ----------------------------------------------------
    // TEST 3: 50 طلب متزامن لنفس الصورة غير المخزنة (Single-Flight Lock)
    // ----------------------------------------------------
    console.log('▶ TEST 3: 50 Concurrent requests for an uncached image variant');
    // إزالة النسخة المصغرة لاختبار الـ Single-Flight Processing & Fetch
    const thumbPath = path.join(CACHE_DIR, `logo-1782041024871-73cb3a6f_w300.jpg`);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    if (fs.existsSync(cachedLogoPath)) fs.unlinkSync(cachedLogoPath);

    ImageController.Metrics.reset();
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(request(`/api/images/${testLogo}?w=300`));
    }

    const results = await Promise.all(promises);
    const all200 = results.every(r => r.statusCode === 200);
    const metrics3 = ImageController.Metrics.getSummary();

    console.log(`   Total Requests sent: ${results.length}`);
    console.log(`   All responded with 200 OK: ${all200}`);
    console.log(`   Supabase Origin Fetches: ${metrics3.originFetch}`);
    console.log(`   Dedup Waits (Coalesced): ${metrics3.dedupWait}`);

    if (all200 && metrics3.originFetch === 1 && metrics3.dedupWait >= 48) {
      console.log('   ✅ TEST 3 PASSED: 50 concurrent requests collapsed into exactly 1 Supabase Fetch.\n');
    } else {
      throw new Error(`TEST 3 FAILED: Expected 1 fetch and >=48 coalesced waits. Got ${metrics3.originFetch} fetches, ${metrics3.dedupWait} waits.`);
    }

    // ----------------------------------------------------
    // TEST 4: طلب الصورة مع If-None-Match صحيح (HTTP 304 Not Modified)
    // ----------------------------------------------------
    console.log('▶ TEST 4: Request image with valid If-None-Match header (HTTP 304)');
    const validEtag = res2.headers['etag'];
    ImageController.Metrics.reset();
    const res4 = await request(`/api/images/${testLogo}`, { 'if-none-match': validEtag });

    console.log(`   Status: ${res4.statusCode}`);
    console.log(`   Body Length: ${res4.body.length} bytes`);
    console.log(`   Metrics:`, ImageController.Metrics.getSummary());

    if (res4.statusCode === 304 && res4.body.length === 0 && ImageController.Metrics.originFetch === 0 && ImageController.Metrics.http304 === 1) {
      console.log('   ✅ TEST 4 PASSED: Returned 304 Not Modified (0 bytes body, 0 Supabase Fetch).\n');
    } else {
      throw new Error(`TEST 4 FAILED: Expected 304 with 0 origin fetch. Got ${res4.statusCode}`);
    }

    // ----------------------------------------------------
    // TEST 5: معالجة ملف كاش تالف (Corrupted Cache Recovery)
    // ----------------------------------------------------
    console.log('▶ TEST 5: Corrupted Cache File Recovery');
    // كتابة ملف تالف بحجم 0 أو غير صالح
    fs.writeFileSync(cachedLogoPath, Buffer.from('corrupt data'));
    ImageController.Metrics.reset();

    const res5 = await request(`/api/images/${testLogo}`);
    console.log(`   Status: ${res5.statusCode}`);
    console.log(`   Metrics:`, ImageController.Metrics.getSummary());

    if (res5.statusCode === 200 && ImageController.Metrics.originFetch === 1) {
      console.log('   ✅ TEST 5 PASSED: Corrupted cache detected and replaced with valid image from origin.\n');
    } else {
      throw new Error(`TEST 5 FAILED: Expected recovery with origin fetch. Got ${res5.statusCode}`);
    }

    // ----------------------------------------------------
    // TEST 6: توفر الكاش الصالح عند انقطاع/توقف Supabase
    // ----------------------------------------------------
    console.log('▶ TEST 6: Supabase Outage while valid Cache exists');
    // إتلاف إعدادات Supabase مؤقتاً لمحاكاة الانقطاع
    const originalUrl = config.supabase.url;
    config.supabase.url = 'https://invalid-supabase-domain-down.co';

    ImageController.Metrics.reset();
    const res6 = await request(`/api/images/${testLogo}`);
    console.log(`   Status during outage: ${res6.statusCode}`);
    console.log(`   X-Cache: ${res6.headers['x-cache']}`);

    // استعادة الإعدادات
    config.supabase.url = originalUrl;

    if (res6.statusCode === 200 && res6.headers['x-cache'] === 'HIT-SERVER') {
      console.log('   ✅ TEST 6 PASSED: Served smoothly from cache even during Supabase outage.\n');
    } else {
      throw new Error(`TEST 6 FAILED: Failed to serve from cache during outage. Got ${res6.statusCode}`);
    }

    // ----------------------------------------------------
    // TEST 7: صورة غير موجودة إطلاقاً (Safe 404 Handling)
    // ----------------------------------------------------
    console.log('▶ TEST 7: Non-existent image request (Safe 404)');
    ImageController.Metrics.reset();
    const res7 = await request('/api/images/completely_missing_image_12345.jpg');
    console.log(`   Status for non-existent image: ${res7.statusCode}`);

    if (res7.statusCode === 404 && !fs.existsSync(path.join(CACHE_DIR, 'completely_missing_image_12345.jpg'))) {
      console.log('   ✅ TEST 7 PASSED: Clean 404 returned without leaving invalid cache files.\n');
    } else {
      throw new Error(`TEST 7 FAILED: Expected clean 404. Got ${res7.statusCode}`);
    }

    console.log('====================================================');
    console.log('🎉 ALL 7 TEST SCENARIOS PASSED WITH 100% SUCCESS');
    console.log('====================================================');

  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
