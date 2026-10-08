-- 0038: Local tours content domain (Slice 4)
--
-- Canonical publishable local-tour entity. Local tours keep their own
-- pricing context: fixed per-fleet base prices + extra km/hour overage rates.

CREATE TABLE IF NOT EXISTS local_tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,                   -- e.g. 'LTR-AGRA-8HR'
  title TEXT NOT NULL,
  tagline TEXT,
  city TEXT NOT NULL,                          -- base city
  duration_hours INT CHECK (duration_hours IS NULL OR duration_hours > 0),
  distance_km INT CHECK (distance_km IS NULL OR distance_km > 0),
  duration_text TEXT,
  itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,
  inclusions TEXT[] NOT NULL DEFAULT '{}',
  exclusions TEXT[] NOT NULL DEFAULT '{}',
  extra_km_rate_inr NUMERIC(8,2),              -- per km beyond included distance
  extra_hour_rate_inr NUMERIC(8,2),            -- per hour beyond included duration
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_order INT,
  published_at TIMESTAMPTZ,
  new_until TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  hero_image_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_tours_status ON local_tours (status);
CREATE INDEX IF NOT EXISTS idx_local_tours_featured ON local_tours (is_featured, featured_order) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_local_tours_city ON local_tours (city);

-- Fixed base price for the tour with a given fleet (own pricing context)
CREATE TABLE IF NOT EXISTS local_tour_fleet_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES local_tours(id) ON DELETE CASCADE,
  fleet_code TEXT NOT NULL REFERENCES fleets(code) ON DELETE RESTRICT,
  price_inr NUMERIC(10,2) NOT NULL CHECK (price_inr > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tour_id, fleet_code)
);

-- Seed: Agra 8hr/80km local sightseeing (draft — admin publishes when ready)
DO $$
DECLARE
  t_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM local_tours WHERE slug = 'agra-local-sightseeing-8hr') THEN
    INSERT INTO local_tours (slug, code, title, tagline, city,
                             duration_hours, distance_km, duration_text,
                             itinerary, inclusions, exclusions,
                             extra_km_rate_inr, extra_hour_rate_inr,
                             status, meta_title, meta_description)
    VALUES ('agra-local-sightseeing-8hr', 'LTR-AGRA-8HR',
            'Agra Local Sightseeing (8 hr / 80 km)', 'Taj Mahal, Agra Fort, local markets & more',
            'Agra', 8, 80, '8 hrs / 80 km',
            '[{"day":1,"title":"Taj Mahal","description":"Guided morning visit"},
              {"day":1,"title":"Agra Fort","description":"Afternoon at the fort"},
              {"day":1,"title":"Sadar Bazaar","description":"Evening shopping"}]'::jsonb,
            ARRAY['Private AC cab for 8 hrs / 80 km', 'Verified driver', 'Pickup & drop'],
            ARRAY['Monument entry tickets', 'Meals', 'Guide charges'],
            14, 200,
            'draft',
            'Agra Local Sightseeing Tour 8hr/80km | Cab Booking',
            'Book an 8-hour Agra local sightseeing cab: Taj Mahal, Agra Fort and markets. Fixed prices, extra km/hr rates transparent.')
    RETURNING id INTO t_id;

    INSERT INTO local_tour_fleet_prices (tour_id, fleet_code, price_inr) VALUES
      (t_id, 'sedan', 2200),
      (t_id, 'ertiga', 2800),
      (t_id, 'innova-crysta', 3600),
      (t_id, 'tempo-traveller', 5200),
      (t_id, 'urbania', 6800)
    ON CONFLICT (tour_id, fleet_code) DO NOTHING;
  END IF;
END $$;
