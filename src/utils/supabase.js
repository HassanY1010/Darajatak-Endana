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

const sharp = require('sharp');

/**
 * رفع صورة إلى حوض التخزين (Bucket) في Supabase مع تحسينها وضغطها
 */
async function uploadImage(filename, buffer, mimetype) {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Please set SUPABASE_URL and SUPABASE_KEY.');
  }

  let finalBuffer = buffer;
  let finalMime = mimetype;
  let finalFilename = filename;

  // تحسين الصور فقط وتجنب ملفات GIF المتحركة
  if (mimetype && mimetype.startsWith('image/') && mimetype !== 'image/gif') {
    try {
      finalBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true }) // عرض أقصى 1200 بكسل مع الحفاظ على التناسب
        .webp({ quality: 80 }) // التحويل لصيغة webp وضغطها بجودة 80%
        .toBuffer();
      
      finalMime = 'image/webp';
      
      const lastDot = filename.lastIndexOf('.');
      if (lastDot !== -1) {
        finalFilename = filename.substring(0, lastDot) + '.webp';
      } else {
        finalFilename = filename + '.webp';
      }
    } catch (err) {
      console.error('⚠️ فشلت عملية تحسين الصورة، سيتم رفع الأصلية:', err.message);
    }
  }

  const { data, error } = await supabase.storage
    .from(config.supabase.bucket)
    .upload(finalFilename, finalBuffer, {
      contentType: finalMime,
      upsert: true
    });

  if (error) {
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(config.supabase.bucket)
    .getPublicUrl(finalFilename);

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
      await supabase.storage.from(config.supabase.bucket).remove([filename]);
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
