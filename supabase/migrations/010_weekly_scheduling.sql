-- ============================================================
-- Migration 010: Weekly Menu Scheduling & Advanced Ordering
--
-- Changes:
--   1. settings.cutoff_time  — single daily deadline for same-day orders.
--   2. orders.target_date    — the date the lunch is ordered FOR
--                             (separate from created_at / day_key).
--   3. create_order_atomic   — updated to count capacity by target_date,
--                             accepts the new p_target_date parameter.
--   4. get_day_stats         — updated to filter by target_date instead
--                             of day_key so future pre-orders are counted
--                             correctly toward per-day capacity.
--   5. Index on (cafeteria_id, target_date) for kitchen view queries.
-- ============================================================


-- ── 1. settings: add cutoff_time ─────────────────────────────
-- Orders for today are blocked once the current CR time passes this value.
-- Default 09:00 gives the kitchen one hour before a typical 10:00 prep start.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS cutoff_time TIME NOT NULL DEFAULT '09:00';


-- ── 2. orders: add target_date ───────────────────────────────
-- Nullable first so existing rows can be backfilled.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS target_date DATE;

-- Backfill: for all pre-existing orders target_date == day_key (same-day ordering).
UPDATE orders
  SET target_date = day_key
  WHERE target_date IS NULL;

-- Now enforce NOT NULL and set a sensible default for future inserts.
ALTER TABLE orders ALTER COLUMN target_date SET NOT NULL;
ALTER TABLE orders ALTER COLUMN target_date SET DEFAULT CURRENT_DATE;


-- ── 3. Index: orders by target_date ─────────────────────────
-- Kitchen filter ("show tomorrow's prep") and capacity count both use this.

CREATE INDEX IF NOT EXISTS idx_orders_cafeteria_target_date
  ON orders (cafeteria_id, target_date)
  WHERE record_status = 'ACTIVO';


-- ── 4. create_order_atomic (updated) ────────────────────────
-- Now accepts p_target_date and counts capacity per target_date, not day_key.
-- The old signature (without p_target_date) is replaced; existing callers
-- that omit the new parameter get COALESCE(NULL, p_day_key) = p_day_key,
-- so backward-compat is maintained at the SQL level.

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_cafeteria_id      UUID,
  p_day_key           DATE,
  p_buyer_name        TEXT,
  p_buyer_email       TEXT,
  p_menu_id           UUID,
  p_menu_title        TEXT,
  p_menu_description  TEXT,
  p_menu_price        NUMERIC,
  p_payment_method    TEXT,
  p_tracking_token    UUID,
  p_target_date       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_meals   INTEGER;
  v_sold        BIGINT;
  v_order_id    UUID;
  v_target_date DATE;
BEGIN
  -- Use explicit target_date when provided, otherwise fall back to the
  -- creation date (today).  This keeps the function backward-compatible.
  v_target_date := COALESCE(p_target_date, p_day_key);

  -- Serialize concurrent requests: lock this cafeteria's settings row
  -- so the capacity check + INSERT happen atomically.
  SELECT max_meals INTO v_max_meals
  FROM settings
  WHERE cafeteria_id = p_cafeteria_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CAFETERIA_NOT_CONFIGURED');
  END IF;

  -- Capacity is enforced per target_date: each day has its own limit.
  SELECT COUNT(*) INTO v_sold
  FROM orders
  WHERE cafeteria_id = p_cafeteria_id
    AND target_date   = v_target_date
    AND record_status = 'ACTIVO';

  IF v_sold >= v_max_meals THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CAPACITY_EXCEEDED');
  END IF;

  INSERT INTO orders (
    cafeteria_id, day_key, target_date,
    buyer_name, buyer_email, buyer_id, buyer_phone,
    menu_id, menu_title, menu_description, menu_price,
    payment_method, payment_status, order_status,
    delivery_status, record_status, tracking_token
  ) VALUES (
    p_cafeteria_id, p_day_key, v_target_date,
    p_buyer_name, p_buyer_email, '', '',
    p_menu_id, p_menu_title, p_menu_description, p_menu_price,
    p_payment_method::payment_method_enum,
    'PENDIENTE_DE_PAGO', 'SOLICITADO',
    'PENDIENTE_ENTREGA', 'ACTIVO',
    p_tracking_token
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id);
END;
$$;


-- ── 5. get_day_stats (updated) ───────────────────────────────
-- Filters by target_date so pre-orders placed on previous days are
-- correctly aggregated into the day they are scheduled for.

CREATE OR REPLACE FUNCTION get_day_stats(
  p_cafeteria_id UUID,
  p_day_key      DATE
)
RETURNS TABLE (
  total_orders          BIGINT,
  paid_orders           BIGINT,
  pending_payment       BIGINT,
  delivered_orders      BIGINT,
  pending_deliveries    BIGINT,
  paid_pending_delivery BIGINT,
  sinpe_count           BIGINT,
  cash_count            BIGINT,
  total_amount          NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*)
      AS total_orders,
    COUNT(*) FILTER (WHERE payment_status IN ('PAGADO', 'CONFIRMADO', 'CONFIRMADO_SINPE'))
      AS paid_orders,
    COUNT(*) FILTER (WHERE payment_status NOT IN ('PAGADO', 'CONFIRMADO', 'CONFIRMADO_SINPE'))
      AS pending_payment,
    COUNT(*) FILTER (WHERE delivery_status = 'ENTREGADO')
      AS delivered_orders,
    COUNT(*) FILTER (WHERE delivery_status != 'ENTREGADO')
      AS pending_deliveries,
    COUNT(*) FILTER (
      WHERE payment_status IN ('PAGADO', 'CONFIRMADO', 'CONFIRMADO_SINPE')
        AND delivery_status != 'ENTREGADO'
    )
      AS paid_pending_delivery,
    COUNT(*) FILTER (WHERE payment_method = 'SINPE')
      AS sinpe_count,
    COUNT(*) FILTER (WHERE payment_method = 'EFECTIVO')
      AS cash_count,
    COALESCE(SUM(menu_price), 0)
      AS total_amount
  FROM orders
  WHERE cafeteria_id = p_cafeteria_id
    AND target_date   = p_day_key    -- was: day_key = p_day_key
    AND record_status = 'ACTIVO';
$$;
