interface Rankable {
  id: string;
  tags: string[];
  createdAt?: string;
}

/**
 * Picks the prompts closest to the one being viewed.
 *
 * Each shared tag scores by how rare it is, so sharing `vintage` counts for
 * more than sharing `photoshoot`, which most prompts have. Taking the newest
 * matches instead gave most prompts the same list. Ties go to the newest.
 */
export function rankRelatedPrompts<T extends Rankable>(
  current: { id: string; tags: string[] },
  candidates: T[],
  limit: number
): T[] {
  const tagCounts = new Map<string, number>();
  for (const { tags } of candidates) {
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const currentTags = new Set(current.tags);
  const score = ({ tags }: T) =>
    tags
      .filter((tag) => currentTags.has(tag))
      .reduce((total, tag) => total + Math.log(1 + candidates.length / tagCounts.get(tag)!), 0);

  return candidates
    .filter((p) => p.id !== current.id)
    .map((prompt) => ({ prompt, score: score(prompt), time: new Date(prompt.createdAt ?? 0).getTime() }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.time - a.time)
    .slice(0, limit)
    .map(({ prompt }) => prompt);
}
