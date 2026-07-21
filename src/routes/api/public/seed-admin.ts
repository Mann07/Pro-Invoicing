import { createFileRoute } from "@tanstack/react-router";

// Temporary one-shot endpoint to seed the single admin account.
// Only runs if NO admin exists yet — safe to leave callable, but delete after use.
export const Route = createFileRoute("/api/public/seed-admin")({
  server: {
    handlers: {
      POST: async () => {
        const password = process.env.ADMIN_INITIAL_PASSWORD;
        if (!password) return new Response("ADMIN_INITIAL_PASSWORD not set", { status: 500 });

        const email = "dattauto0510@gmail.com";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Refuse if any admin already exists (idempotent guard).
        const { data: existingAdmins } = await supabaseAdmin
          .from("user_roles").select("user_id").eq("role", "admin").limit(1);
        if (existingAdmins && existingAdmins.length > 0) {
          return new Response("Admin already exists", { status: 409 });
        }

        // Remove any pre-existing (non-admin) users so we start clean.

        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
        if (listErr) return new Response(listErr.message, { status: 500 });
        for (const u of list.users) {
          await supabaseAdmin.auth.admin.deleteUser(u.id);
        }

        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Admin" },
        });
        if (createErr) return new Response(createErr.message, { status: 500 });
        const uid = created.user.id;

        await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: "Admin" });
        await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: "admin" });

        return Response.json({ ok: true, email, user_id: uid });
      },
    },
  },
});
