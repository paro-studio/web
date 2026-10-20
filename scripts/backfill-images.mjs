/**
 * One-off backfill: downscale images already sitting in storage and backfill
 * image_width and image_height on the prompts table.
 *
 * src/lib/imageResize.ts only affects new uploads. Everything uploaded before
 * that shipped is still a full size original, and existing prompt rows lack
 * image_width/image_height. This walks the buckets to shrink oversized images
 * and updates the database rows with their width and height.
 *
 * Originals are copied to ./image-backup/ before anything is overwritten.
 *
 *   node scripts/backfill-images.mjs             # dry run, changes nothing
 *   node scripts/backfill-images.mjs --apply     # actually overwrite & update DB
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local, which is gitignored. Putting
 * it on the command line would leave it in your shell history.
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = join(root, 'image-backup');
const APPLY = process.argv.includes('--apply');

// Re-encoding is lossy, so it has to be worth doing. Files that would shrink
// by less than this are left as they are: trading real image quality for two
// percent of a hundred kilobyte file is a bad deal.
const MIN_SAVING = 0.15;

// Same bounds as src/services/supabase/storage.ts. Keep them in step.
const BUCKETS = [
  { id: 'prompt-images', maxWidth: 2048, maxHeight: 2048, quality: 90 },
  { id: 'avatars', maxWidth: 512, maxHeight: 512, quality: 85 },
  { id: 'banners', maxWidth: 1600, maxHeight: 1600, quality: 85 },
];

function loadEnv() {
  const path = join(root, '.env.local');
  if (!existsSync(path)) {
    console.error('No .env.local found. Copy .env.example and fill it in.');
    process.exit(1);
  }

  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }

  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error('VITE_SUPABASE_URL missing from .env.local');
    process.exit(1);
  }
  if (!key) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY missing.\n\n' +
        'Add it to .env.local (gitignored). Find it in the Supabase dashboard\n' +
        'under Settings, API, service_role. It bypasses RLS, so keep it local\n' +
        'and never commit it.'
    );
    process.exit(1);
  }

  return { url, key };
}

const kb = (n) => `${(n / 1024).toFixed(0)}kB`;

/** Storage paths are {userId}/{file}, so list folders then list each one. */
async function listFiles(storage, bucket) {
  const paths = [];
  const { data: folders, error } = await storage.from(bucket).list('', { limit: 1000 });

  if (error) throw new Error(`Listing ${bucket}: ${error.message}`);

  for (const folder of folders ?? []) {
    // Real files have an id, folder placeholders do not.
    if (folder.id) {
      paths.push(folder.name);
      continue;
    }

    const { data: files, error: inner } = await storage
      .from(bucket)
      .list(folder.name, { limit: 1000 });

    if (inner) throw new Error(`Listing ${bucket}/${folder.name}: ${inner.message}`);

    for (const file of files ?? []) {
      if (file.id) paths.push(`${folder.name}/${file.name}`);
    }
  }

  return paths;
}

async function processBucket(storage, bucket) {
  const paths = await listFiles(storage, bucket.id);
  console.log(`\n${bucket.id}: ${paths.length} file(s)`);

  let before = 0;
  let after = 0;
  let changed = 0;
  let skipped = 0;

  for (const path of paths) {
    const { data, error } = await storage.from(bucket.id).download(path);
    if (error) {
      console.log(`  !  ${path}  download failed: ${error.message}`);
      continue;
    }

    const original = Buffer.from(await data.arrayBuffer());

    let resized;
    try {
      resized = await sharp(original)
        .rotate() // honour EXIF orientation before stripping it
        .resize(bucket.maxWidth, bucket.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: bucket.quality })
        .toBuffer();
    } catch (err) {
      console.log(`  !  ${path}  not an image we can process, leaving it alone`);
      continue;
    }

    before += original.length;

    // Not worth a lossy rewrite for a marginal gain, and re-encoding a small
    // well compressed image can make it bigger outright.
    if (resized.length > original.length * (1 - MIN_SAVING)) {
      after += original.length;
      skipped++;
      continue;
    }

    after += resized.length;
    changed++;
    const saved = (100 * (1 - resized.length / original.length)).toFixed(0);
    console.log(`  ${APPLY ? '->' : ' ~'} ${path}  ${kb(original.length)} -> ${kb(resized.length)}  (-${saved}%)`);

    if (!APPLY) continue;

    // Back up the original before it is gone for good.
    const backupPath = join(BACKUP_DIR, bucket.id, path);
    mkdirSync(dirname(backupPath), { recursive: true });
    writeFileSync(backupPath, original);

    // Same path, so image_url on the prompt row stays valid and the database
    // is never touched. contentType is what decides how it is served.
    const { error: uploadError } = await storage
      .from(bucket.id)
      .upload(path, resized, { upsert: true, contentType: 'image/webp' });

    if (uploadError) {
      console.log(`  !  ${path}  upload failed: ${uploadError.message}`);
    }
  }

  return { before, after, changed, skipped };
}

async function backfillPromptDimensions(supabase) {
  console.log(`\n${'-'.repeat(52)}`);
  console.log('Backfilling prompt image dimensions in the database...');

  const { data: prompts, error } = await supabase
    .from('prompts')
    .select('id, image_url, image_width, image_height')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`  ! Failed to query prompts: ${error.message}`);
    return;
  }

  let dbUpdated = 0;
  let dbSkipped = 0;
  let dbFailed = 0;

  for (const prompt of prompts ?? []) {
    if (prompt.image_width && prompt.image_height) {
      dbSkipped++;
      continue;
    }
    if (!prompt.image_url) {
      dbSkipped++;
      continue;
    }

    try {
      let imageBuffer;
      const urlParts = prompt.image_url.split('/prompt-images/');
      if (urlParts.length >= 2) {
        const filePath = decodeURIComponent(urlParts[1].split('?')[0]);
        const { data, error: downloadError } = await supabase.storage
          .from('prompt-images')
          .download(filePath);
        if (downloadError) throw downloadError;
        imageBuffer = Buffer.from(await data.arrayBuffer());
      } else {
        const response = await fetch(prompt.image_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        imageBuffer = Buffer.from(await response.arrayBuffer());
      }

      const meta = await sharp(imageBuffer).metadata();
      const width = meta.width;
      const height = meta.height;

      if (!width || !height) {
        throw new Error('Could not read image dimensions');
      }

      console.log(`  ${APPLY ? '->' : ' ~'} Prompt ${prompt.id}  ${width}x${height}`);

      if (APPLY) {
        const { error: updateError } = await supabase
          .from('prompts')
          .update({ image_width: width, image_height: height })
          .eq('id', prompt.id);

        if (updateError) {
          console.error(`  ! Failed to update prompt ${prompt.id}: ${updateError.message}`);
          dbFailed++;
          continue;
        }
      }
      dbUpdated++;
    } catch (err) {
      console.log(`  !  Prompt ${prompt.id} (${prompt.image_url}): ${err.message}`);
      dbFailed++;
    }
  }

  console.log(`\nPrompts database: ${dbUpdated} ${APPLY ? 'updated' : 'to update'}, ${dbSkipped} already had dimensions, ${dbFailed} failed`);
}

const { url, key } = loadEnv();
const supabaseClient = createClient(url, key, { auth: { persistSession: false } });

if (!APPLY) {
  console.log('DRY RUN. Nothing will be changed. Re-run with --apply to do it.');
}

let totalBefore = 0;
let totalAfter = 0;
let totalChanged = 0;
let totalSkipped = 0;

for (const bucket of BUCKETS) {
  const result = await processBucket(supabaseClient.storage, bucket);
  totalBefore += result.before;
  totalAfter += result.after;
  totalChanged += result.changed;
  totalSkipped += result.skipped;
}

await backfillPromptDimensions(supabaseClient);

const saved = totalBefore ? (100 * (1 - totalAfter / totalBefore)).toFixed(0) : '0';

console.log(`\n${'-'.repeat(52)}`);
console.log(`${totalChanged} to shrink, ${totalSkipped} already small enough`);
console.log(`${kb(totalBefore)} -> ${kb(totalAfter)}  (-${saved}%)`);

if (APPLY) {
  console.log(`Originals backed up to ${BACKUP_DIR}`);
} else {
  console.log('Dry run, nothing changed. Add --apply to write.');
}
