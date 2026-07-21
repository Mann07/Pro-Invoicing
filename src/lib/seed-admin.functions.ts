import { createServerFn } from "@tanstack/react-start";

/**
 * One-shot: seeds the single admin account. Invoke once via the harness,
 * then delete this file. Uses process.env.ADMIN_INITIAL_PASSWORD.
 */
export const seedAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) throw new Error("ADMIN_INITIAL_PASSWORD not set");
  const email = "dattauto0510@gmail.com";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Remove any pre-existing users so we start clean (single-admin app).
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw new Error(listErr.message);
  for (const u of list.users) {
    await supabaseAdmin.auth.admin.deleteUser(u.id);
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Admin" },
  });
  if (createErr) throw new Error(createErr.message);
  const uid = created.user.id;

  await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: "Admin" });
  await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: "admin" });

  return { ok: true, email, user_id: uid };
});
