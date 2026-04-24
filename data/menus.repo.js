import { supabase } from "../lib/supabase.js";

// Returns the active menu for a specific day, or null if none exists.
export async function findActive(cafeteriaId, dayKey) {
  const { data, error } = await supabase
    .from("menus")
    .select("id, title, description, price")
    .eq("cafeteria_id", cafeteriaId)
    .eq("day_key", dayKey)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Creates or replaces the menu for a specific day.
// Uses the unique (cafeteria_id, day_key) constraint for idempotent upserts.
export async function upsert(cafeteriaId, dayKey, { title, description, price }) {
  const { data, error } = await supabase
    .from("menus")
    .upsert(
      {
        cafeteria_id: cafeteriaId,
        day_key:      dayKey,
        title:        String(title).trim(),
        description:  String(description).trim(),
        price:        Number(price),
        active:       true
      },
      { onConflict: "cafeteria_id,day_key" }
    )
    .select("id, title, description, price")
    .single();

  if (error) throw error;
  return data;
}

// Returns all active menus for a cafeteria between fromDate and toDate (inclusive).
// Used to build the weekly planning grid for both management and customer views.
export async function findWeek(cafeteriaId, fromDate, toDate) {
  const { data, error } = await supabase
    .from("menus")
    .select("id, day_key, title, description, price")
    .eq("cafeteria_id", cafeteriaId)
    .eq("active", true)
    .gte("day_key", fromDate)
    .lte("day_key", toDate)
    .order("day_key", { ascending: true });

  if (error) throw error;
  return data || [];
}
