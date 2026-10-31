/**
 * delete-prompt-image: removes a prompt's image from storage once the prompt
 * itself has been deleted, however it was deleted.
 *
 * Why it exists: the apps delete the file themselves when someone deletes
 * their own prompt, but a prompt removed by hand, in the Table editor or the
 * SQL editor, used to leave its image behind, still public at its address.
 * Taking down a bad post meant two steps, and forgetting the second left the
 * picture online. With this, deleting the row is the whole job:
 *
 *   delete from public.prompts where id = '<prompt id>';
 *
 * How it is called: by one trigger on public.prompts. It is not in a
 * migration, because it carries the shared secret; create it once in the SQL
 * editor, with the project's own address and secret filled in:
 *
 *   create trigger delete_prompt_image
 *     after delete on public.prompts
 *     for each row execute function supabase_functions.http_request(
 *       'https://<project ref>.supabase.co/functions/v1/delete-prompt-image', 'POST',
 *       '{"Content-type":"application/json","x-webhook-secret":"<secret>"}',
 *       '{}', '5000');
 *
 * The trigger sends
 *
 *   { "type": "DELETE", "table": "prompts", "record": null,
 *     "old_record": { "id": ..., "user_id": ..., "image_url": ... } }
 *
 * Who may call it: only that trigger. JWT verification is off (see
 * supabase/config.toml) and the x-webhook-secret header must equal
 * REPORT_WEBHOOK_SECRET, the same secret the other functions use.
 *
 * It only ever deletes a file that nothing points at any more. Before
 * removing anything it checks, against the database and not the payload,
 * that the prompt really is gone and that no other prompt uses the same
 * image, and the file must sit in the deleted prompt's owner's folder. So
 * even a caller holding the secret cannot use it to take down a live image.
 *
 * Deleting a file that is already gone is not an error. That happens every
 * time: the apps, moderate-prompt and delete-account all remove the file
 * themselves too, and this then finds nothing left to do.
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the runtime.
 *
 * Deploy: npx supabase functions deploy delete-prompt-image
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "prompt-images";

type Row = { id?: string; user_id?: string; image_url?: string };

function reply(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Compares in constant time, so the secret cannot be guessed a character at a time. */
function sameSecret(given: string, expected: string) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const secret = Deno.env.get("REPORT_WEBHOOK_SECRET");
  if (!secret) {
    console.error("delete-prompt-image is missing REPORT_WEBHOOK_SECRET");
    return reply(500, { error: "Not configured" });
  }

  if (!sameSecret(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return reply(401, { error: "Not allowed" });
  }

  let payload: { type?: string; table?: string; old_record?: Row | null };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }

  const deleted = payload.old_record;
  if (
    payload.type !== "DELETE" ||
    payload.table !== "prompts" ||
    typeof deleted?.id !== "string" ||
    typeof deleted.user_id !== "string" ||
    typeof deleted.image_url !== "string"
  ) {
    return reply(400, { error: "Expected a deleted row from prompts" });
  }

  // Seed data and anything saved before links were restricted to our storage
  // has an image elsewhere, with no file of ours to delete.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const ownPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  if (!deleted.image_url.startsWith(ownPrefix)) return reply(200, { ok: "not ours" });

  // Prompt images live directly in the owner's folder: <user id>/<file>.
  const path = deleted.image_url.slice(ownPrefix.length).split("?")[0];
  const [folder, file, ...deeper] = path.split("/");
  if (folder !== deleted.user_id || !file || deeper.length > 0) {
    return reply(400, { error: "The image is not in its owner's folder" });
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The prompt itself, then any other prompt showing the same file.
  const lookups = await Promise.all([
    admin.from("prompts").select("id").eq("id", deleted.id).limit(1),
    admin.from("prompts").select("id").eq("image_url", deleted.image_url).limit(1),
  ]);
  for (const { data, error } of lookups) {
    if (error) {
      console.error(`Could not check whether prompt ${deleted.id} is gone`, error);
      return reply(500, { error: "Could not check the prompt" });
    }
    if (data.length > 0) return reply(200, { ok: "still in use" });
  }

  const { error: fileError } = await admin.storage.from(BUCKET).remove([path]);
  if (fileError) {
    console.error(`Prompt ${deleted.id} is gone but its file ${path} is not`, fileError);
    return reply(500, { error: "Could not delete the file" });
  }

  return reply(200, { ok: "deleted" });
});
