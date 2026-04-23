import { supabase } from "../lib/supabase.js";
import { handleOptions, setCors } from "../lib/http.js";
import { requireAuth } from "../lib/auth.js";
import { getDayKey } from "../lib/dashboard.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const { cafeteriaId } = await requireAuth(req, ["ADMIN"]);
    const dayKey = getDayKey();

    // Day-of-week in Costa Rica time (UTC-6). Used to match the
    // correct forecast row without a second database round-trip.
    const crNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const todayDow = crNow.getUTCDay(); // 0 = Sunday … 6 = Saturday

    const [prepResult, forecastResult, heatmapResult, weeklyResult] = await Promise.all([
      supabase
        .from("v_daily_prep_list")
        .select("*")
        .eq("cafeteria_id", cafeteriaId)
        .eq("day_key", dayKey),

      supabase
        .from("v_demand_forecast")
        .select("*")
        .eq("cafeteria_id", cafeteriaId),

      supabase
        .from("v_peak_hour_heatmap")
        .select("*")
        .eq("cafeteria_id", cafeteriaId)
        .order("hour_of_day", { ascending: true }),

      supabase
        .from("v_weekly_summary")
        .select("*")
        .eq("cafeteria_id", cafeteriaId)
        .order("week_start", { ascending: false })
        .limit(8)
    ]);

    const prep         = prepResult.data    || [];
    const forecast     = forecastResult.data || [];
    const heatmap      = heatmapResult.data  || [];
    const weekly       = weeklyResult.data   || [];

    const todayForecast = forecast.find((f) => Number(f.day_of_week) === todayDow) || null;

    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      prep,
      forecast,
      todayForecast,
      heatmap,
      weekly
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    return res.status(500).json({
      ok: false,
      message: error.message || "No fue posible cargar los análisis."
    });
  }
}
