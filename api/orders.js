import { randomUUID }                                           from "crypto";
import { handleOptions, setCors }                               from "../lib/http.js";
import { getDayKey, isCutoffPassedForDate, buildDashboardSnapshot } from "../lib/dashboard.js";
import { findBySlug }                                           from "../data/cafeterias.repo.js";
import { findActive as findActiveMenu }                         from "../data/menus.repo.js";
import { createAtomic, findToday, getStats }                    from "../data/orders.repo.js";
import { getSettings }                                         from "../data/settings.repo.js";
import { sendOrderStatusEmail }                                 from "../lib/email.js";

function validateOrder(order) {
  if (!order.buyerName || !order.paymentMethod) {
    throw new Error("Faltan datos obligatorios.");
  }
  if (!["SINPE", "EFECTIVO"].includes(String(order.paymentMethod).toUpperCase())) {
    throw new Error("Método de pago inválido.");
  }
}

function validateTargetDate(targetDate, todayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("Fecha de pedido inválida.");
  }
  if (targetDate < todayKey) {
    throw new Error("No se pueden registrar pedidos para fechas pasadas.");
  }
  // Cap at 7 days ahead to prevent arbitrarily far future bookings.
  const maxDate = new Date(Date.now() - 6 * 60 * 60 * 1000 + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (targetDate > maxDate) {
    throw new Error("Solo se pueden registrar pedidos con hasta 7 días de anticipación.");
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  // Multi-tenant: slug comes from query string or request body.
  const slug = String(req.query?.slug || req.body?.slug || "").toLowerCase().trim();
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Parámetro 'slug' requerido." });
  }

  try {
    const cafeteria = await findBySlug(slug);
    if (!cafeteria) {
      return res.status(404).json({ ok: false, message: "Cafetería no encontrada." });
    }

    const { id: cafeteriaId } = cafeteria;
    const dayKey = getDayKey();
    const order  = req.body?.order || {};
    validateOrder(order);

    // targetDate: the day the lunch is ordered FOR.
    // Defaults to today when omitted (backward-compat with old clients).
    const targetDate = String(order.targetDate || dayKey).trim();
    validateTargetDate(targetDate, dayKey);

    const [settings, menu] = await Promise.all([
      getSettings(cafeteriaId),
      findActiveMenu(cafeteriaId, targetDate)
    ]);

    if (!menu) {
      return res.status(400).json({
        ok: false,
        message: "No hay menú disponible para la fecha seleccionada."
      });
    }

    // ── Dynamic cutoff enforcement (server-side) ──────────────────────
    // - Today: blocked once current CR time >= cutoff_time.
    // - Future date: always open; only capacity check applies.
    // This runs on the server so it cannot be bypassed by UI manipulation.
    if (isCutoffPassedForDate(settings, targetDate)) {
      const cutoff = String(settings.cutoff_time || "09:00").slice(0, 5);
      const msg = targetDate === dayKey
        ? `La ventana de pedidos para hoy ya cerró. El límite es a las ${cutoff}.`
        : "No se pueden aceptar pedidos para fechas pasadas.";
      return res.status(400).json({ ok: false, message: msg });
    }

    const trackingToken = randomUUID();
    const buyerEmail    = String(order.buyerEmail || "").trim().toLowerCase();

    // Atomic insert — capacity check and INSERT happen in one PostgreSQL
    // transaction.  Capacity is now counted per target_date.
    const result = await createAtomic({
      cafeteriaId,
      dayKey,
      targetDate,
      buyerName:       String(order.buyerName || "").trim(),
      buyerEmail,
      menuId:          menu.id,
      menuTitle:       menu.title,
      menuDescription: menu.description,
      menuPrice:       Number(menu.price),
      paymentMethod:   String(order.paymentMethod).toUpperCase(),
      trackingToken
    });

    if (!result?.ok) {
      const msg = result?.error === "CAPACITY_EXCEEDED"
        ? "Ya no hay almuerzos disponibles para esa fecha."
        : "No se pudo registrar la compra.";
      return res.status(400).json({ ok: false, message: msg });
    }

    const appBaseUrl  = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    const trackingUrl = appBaseUrl ? `${appBaseUrl}/track.html?token=${trackingToken}` : "";

    if (buyerEmail) {
      sendOrderStatusEmail({
        to:          buyerEmail,
        buyerName:   String(order.buyerName || "").trim(),
        orderId:     result.order_id,
        status:      "SOLICITADO",
        trackingUrl
      }).catch(() => null);
    }

    const [freshOrders, freshStats] = await Promise.all([
      findToday(cafeteriaId, targetDate),
      getStats(cafeteriaId, targetDate)
    ]);

    return res.status(200).json({
      ok:           true,
      message:      "Compra registrada correctamente.",
      trackingToken,
      targetDate,
      snapshot:     buildDashboardSnapshot(settings, menu, freshOrders, freshStats)
    });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message || "No se pudo registrar la compra." });
  }
}
