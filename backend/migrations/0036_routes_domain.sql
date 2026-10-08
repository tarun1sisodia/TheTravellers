-- 0036: Routes content domain (Slice 2)
--
-- Canonical publishable route entity per the architecture doc.
-- Admin creates records; reusable templates render published records.
-- Content rollback = unpublish/archive (no deploy, no data loss).

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  origin_city TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  corridor TEXT NOT NULL,                    -- normalized 'agra-delhi' city pair
  trip_type TEXT NOT NULL DEFAULT 'one-way' CHECK (trip_type IN ('one-way', 'round-trip')),
  distance_km INT CHECK (distance_km > 0),
  duration_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_order INT,
  published_at TIMESTAMPTZ,
  new_until TIMESTAMPTZ,                     -- NULL = published_at + 30 days
  meta_title TEXT,
  meta_description TEXT,
  hero_image_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corridor, trip_type)
);

CREATE INDEX IF NOT EXISTS idx_routes_status ON routes (status);
CREATE INDEX IF NOT EXISTS idx_routes_featured ON routes (is_featured, featured_order) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_routes_corridor ON routes (corridor);

-- Fixed per-fleet fares for a route. NULL fare = fall back to the per-km engine.
CREATE TABLE IF NOT EXISTS route_fleet_fares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  fleet_code TEXT NOT NULL REFERENCES fleets(code) ON DELETE RESTRICT,
  one_way_fare_inr NUMERIC(10,2) CHECK (one_way_fare_inr IS NULL OR one_way_fare_inr > 0),
  round_trip_fare_inr NUMERIC(10,2) CHECK (round_trip_fare_inr IS NULL OR round_trip_fare_inr > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, fleet_code)
);

-- Extra charges attached to a route (toll, interstate/border, driver, night halt)
CREATE TABLE IF NOT EXISTS route_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('toll', 'interstate', 'driver', 'night_halt', 'other')),
  amount_inr NUMERIC(10,2) NOT NULL CHECK (amount_inr >= 0),
  applies_to TEXT NOT NULL DEFAULT 'all',   -- 'all' or a fleet code
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persistent old-slug → new-slug 301 redirects (added BEFORE any slug changes)
CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('route', 'package', 'tour', 'monument')),
  new_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: Agra → Delhi one-way (draft — admin publishes when ready)
DO $$
DECLARE
  r_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM routes WHERE slug = 'agra-to-delhi-one-way') THEN
    INSERT INTO routes (slug, origin_city, destination_city, corridor, trip_type,
                        distance_km, duration_text, status,
                        meta_title, meta_description)
    VALUES ('agra-to-delhi-one-way', 'Agra', 'Delhi', 'agra-delhi', 'one-way',
            230, '4–5 hrs (230 km)', 'draft',
            'Agra to Delhi One-Way Taxi | Sedan ₹3,499 onwards',
            'Book a one-way taxi from Agra to Delhi. Transparent per-km fares, verified drivers, no hidden charges.')
    RETURNING id INTO r_id;

    INSERT INTO route_fleet_fares (route_id, fleet_code, one_way_fare_inr) VALUES
      (r_id, 'sedan', 3499),
      (r_id, 'ertiga', 4299),
      (r_id, 'innova-crysta', 5499),
      (r_id, 'tempo-traveller', 7499),
      (r_id, 'urbania', 9499)
    ON CONFLICT (route_id, fleet_code) DO NOTHING;

    INSERT INTO route_charges (route_id, kind, amount_inr, note) VALUES
      (r_id, 'toll', 0, 'Toll included in fare via Yamuna Expressway'),
      (r_id, 'driver', 300, 'Driver allowance included');
  END IF;
END $$;
