/**
 * What gets a prompt removed, and what gets a person asked to look.
 *
 * One place for the numbers, read by the moderate-prompt function for new
 * posts and by scripts/scan-prompt-images.mjs for old ones, so the two can
 * never disagree. Type annotations only, nothing that needs compiling: the
 * script imports this file straight into Node, which strips them.
 *
 * OpenAI's moderation model gives every input a score from 0 to 1 in each of
 * thirteen categories. Six of them apply to images (sexual, violence,
 * violence/graphic and the three self-harm ones); the rest only ever score on
 * text. A category missing from a list below is ignored for that input.
 *
 * Two lines per input:
 *
 *   remove   at or above this, the prompt and its image are taken down at
 *            once and Discord is told. Only for things the Community
 *            Guidelines rule out with no room for judgement.
 *   review   at or above this, the prompt stays up and Discord gets a "needs
 *            a look" message. For everything that depends on context.
 *
 * How the numbers were chosen:
 *
 * IMAGE
 *   sexual             remove 0.50. The rule is no nudity. A plain nude test
 *                      image scored 0.78; the first setting of 0.85 let it
 *                      through. Of the 68 prompts already posted, mostly
 *                      portraits and fashion, none reached 0.50.
 *   violence/graphic   remove 0.70. Gore and injury. Set above sexual because
 *                      horror and action art scores here too.
 *   self-harm          remove 0.80, for all three kinds. Rare in a gallery,
 *                      serious when it is real.
 *   violence           never removes. A raised fist, a villain, a weapon in
 *                      a film poster all score here, and none of that is
 *                      against the rules. Two existing prompts scored 0.42
 *                      and 0.51 and both are fine; review starts at 0.60 so
 *                      that kind of picture does not ping anyone.
 *
 * TEXT (the title, the tags and the prompt text together)
 *   A prompt is a description of a picture, so its words are a poor guide to
 *   whether the post breaks a rule: a film poster prompt talks about blood, a
 *   portrait prompt about skin. Text therefore removes for one thing only.
 *   sexual/minors      remove 0.30, review 0.05. No context makes this
 *                      acceptable, and the image model cannot judge age, so
 *                      the words are the only signal there is.
 *   sexual             review 0.70. A prompt written to produce explicit
 *                      images is worth a look even when the sample picture
 *                      is tame.
 *   hate, threats      review only. Titles are public, so slurs and threats
 *                      in them should be seen by someone.
 *   harassment, illicit and plain violence are left out: on image prompts
 *   they fire constantly and mean nothing.
 */
type Limits = Record<string, number>;

export const POLICY: Record<"image" | "text", { remove: Limits; review: Limits }> = {
  image: {
    remove: {
      "sexual": 0.5,
      "violence/graphic": 0.7,
      "self-harm": 0.8,
      "self-harm/intent": 0.8,
      "self-harm/instructions": 0.8,
    },
    review: {
      "sexual": 0.2,
      "violence": 0.6,
      "violence/graphic": 0.3,
      "self-harm": 0.3,
      "self-harm/intent": 0.3,
      "self-harm/instructions": 0.3,
    },
  },
  text: {
    remove: {
      "sexual/minors": 0.3,
    },
    review: {
      "sexual/minors": 0.05,
      "sexual": 0.7,
      "hate": 0.6,
      "hate/threatening": 0.3,
      "harassment/threatening": 0.5,
      "illicit/violent": 0.6,
      "self-harm/intent": 0.5,
      "self-harm/instructions": 0.5,
    },
  },
};

/**
 * Sorts one input's scores into what removes and what needs a look. Each
 * entry reads like "image sexual 78%", ready to show to a person.
 */
export function judge(kind: "image" | "text", scores: Record<string, number> | undefined) {
  const rules = POLICY[kind];
  const remove: string[] = [];
  const review: string[] = [];

  for (const [category, score] of Object.entries(scores ?? {})) {
    const label = `${kind} ${category} ${Math.round(score * 100)}%`;
    if (rules.remove[category] !== undefined && score >= rules.remove[category]) {
      remove.push(label);
    } else if (rules.review[category] !== undefined && score >= rules.review[category]) {
      review.push(label);
    }
  }

  return { remove, review };
}
