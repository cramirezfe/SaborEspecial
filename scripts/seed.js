#!/usr/bin/env node
// Seed a test cafeteria for local development.
// Uses the service role key to bypass RLS — never run in production.

import "./env.js";

// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   CAFETERIA_SLUG  (default: test-cafeteria)
//   CAFETERIA_NAME  (default: Cafetería de Prueba)

import { createClient } from "@supabase/supabase-js";


const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CAFETERIA_SLUG = "test-cafeteria",
  CAFETERIA_NAME = "Cafetería de Prueba",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date) {
  return date.toISOString().split("T")[0];
}

async function seed() {
  // Idempotent: skip if cafeteria already exists.
  const { data: existing } = await supabase
    .from("cafeterias")
    .select("id, slug")
    .eq("slug", CAFETERIA_SLUG)
    .maybeSingle();

  if (existing) {
    console.log(`Cafetería ya existe — omitiendo.`);
    console.log(`SLUG:${existing.slug}`);
    console.log(`ID:${existing.id}`);
    return;
  }

  // 1. Create cafeteria row.
  const { data: cafeteria, error: cafError } = await supabase
    .from("cafeterias")
    .insert({ name: CAFETERIA_NAME, slug: CAFETERIA_SLUG, timezone: "America/Costa_Rica" })
    .select("id")
    .single();

  if (cafError) throw new Error(`cafeterias insert: ${cafError.message}`);
  const cafeteriaId = cafeteria.id;

  // 2. Settings row with sane defaults.
  const { error: settingsError } = await supabase.from("settings").insert({
    cafeteria_id: cafeteriaId,
    max_meals: 15,
    cutoff_time: "09:00",
    message: "Bienvenido a SaborEspecial. Configure su menú desde el panel de administración.",
  });

  if (settingsError && settingsError.code !== "23505") {
    throw new Error(`settings insert: ${settingsError.message}`);
  }

  // 3. Placeholder menus for Mon–Fri of this week + next week.
  const monday = getMonday(new Date());
  const menus = [];

  for (let week = 0; week < 2; week++) {
    for (let day = 0; day < 5; day++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + week * 7 + day);
      menus.push({
        cafeteria_id: cafeteriaId,
        day_key: toDateKey(d),
        title: "Menú del día",
        description: "Configure este menú desde el panel de administración.",
        price: 2500.0,
      });
    }
  }

  const { error: menuError } = await supabase
    .from("menus")
    .insert(menus)
    .select();

  if (menuError && menuError.code !== "23505") {
    throw new Error(`menus insert: ${menuError.message}`);
  }

  console.log(`Cafetería creada exitosamente.`);
  console.log(`SLUG:${CAFETERIA_SLUG}`);
  console.log(`ID:${cafeteriaId}`);
}

seed().catch((err) => {
  console.error("Error de seeding:", err.message);
  process.exit(1);
});
