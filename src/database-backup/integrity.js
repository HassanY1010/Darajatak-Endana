const { Pool } = require('pg');
const logger = require('./logger');

async function inspectDatabaseSchemaAndCounts(databaseUrl) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    // 1. Tables & Row counts
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = tablesRes.rows.map(r => r.table_name);
    const rowCounts = {};
    for (const t of tables) {
      const c = await pool.query(`SELECT count(*) FROM "${t}"`);
      rowCounts[t] = parseInt(c.rows[0].count, 10);
    }

    // 2. Primary Keys & Unique Constraints
    const pkRes = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'p';
    `);

    // 3. Foreign Keys
    const fkRes = await pool.query(`
      SELECT
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
      ORDER BY tc.constraint_name;
    `);

    // 4. Indexes
    const idxRes = await pool.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    // 5. Sequences
    const seqRes = await pool.query(`
      SELECT sequence_name 
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name;
    `);

    // 6. Image References (storage links validation)
    let imageSample = [];
    if (tables.includes('images')) {
      const imgRes = await pool.query(`SELECT id, motorcycle_id, image_url FROM images LIMIT 10;`);
      imageSample = imgRes.rows;
    }

    let motorcycleImageSample = [];
    if (tables.includes('motorcycles')) {
      const motoRes = await pool.query(`SELECT id, title, main_image FROM motorcycles WHERE main_image IS NOT NULL LIMIT 10;`);
      motorcycleImageSample = motoRes.rows;
    }

    let settingsSample = [];
    if (tables.includes('settings')) {
      const setRes = await pool.query(`SELECT key, value FROM settings WHERE key IN ('logo_url', 'site_name');`);
      settingsSample = setRes.rows;
    }

    await pool.end();

    return {
      tables,
      tablesCount: tables.length,
      rowCounts,
      primaryKeys: pkRes.rows,
      primaryKeysCount: pkRes.rows.length,
      foreignKeys: fkRes.rows,
      foreignKeysCount: fkRes.rows.length,
      indexes: idxRes.rows,
      indexesCount: idxRes.rows.length,
      sequences: seqRes.rows.map(s => s.sequence_name),
      sequencesCount: seqRes.rows.length,
      imageSample,
      motorcycleImageSample,
      settingsSample
    };
  } catch (err) {
    try { await pool.end(); } catch (_) {}
    throw err;
  }
}

function compareDatabaseSnapshots(sourceSnapshot, restoredSnapshot) {
  const discrepancies = [];

  // Compare tables
  if (sourceSnapshot.tablesCount !== restoredSnapshot.tablesCount) {
    discrepancies.push(`Table count mismatch: Source has ${sourceSnapshot.tablesCount}, Restored has ${restoredSnapshot.tablesCount}`);
  }

  for (const t of sourceSnapshot.tables) {
    if (!restoredSnapshot.tables.includes(t)) {
      discrepancies.push(`Missing table in restored DB: ${t}`);
    }
  }

  // Compare row counts
  for (const [table, count] of Object.entries(sourceSnapshot.rowCounts)) {
    const restoredCount = restoredSnapshot.rowCounts[table];
    if (restoredCount !== count) {
      discrepancies.push(`Row count mismatch in table '${table}': Source=${count}, Restored=${restoredCount}`);
    }
  }

  // Compare Foreign Keys
  if (sourceSnapshot.foreignKeysCount !== restoredSnapshot.foreignKeysCount) {
    discrepancies.push(`Foreign Keys count mismatch: Source=${sourceSnapshot.foreignKeysCount}, Restored=${restoredSnapshot.foreignKeysCount}`);
  }

  // Compare Indexes
  if (sourceSnapshot.indexesCount !== restoredSnapshot.indexesCount) {
    discrepancies.push(`Indexes count mismatch: Source=${sourceSnapshot.indexesCount}, Restored=${restoredSnapshot.indexesCount}`);
  }

  // Compare Image References
  for (let i = 0; i < sourceSnapshot.imageSample.length; i++) {
    const srcImg = sourceSnapshot.imageSample[i];
    const resImg = restoredSnapshot.imageSample.find(r => r.id === srcImg.id);
    if (!resImg) {
      discrepancies.push(`Image record ID ${srcImg.id} missing in restored DB`);
    } else if (resImg.image_url !== srcImg.image_url) {
      discrepancies.push(`Image URL changed for ID ${srcImg.id}: Original='${srcImg.image_url}' vs Restored='${resImg.image_url}'`);
    }
  }

  return {
    isMatch: discrepancies.length === 0,
    discrepancies
  };
}

module.exports = {
  inspectDatabaseSchemaAndCounts,
  compareDatabaseSnapshots
};
