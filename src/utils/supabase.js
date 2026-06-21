const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const config = require('../config');

let supabase;
if (config.supabase.url && config.supabase.key) {
  supabase = createClient(config.supabase.url, config.supabase.key, {
    realtime: {
      transport: WebSocket
    }
  });
}

/**
 * رفع صورة إلى حوض التخزين (Bucket) في Supabase
 */
async function uploadImage(filename, buffer, mimetype) {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Please set SUPABASE_URL and SUPABASE_KEY.');
  }

  const { data, error } = await supabase.storage
    .from('motorcycles')
    .upload(filename, buffer, {
      contentType: mimetype,
      upsert: true
    });

  if (error) {
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('motorcycles')
    .getPublicUrl(filename);

  return publicUrl;
}

/**
 * حذف صورة من حوض التخزين (Bucket) في Supabase
 */
async function deleteImage(imageUrl) {
  if (!supabase || !imageUrl) return;

  // تجاهل الصور المرفوعة محلياً مسبقاً (إرث)
  if (imageUrl.startsWith('/uploads/')) return;

  const filename = imageUrl.split('/').pop();
  if (filename) {
    try {
      await supabase.storage.from('motorcycles').remove([filename]);
      console.log(`✅ تم حذف الصورة من Supabase storage: ${filename}`);
    } catch (e) {
      console.error(`❌ فشل حذف الصورة من Supabase storage: ${filename}`, e.message);
    }
  }
}

module.exports = {
  supabase,
  uploadImage,
  deleteImage
};
