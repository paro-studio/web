export const promptsQueryKey = (limit: number, viewerId: string | undefined) =>
  ["prompts", limit, viewerId ?? null] as const;
