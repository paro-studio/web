/**
 * Score image files against the moderation rules without posting them.
 *
 * The only other way to learn what the checker makes of a picture is to post
 * it to Paro, which spends one of the day's three posts and puts the picture
 * in the feed. This reads files from disk, asks OpenAI's moderation model
 * about each, and prints the scores next to what moderate-prompt would do
 * with them. It is how to find out where a limit belongs: try a handful of
 * pictures either side of the line and see where they land.
 *
 * Nothing is uploaded to Paro and nothing is changed. The pictures are sent
 * to OpenAI for the check, the same as a real post's would be.
 *
 *   OPENAI_API_KEY=... node scripts/score-images.mjs photo1.jpg photo2.png
 *   OPENAI_API_KEY=... node scripts/score-images.mjs ~/Desktop/samples/*
 *
 * A web address works in place of a file. The limits come from
 * supabase/functions/moderate-prompt/policy.ts.
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { judge, POLICY } from '../supabase/functions/moderate-prompt/policy.ts';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
/** Scores under this are left out of the list; they say nothing. */
const WORTH_SHOWING = 0.03;

const openAiKey = process.env.OPENAI_API_KEY;
const inputs = process.argv.slice(2);

if (!openAiKey || inputs.length === 0) {
  console.error('Run it as: OPENAI_API_KEY=... node scripts/score-images.mjs <image files or addresses>');
  process.exit(1);
}

const percent = (score) => `${Math.round(score * 100)}%`.padStart(4);

/** The picture as OpenAI takes it: an address as it is, a file as its bytes. */
function asImageUrl(input) {
  if (/^https?:\/\//.test(input)) return input;
  const type = TYPES[extname(input).toLowerCase()];
  if (!type) throw new Error('not a jpg, png, webp or gif');
  return `data:${type};base64,${readFileSync(input).toString('base64')}`;
}

async function scoresFor(imageUrl) {
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [{ type: 'image_url', image_url: { url: imageUrl } }],
    }),
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).results[0].category_scores ?? {};
}

const limits = Object.keys(POLICY.image.remove)
  .map((category) => `${category} ${percent(POLICY.image.remove[category]).trim()}`)
  .join(', ');
console.log(`Removed at: ${limits}\n`);

for (const input of inputs) {
  const name = /^https?:\/\//.test(input) ? input : basename(input);
  try {
    const scores = await scoresFor(asImageUrl(input));
    const { remove, review } = judge('image', scores);
    const verdict = remove.length > 0 ? 'REMOVED' : review.length > 0 ? 'stays up, sent for a look' : 'stays up';

    console.log(`${name}\n  -> ${verdict}`);
    const shown = Object.entries(scores)
      .filter(([, score]) => score >= WORTH_SHOWING)
      .sort((a, b) => b[1] - a[1]);
    if (shown.length === 0) console.log('     nothing scored');
    for (const [category, score] of shown) console.log(`     ${percent(score)}  ${category}`);
  } catch (error) {
    console.log(`${name}\n  -> could not be scored: ${error.message ?? error}`);
  }
  console.log('');
}
