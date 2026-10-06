/**
 * Check every prompt image already posted against the same rules the
 * moderate-prompt function applies to new ones.
 *
 * moderate-prompt only runs when a prompt is posted or its image is replaced,
 * so everything posted before it existed has never been looked at. This walks
 * the whole gallery once and lists what it would have removed or sent for
 * review.
 *
 * It changes nothing. It reads the public list of prompts with the anon key,
 * asks OpenAI's moderation model about each image, and prints the result.
 * Anything it flags is for a person to open and decide on.
 *
 *   OPENAI_API_KEY=... node scripts/scan-prompt-images.mjs
 *
 * The moderation endpoint is free to call. VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are read from .env.local.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://www.parostudios.in';
const PAGE = 500;

// Keep in step with supabase/functions/moderate-prompt/index.ts.
const REMOVABLE = { 'sexual': 0.85, 'violence/graphic': 0.85, 'sexual/minors': 0.3 };

function readEnv() {
  const values = {};
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = readEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !anonKey) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be in .env.local');
  process.exit(1);
}
if (!openAiKey) {
  console.error('Run it as: OPENAI_API_KEY=... node scripts/scan-prompt-images.mjs');
  process.exit(1);
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function allPrompts() {
  const prompts = [];
  for (let from = 0; ; from += PAGE) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/prompts?select=id,title,image_url&order=created_at.asc`,
      { headers: { apikey: anonKey, Range: `${from}-${from + PAGE - 1}` } },
    );
    if (!response.ok) throw new Error(`Could not list prompts: ${response.status} ${await response.text()}`);
    const page = await response.json();
    prompts.push(...page);
    if (page.length < PAGE) return prompts;
  }
}

/** One image's result, waiting and trying again when OpenAI says to slow down. */
async function check(imageUrl) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url: imageUrl } }],
      }),
    });

    if (response.status === 429 && attempt <= 5) {
      await wait(attempt * 3000);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
    return (await response.json()).results[0];
  }
}

const percent = (score) => `${Math.round(score * 100)}%`;

const prompts = await allPrompts();
console.log(`Checking ${prompts.length} prompt images. Nothing is changed.\n`);

const remove = [];
const review = [];
const failed = [];

for (const [index, prompt] of prompts.entries()) {
  process.stdout.write(`\r${index + 1}/${prompts.length}`);
  try {
    const result = await check(prompt.image_url);
    const scores = result.category_scores ?? {};
    const over = Object.entries(REMOVABLE).filter(([category, limit]) => (scores[category] ?? 0) >= limit);
    const top = Object.entries(scores)
      .filter(([category, score]) => result.categories?.[category] || score >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([category, score]) => `${category} ${percent(score)}`)
      .join(', ');

    if (over.length > 0) remove.push({ ...prompt, top });
    else if (result.flagged) review.push({ ...prompt, top });
  } catch (error) {
    failed.push({ ...prompt, top: String(error.message ?? error) });
  }
  // A small pause keeps a large gallery under OpenAI's per minute limit.
  await wait(250);
}

const list = (heading, rows) => {
  console.log(`\n${heading}: ${rows.length}`);
  for (const row of rows) {
    console.log(`  "${row.title}"  ${row.top}\n    ${SITE_URL}/prompt/${row.id}`);
  }
};

console.log('\n');
list('Would be removed automatically', remove);
list('Flagged, needs a look', review);
if (failed.length > 0) list('Could not be checked', failed);
console.log(`\nClean: ${prompts.length - remove.length - review.length - failed.length} of ${prompts.length}`);
