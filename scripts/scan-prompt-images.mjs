/**
 * Check every prompt already posted against the same rules the
 * moderate-prompt function applies to new ones, and show how the whole
 * gallery scores, so the limits can be set from real posts and not guesses.
 *
 * moderate-prompt only runs when a prompt is posted or edited, so everything
 * posted before it existed has never been looked at. This walks the gallery
 * once and prints:
 *
 *   1. what would be removed, and what would be sent for a person to look at
 *   2. for each category, the highest scoring prompts and how many sit over
 *      each limit. That second part is how to tell whether a limit is right:
 *      a remove line just above the highest innocent score catches the most
 *      without touching anything that should stay.
 *
 * It changes nothing. It reads the public list of prompts with the anon key,
 * asks OpenAI's moderation model about each image and about each title with
 * its tags, and prints. The prompt text itself is not checked here: the anon
 * key cannot read it. The live function checks it for new posts.
 *
 *   OPENAI_API_KEY=... node scripts/scan-prompt-images.mjs
 *
 * The limits come from supabase/functions/moderate-prompt/policy.ts, the
 * same file the function uses. The moderation endpoint is free to call.
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are read from .env.local.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { judge, POLICY } from '../supabase/functions/moderate-prompt/policy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://www.parostudios.in';
const PAGE = 500;
/** How many of the highest scoring prompts to list per category. */
const TOP = 3;

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
const percent = (score) => `${Math.round(score * 100)}%`.padStart(4);

async function allPrompts() {
  const prompts = [];
  for (let from = 0; ; from += PAGE) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/prompts?select=id,title,tags,image_url&order=created_at.asc`,
      { headers: { apikey: anonKey, Range: `${from}-${from + PAGE - 1}` } },
    );
    if (!response.ok) throw new Error(`Could not list prompts: ${response.status} ${await response.text()}`);
    const page = await response.json();
    prompts.push(...page);
    if (page.length < PAGE) return prompts;
  }
}

/** One input's scores, waiting and trying again when OpenAI says to slow down. */
async function scoresFor(input) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: [input] }),
    });

    if (response.status === 429 && attempt <= 5) {
      await wait(attempt * 3000);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
    return (await response.json()).results[0].category_scores ?? {};
  }
}

const prompts = await allPrompts();
console.log(`Checking ${prompts.length} prompts: each image, and each title with its tags.`);
console.log('Nothing is changed.\n');

const remove = [];
const review = [];
const failed = [];
// kind -> category -> [{ score, prompt }]
const seen = { image: {}, text: {} };

const record = (kind, scores, prompt) => {
  for (const [category, score] of Object.entries(scores)) {
    (seen[kind][category] ??= []).push({ score, prompt });
  }
};

for (const [index, prompt] of prompts.entries()) {
  process.stdout.write(`\r${index + 1}/${prompts.length}`);
  try {
    const words = [prompt.title, (prompt.tags ?? []).join(', ')].join('\n');
    const imageScores = await scoresFor({ type: 'image_url', image_url: { url: prompt.image_url } });
    const textScores = await scoresFor({ type: 'text', text: words });
    record('image', imageScores, prompt);
    record('text', textScores, prompt);

    const image = judge('image', imageScores);
    const text = judge('text', textScores);
    const why = [...image.remove, ...text.remove, ...image.review, ...text.review].join(', ');

    if (image.remove.length + text.remove.length > 0) remove.push({ ...prompt, why });
    else if (image.review.length + text.review.length > 0) review.push({ ...prompt, why });
  } catch (error) {
    failed.push({ ...prompt, why: String(error.message ?? error) });
  }
  // A small pause keeps a large gallery under OpenAI's per minute limit.
  await wait(250);
}

const list = (heading, rows) => {
  console.log(`\n${heading}: ${rows.length}`);
  for (const row of rows) {
    console.log(`  "${row.title}"  ${row.why}\n    ${SITE_URL}/prompt/${row.id}`);
  }
};

console.log('\n\n=== WHAT THE CURRENT LIMITS WOULD DO ===');
list('Would be removed automatically', remove);
list('Would be sent for a look', review);
if (failed.length > 0) list('Could not be checked', failed);
console.log(`\nClean: ${prompts.length - remove.length - review.length - failed.length} of ${prompts.length}`);

console.log('\n\n=== HOW THE GALLERY SCORES, BY CATEGORY ===');
console.log('Highest scores first. "-" means no limit is set for that category.\n');

for (const kind of ['image', 'text']) {
  console.log(kind === 'image' ? 'IMAGES' : 'TITLES AND TAGS');
  const categories = Object.entries(seen[kind])
    .map(([category, rows]) => [category, rows.sort((a, b) => b.score - a.score)])
    .sort((a, b) => b[1][0].score - a[1][0].score);

  for (const [category, rows] of categories) {
    const removeAt = POLICY[kind].remove[category];
    const reviewAt = POLICY[kind].review[category];
    const over = (limit) => (limit === undefined ? '-' : rows.filter((row) => row.score >= limit).length);
    const limits =
      `review at ${reviewAt === undefined ? '-' : percent(reviewAt).trim()} (${over(reviewAt)} over), ` +
      `remove at ${removeAt === undefined ? '-' : percent(removeAt).trim()} (${over(removeAt)} over)`;

    // A category nobody scores on is noise in the report.
    if (rows[0].score < 0.01 && removeAt === undefined && reviewAt === undefined) continue;

    console.log(`\n  ${category}   ${limits}`);
    for (const row of rows.slice(0, TOP)) {
      if (row.score < 0.01) break;
      console.log(`    ${percent(row.score)}  "${row.prompt.title}"`);
    }
  }
  console.log('');
}
