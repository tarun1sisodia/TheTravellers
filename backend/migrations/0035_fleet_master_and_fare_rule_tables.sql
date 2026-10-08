-- 0035: Fleet master + normalized fare rule tables (Slice 1)
--
-- fare_rules (existing) acts as fare_rule_versions (doc §15).
-- This migration adds:
--   1. fleets — canonical sellable fleet categories (doc §7). No pricing here.
--   2. fare_rules commercial columns — version-level knobs (night window,
--      outstation minimums). NULL = fall back to config JSONB, then engine defaults.
--   3. fleet_fare_rules — per-fleet rates per version (doc §15).
-- Canon values: night window 20:00–06:00 (client dossier), 300 km/day multi-day
-- minimum, 1.85x same-day round-trip multiplier, per-km rates 10/14/18/25/34.

-- ---------------------------------------------------------------------------
-- 1. Fleet master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleets (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seats INT NOT NULL CHECK (seats > 0),
  luggage_capacity INT NOT NULL DEFAULT 0 CHECK (luggage_capacity >= 0),
  image_url TEXT,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO fleets (code, name, seats, luggage_capacity, sort_order, is_active) VALUES
  ('sedan',           'Sedan',           4,  2, 1, TRUE),
  ('ertiga',          'Ertiga',          6,  3, 2, TRUE),
  ('innova-crysta',   'Innova Crysta',   6,  4, 3, TRUE),
  ('tempo-traveller', 'Tempo Traveller', 12, 8, 4, TRUE),
  ('urbania',         'Force Urbania',   16, 10, 5, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Version-level commercial knobs on fare_rules
-- ---------------------------------------------------------------------------
ALTER TABLE fare_rules
  ADD COLUMN IF NOT EXISTS night_start_hour INT CHECK (night_start_hour >= 0 AND night_start_hour < 24),
  ADD COLUMN IF NOT EXISTS night_end_hour INT CHECK (night_end_hour >= 0 AND night_end_hour < 24),
  ADD COLUMN IF NOT EXISTS min_km_per_day INT CHECK (min_km_per_day > 0),
  ADD COLUMN IF NOT EXISTS same_day_round_multiplier NUMERIC(5,2) CHECK (same_day_round_multiplier > 0);

-- ---------------------------------------------------------------------------
-- 3. Per-fleet fare rules per version
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_fare_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fare_rule_id UUID NOT NULL REFERENCES fare_rules(id) ON DELETE CASCADE,
  fleet_code TEXT NOT NULL REFERENCES fleets(code) ON DELETE RESTRICT,
  per_km NUMERIC(8,2) NOT NULL CHECK (per_km > 0),
  driver_allowance NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (driver_allowance >= 0),
  night_allowance NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (night_allowance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fare_rule_id, fleet_code)
);

CREATE INDEX IF NOT EXISTS idx_fleet_fare_rules_rule ON fleet_fare_rules (fare_rule_id);

-- ---------------------------------------------------------------------------
-- 4. Bootstrap: version v1 (active) with dossier-canon values, if no version exists
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fare_rules) THEN
    INSERT INTO fare_rules (version, config, effective_from, is_active,
                            night_start_hour, night_end_hour,
                            min_km_per_day, same_day_round_multiplier)
    VALUES ('v1', '{}'::jsonb, NOW(), TRUE, 20, 6, 300, 1.85)
    RETURNING id INTO v_id;

    INSERT INTO fleet_fare_rules (fare_rule_id, fleet_code, per_km, driver_allowance, night_allowance) VALUES
      (v_id, 'sedan',           10, 300, 300),
      (v_id, 'ertiga',          14, 300, 300),
      (v_id, 'innova-crysta',   18, 300, 300),
      (v_id, 'tempo-traveller', 25, 500, 500),
      (v_id, 'urbania',         34, 500, 500)
    ON CONFLICT (fare_rule_id, fleet_code) DO NOTHING;
  END IF;
END $$;
