import { createFileRoute } from "@tanstack/react-router";

// Temporary one-shot endpoint to seed the single admin account.
// Guarded by the ADMIN_INITIAL_PASSWORD secret (knowing it = ability to sign in).
// DELETE this file after running once.
export const Route = createFileRoute("/api/public/seed-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const password = process.env.ADMIN_INITIAL_PASSWORD;
        if (!password) return new Response("ADMIN_INITIAL_PASSWORD not set", { status: 500 });

        const provided = request.headers.get("x-admin-token") ?? "";
        if (provided !== password) return new Response("Forbidden", { status: 403 });

        const email = "dattauto0510@gmail.com";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
