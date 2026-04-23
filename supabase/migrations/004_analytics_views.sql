-- ============================================================
-- SaborEspecial: Analytics Views
-- Creates four read-only views for the Admin Insights tab.
-- Each view exposes cafeteria_id so the API layer can apply
-- per-tenant filtering before returning data to the browser.
--
-- Performance notes:
--   - v_daily_prep_list   → uses idx_orders_cafeteria_day
--   - v_demand_forecast   → uses idx_orders_cafeteria_day (range)
--   - v_peak_hour_heatmap → uses idx_orders_cafeteria_day (range)
--   - v_weekly_summary    → uses idx_orders_cafeteria_day (range)
--
-- All views are simple (non-materialized) so the query planner
-- can push the cafeteria_id predicate into the base scan.
-- ============================================================


-- ----------------------------------------------------------------
-- VIEW 1: v_daily_prep_list
-- Answers: "How many portions of each menu item do I need to
-- prepare right now?"  Groups today's active orders by menu_title
-- (denormalized snapshot) and breaks them down by payment state
-- and payment method so the cook knows exactly what to make.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_daily_prep_list AS
SELECT
  cafeteria_id,
  day_key,
  menu_title,
  COUNT(*)                                                                AS total_portions,
  COUNT(*) FILTER (
    WHERE payment_status IN ('PAGADO', 'CONFIRMADO', 'CONFIRMADO_SINPE')
  )                                                                       AS confirmed_portions,
  COUNT(*) FILTER (
    WHERE payment_status NOT IN ('PAGADO', 'CONFIRMADO', 'CONFIRMADO_SINPE')
  )                                                                       AS pending_portions,
  COUNT(*) FILTER (WHERE payment_method = 'SINPE')                       AS sinpe_count,
  COUNT(*) FILTER (WHERE payment_method = 'EFECTIVO')                    AS cash_count
FROM orders
WHERE record_status = 'ACTIVO'
GROUP BY cafeteria_id, day_key, menu_title;


-- ----------------------------------------------------------------
-- VIEW 2: v_demand_forecast
-- Answers: "Based on history, how many meals should I authorize
-- for this day of the week?"
--
-- Aggregates completed days (day_key < CURRENT_DATE) over the last
-- 56 days, grouped by day-of-week (0 = Sunday … 6 = Saturday).
-- Excludes today so partial data does not skew the average.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_demand_forecast AS
SELECT
  cafeteria_id,
  EXTRACT(DOW FROM day_key)::SMALLINT  AS day_of_week,
  ROUND(AVG(daily_count), 1)           AS avg_orders,
  MAX(daily_count)                      AS max_orders,
  MIN(daily_count)                      AS min_orders,
  COUNT(DISTINCT day_key)               AS sample_days
FROM (
  SELECT
    cafeteria_id,
    day_key,
    COUNT(*) AS daily_count
  FROM orders
  WHERE record_status = 'ACTIVO'
    AND day_key >= CURRENT_DATE - INTERVAL '56 days'
    AND day_key  < CURRENT_DATE
  GROUP BY cafeteria_id, day_key
) daily_totals
GROUP BY cafeteria_id, EXTRACT(DOW FROM day_key)::SMALLINT;


-- ----------------------------------------------------------------
-- VIEW 3: v_peak_hour_heatmap
-- Answers: "When do orders typically arrive so I can plan deep
-- prep work vs. active order-taking windows?"
--
-- Groups active orders from the last 28 days by hour-of-day in
-- Costa Rica local time. avg_per_day smooths out day count
-- differences so hours are fairly comparable.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_peak_hour_heatmap AS
SELECT
  cafeteria_id,
  EXTRACT(
    HOUR FROM (created_at AT TIME ZONE 'America/Costa_Rica')
  )::SMALLINT                                                             AS hour_of_day,
  COUNT(*)                                                                AS order_count,
  COUNT(DISTINCT day_key)                                                 AS distinct_days,
  ROUND(
    COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT day_key), 0),
    2
  )                                                                       AS avg_per_day
FROM orders
WHERE record_status = 'ACTIVO'
  AND day_key >= CURRENT_DATE - INTERVAL '28 days'
GROUP BY
  cafeteria_id,
  EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Costa_Rica'))::SMALLINT;


-- ----------------------------------------------------------------
-- VIEW 4: v_weekly_summary
-- Answers: "What were my revenues, payment method split, and
-- cancellation rate for each of the past eight weeks?"
--
-- Week buckets use date_trunc('week', day_key) which starts on
-- Monday (ISO default in PostgreSQL).
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_weekly_summary AS
SELECT
  cafeteria_id,
  date_trunc('week', day_key)::DATE                                       AS week_start,
  COUNT(*) FILTER (WHERE record_status = 'ACTIVO')                       AS total_orders,
  COUNT(*) FILTER (WHERE record_status = 'CANCELADO')                    AS cancelled_orders,
  COALESCE(
    ROUND(SUM(menu_price) FILTER (WHERE record_status = 'ACTIVO'), 0),
    0
  )                                                                       AS total_revenue,
  COALESCE(
    ROUND(SUM(menu_price) FILTER (
      WHERE record_status = 'ACTIVO' AND payment_method = 'SINPE'
    ), 0),
    0
  )                                                                       AS sinpe_revenue,
  COALESCE(
    ROUND(SUM(menu_price) FILTER (
      WHERE record_status = 'ACTIVO' AND payment_method = 'EFECTIVO'
    ), 0),
    0
  )                                                                       AS cash_revenue,
  COUNT(*) FILTER (
    WHERE record_status = 'ACTIVO' AND payment_method = 'SINPE'
  )                                                                       AS sinpe_count,
  COUNT(*) FILTER (
    WHERE record_status = 'ACTIVO' AND payment_method = 'EFECTIVO'
  )                                                                       AS cash_count,
  ROUND(
    COUNT(*) FILTER (WHERE record_status = 'CANCELADO') * 100.0
    / NULLIF(COUNT(*), 0),
    1
  )                                                                       AS cancellation_rate_pct
FROM orders
WHERE day_key >= CURRENT_DATE - INTERVAL '56 days'
GROUP BY cafeteria_id, date_trunc('week', day_key)::DATE;
