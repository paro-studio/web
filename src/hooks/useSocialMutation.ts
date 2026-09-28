import { useMutation, useMutationState, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Action = "like" | "save" | "follow";
type Change = { active: boolean; count: number };

function belongsToViewer(key: QueryKey, viewer: string) {
  const viewerScopedQueries = new Set([
    "prompts", "prompt", "recommendations", "profile-prompts", "liked-prompts", "saved-prompts",
  ]);
  return viewerScopedQueries.has(String(key[0])) && key[key.length - 1] === viewer;
}

export function useSocialMutation(action: Action, viewer: string | undefined, target: string | undefined, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutationKey = ["social", action, viewer, target];
  const matches = (key: QueryKey) => action === "follow"
    ? key[0] === "follower-count" && key[1] === target && key[2] === viewer
    : !!viewer && belongsToViewer(key, viewer);

  const mutation = useMutation({
    mutationKey,
    mutationFn: async (_change: Change) => {
      if (!viewer || !target) throw new Error("Sign in required");
      const setActive = action === "like" ? (await import("@/services/supabase/likes")).setLike
        : action === "save" ? (await import("@/services/supabase/saves")).setSave
          : (await import("@/services/supabase/follows")).setFollow;
      const { error } = await setActive(viewer, target, _change.active);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ predicate: query => matches(query.queryKey) });
    },
    onSuccess: (data, change) => {
      // Commit only this relationship's fields. A simultaneous save must not
      // overwrite a like (or an unrelated prompt) with an old whole-list snapshot.
      for (const query of queryClient.getQueryCache().findAll({ predicate: query => matches(query.queryKey) })) {
        queryClient.setQueryData(query.queryKey, (old: unknown) => {
          if (old === undefined) return undefined;
          if (action === "follow") return { count: change.count, following: change.active };
          const update = (value: unknown) => {
            if (!value || typeof value !== "object" || !("id" in value) || value.id !== target) return value;
            const row = value as Record<string, unknown>;
            if (action === "save") return { ...row, isSaved: change.active };
            const delta = row.isLiked === change.active ? 0 : change.active ? 1 : -1;
            return { ...row, isLiked: change.active, likeCount: Math.max(0, Number(row.likeCount ?? 0) + delta) };
          };
          if (!Array.isArray(old)) return update(old);
          const rows = old.map(update);
          const membershipList = action === "like" ? "liked-prompts" : "saved-prompts";
          return !change.active && query.queryKey[0] === membershipList
            ? rows.filter(row => !row || typeof row !== "object" || !("id" in row) || row.id !== target) : rows;
        });
      }
      if (action === "save" && change.active) toast({ title: "Saved to collection" });
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Update failed", description: "Your change could not be saved. Please try again.", variant: "destructive" });
    },
    onSettled: async (_data, error) => {
      await queryClient.invalidateQueries({ predicate: query => matches(query.queryKey) });
      if (!error && action === "follow") {
        await queryClient.invalidateQueries({ queryKey: ["top-creators"] });
      }
    },
  });

  // Pending values are shared across mounted cards/detail views. Server values
  // remain in the cache, so a failed mutation removes the overlay without a
  // snapshot rollback that could erase another successful mutation.
  const pending = useMutationState({
    filters: { mutationKey, exact: true, status: "pending" },
    select: entry => entry.state.variables as Change,
  }).slice(-1)[0];

  const toggle = (active: boolean, count = 0) => {
    if (!viewer || !target || queryClient.isMutating({ mutationKey, exact: true })) return;
    mutation.mutate({ active: !active, count: Math.max(0, count + (active ? -1 : 1)) });
  };
  return { pending, isPending: !!pending, toggle };
}
