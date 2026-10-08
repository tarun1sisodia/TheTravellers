-- 0037: Packages content domain (Slice 3)
--
-- Canonical publishable package entity. Package pricing is FIXED per
-- package/fleet and isolated from route-rate changes (doc decision).

CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,                  -- e.g. 'PKG-AGRA-001'
  title TEXT NOT NULL,
  tagline TEXT,
  origin_city TEXT,
  corridor TEXT,                              -- route context, e.g. 'agra-delhi'
  duration_days INT CHECK (duration_days IS NULL OR duration_days > 0),
  duration_nights INT CHECK (duration_nights IS NULL OR duration_nights >= 0),
  duration_text TEXT,
  itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{day, title, description}]
  inclusions TEXT[] NOT NULL DEFAULT '{}',
  exclusions TEXT[] NOT NULL DEFAULT '{}',
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

CREATE INDEX IF NOT EXISTS idx_packages_status ON packages (status);
CREATE INDEX IF NOT EXISTS idx_packages_featured ON packages (is_featured, featured_order) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_packages_corridor ON packages (corridor);

-- Fixed total price for the whole package with a given fleet.
-- Isolated from route per-km rates by design.
CREATE TABLE IF NOT EXISTS package_fleet_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  fleet_code TEXT NOT NULL REFERENCES fleets(code) ON DELETE RESTRICT,
  price_inr NUMERIC(10,2) NOT NULL CHECK (price_inr > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_id, fleet_code)
);

-- Seed: Agra Same-Day Tour package (draft — admin publishes when ready)
DO $$
DECLARE
  p_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM packages WHERE slug = 'agra-same-day-tour') THEN
    INSERT INTO packages (slug, code, title, tagline, origin_city, corridor,
                          duration_days, duration_nights, duration_text,
                          itinerary, inclusions, exclusions, status,
                          meta_title, meta_description)
    VALUES ('agra-same-day-tour', 'PKG-AGRA-001',
            'Agra Same-Day Tour', 'Taj Mahal, Agra Fort & Mehtab Bagh in one perfect day',
            'Agra', 'agra-delhi',
            1, 0, '1 day',
            '[{"day":1,"title":"Taj Mahal at sunrise","description":"Pickup at 6 AM, guided Taj Mahal visit"},
              {"day":1,"title":"Agra Fort","description":"UNESCO World Heritage Agra Fort"},
              {"day":1,"title":"Mehtab Bagh","description":"Sunset view of the Taj across the Yamuna"}]'::jsonb,
            ARRAY['Private AC cab', 'Verified driver', 'Toll & parking', 'Pickup & drop'],
            ARRAY['Monument entry tickets', 'Meals', 'Guide charges'],
            'draft',
            'Agra Same-Day Tour Package | Taj Mahal Taxi Tour',
            'Book a same-day Agra tour package: Taj Mahal, Agra Fort and Mehtab Bagh with private cab. Fixed prices, no hidden charges.')
    RETURNING id INTO p_id;

    INSERT INTO package_fleet_prices (package_id, fleet_code, price_inr) VALUES
      (p_id, 'sedan', 3499),
      (p_id, 'ertiga', 4499),
      (p_id, 'innova-crysta', 5999),
      (p_id, 'tempo-traveller', 8999),
      (p_id, 'urbania', 11999)
    ON CONFLICT (package_id, fleet_code) DO NOTHING;
  END IF;
END $$;
