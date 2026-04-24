import { handleOptions, setCors } from "../lib/http.js";
import { supabase }               from "../lib/supabase.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const checks = {};

  // ── Database ─────────────────────────────────────────────────────
  // A lightweight SELECT against the cafeterias table is enough to confirm
  // the service-role connection and that the schema is reachable.
  try {
    const t0 = Date.now();
    const { error } = await supabase.from("cafeterias").select("id").limit(1);
    checks.database = error
      ? { ok: false, error: error.message }
      : { ok: true,  latencyMs: Date.now() - t0 };
  } catch (e) {
    checks.database = { ok: false, error: e.message };
  }

  // ── Email service ────────────────────────────────────────────────
  // We verify that the required env vars are present. Making a live API call
  // on every health check would waste quota and add latency unnecessarily.
  const resendKey  = process.env.RESEND_API_KEY;
  const fromEmail  = process.env.RESEND_FROM_EMAIL;
  checks.email = {
    ok:         Boolean(resendKey),
    configured: Boolean(resendKey),
    from:       fromEmail || null
  };

  const allOk = Object.values(checks).every(function (c) { return c.ok; });

  return res.status(allOk ? 200 : 503).json({
    ok:        allOk,
    checks,
    timestamp: new Date().toISOString()
  });
}
