/**
 * delete-account: deletes the calling user's account, everything they own in
 * the database, and every file they uploaded. Web #134.
 *
 * Why this has to be a server function: the client cannot delete an account.
 * Deleting the profiles row leaves auth.users behind, and auth.admin.deleteUser
 * needs the service role key, which must never ship in a client. Here the
 * Supabase runtime provides that key as SUPABASE_SERVICE_ROLE_KEY, so nobody
 * holds it.
 *
 * Who is deleted comes only from the caller's own access token, never from the
 * request body, so a user can only ever delete themselves.
 *
 * Order matters:
 *
 * 1. Files first. Storage does not cascade, so once the user is gone nothing
 *    would ever point at their files again, and they would sit in public
 *    buckets forever. If a file delete fails, stop before deleting the user,
 *    so a retry can finish the job.
 * 2. Then the auth user. profiles.id references auth.users on delete cascade,
 *    and every other table references profiles, so this removes every row:
 *    prompts, likes, saves, follows, ratings, reports, feedback, uploads.
 *
 * Called by the mobile app from Settings > Delete account:
 *
 *   supabase.functions.invoke('delete-account', { method: 'POST' })
 *
 * which sends the user's access token. Responds 204 when everything is gone.
 *
 * Deploy: npx supabase functions deploy delete-account
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKETS = ["avatars", "banners", "prompt-images"];
const PAGE = 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body?: Record<string, string>) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: body ? { ...cors, "Content-Type": "application/json" } : cors,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply(204);
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Not signed in" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(401, { error: "Not signed in" });

  // 1. Every file in the user's folder, in each bucket.
  for (const bucket of BUCKETS) {
    // Always read the first page: each pass removes what it listed.
    for (;;) {
      const { data: files, error: listError } = await admin.storage
        .from(bucket)
        .list(user.id, { limit: PAGE });

      if (listError) {
        console.error(`List ${bucket} failed for ${user.id}`, listError);
        return reply(500, { error: "Could not delete your files. Nothing was deleted, try again." });
      }
      if (!files || files.length === 0) break;

      const paths = files.map((file) => `${user.id}/${file.name}`);
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) {
        console.error(`Remove from ${bucket} failed for ${user.id}`, removeError);
        return reply(500, { error: "Could not delete your files. Try again." });
      }
      if (files.length < PAGE) break;
    }
  }

  // 2. The account, which cascades to every row.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error(`Delete user failed for ${user.id}`, deleteError);
    return reply(500, { error: "Your files were removed but the account was not. Try again." });
  }

  return reply(204);
});
