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

  // تحسين الصور وتجنب ملفات GIF المتحركة لضمان التوافق 100% مع كافة الأجهزة
  if (mimetype && mimetype.startsWith('image/') && mimetype !== 'image/gif') {
    try {
      finalBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true }) // عرض أقصى 1200 بكسل مع الحفاظ على التناسب
        .jpeg({ quality: 80, progressive: true }) // التحويل لصيغة progressive JPEG المضغوطة والمتوافقة بالكامل
        .toBuffer();
      
      finalMime = 'image/jpeg';
      
      const lastDot = filename.lastIndexOf('.');
      if (lastDot !== -1) {
        finalFilename = filename.substring(0, lastDot) + '.jpg';
      } else {
        finalFilename = filename + '.jpg';
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
  if (!supabase || !imageUrl) return false;

  // تجاهل الصور المرفوعة محلياً مسبقاً (إرث)
  if (imageUrl.startsWith('/uploads/')) return true;

  let filename = imageUrl.split('/').pop();
  if (filename) {
    filename = filename.split('?')[0]; // إزالة أي query parameters إن وجدت
    try {
      const { data, error } = await supabase.storage.from(config.supabase.bucket).remove([filename]);
      if (error) {
        console.error(`❌ فشل حذف الصورة من Supabase storage: ${filename}`, error.message);
        return false;
      }
      console.log(`✅ تم حذف الصورة من Supabase storage: ${filename}`);
      return true;
    } catch (e) {
      console.error(`❌ فشل حذف الصورة من Supabase storage: ${filename}`, e.message);
      return false;
    }
  }
  return false;
}

module.exports = {
  supabase,
  uploadImage,
  deleteImage
};
