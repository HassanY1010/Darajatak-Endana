// كائن التخزين المؤقت في السيرفر — دراجتك علينا
const NodeCache = require('node-cache');

// إعداد كاش بمدة صلاحية افتراضية 10 دقائق (600 ثانية)
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

module.exports = {
  cache,
  KEYS: {
    SETTINGS: 'site_settings',
    STATS: 'site_stats',
    FEATURED: 'featured_motorcycles',
    FILTERS: 'site_filters'
  },
  
  // دالة لمسح كاش معين أو الكاش بالكامل
  invalidate(key) {
    if (key) {
      cache.del(key);
      console.log(`🧹 [Cache] Key invalidated: ${key}`);
    } else {
      cache.flushAll();
      console.log('🧹 [Cache] All server cache invalidated.');
    }
  }
};
