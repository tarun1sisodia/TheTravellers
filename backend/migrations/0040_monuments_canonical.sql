-- 0040: Canonical monuments table (Slice 5 fix)
--
-- 0039 was a no-op on databases where the dossier's interim monuments table
-- (migration 0024) already exists. This migration retires the interim table
-- and creates the canonical content entity.
--
-- Expand → migrate → contract: the legacy rows are preserved in
-- monuments_dossier_legacy and migrated (as drafts) into the new table.

ALTER TABLE IF EXISTS monuments RENAME TO monuments_dossier_legacy;

CREATE TABLE IF NOT EXISTS monuments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  entry_fee_indian_inr NUMERIC(8,2),
  entry_fee_foreigner_inr NUMERIC(8,2),
  timings TEXT,
  closed_days TEXT,
  description TEXT,
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

CREATE INDEX IF NOT EXISTS idx_monuments_status ON monuments (status);
CREATE INDEX IF NOT EXISTS idx_monuments_featured ON monuments (is_featured, featured_order) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_monuments_city ON monuments (city);

-- Migrate legacy rows as drafts (city/fees unknown → 'Unknown'/NULL; admin enriches).
-- Only runs when the legacy table exists (fresh databases skip this).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'monuments_dossier_legacy') THEN
    INSERT INTO monuments (id, slug, code, name, city, timings, closed_days, description, status, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      'legacy-' || substr(md5(name), 1, 8),
      'MON-LEGACY-' || substr(md5(name), 1, 8),
      name,
      'Unknown',
      visiting_hours,
      closed_note,
      historical_context,
      'draft',
      created_at,
      updated_at
    FROM monuments_dossier_legacy
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;

-- Seed: Taj Mahal + Agra Fort (draft — admin publishes when ready)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM monuments WHERE slug = 'taj-mahal-agra') THEN
    INSERT INTO monuments (slug, code, name, city,
                           entry_fee_indian_inr, entry_fee_foreigner_inr,
                           timings, closed_days, description, status,
                           meta_title, meta_description)
    VALUES ('taj-mahal-agra', 'MON-TAJ-001', 'Taj Mahal', 'Agra',
            50, 1100,
            'Sunrise to sunset', 'Friday',
            'The Taj Mahal — ivory-white marble mausoleum on the Yamuna, commissioned by Shah Jahan in 1632.',
            'draft',
            'Taj Mahal Agra — Timings, Entry Fee & How to Reach',
            'Taj Mahal visitor guide: timings, Indian/foreigner entry fees, closed days, and cab options to reach Agra.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM monuments WHERE slug = 'agra-fort') THEN
    INSERT INTO monuments (slug, code, name, city,
                           entry_fee_indian_inr, entry_fee_foreigner_inr,
                           timings, closed_days, description, status,
                           meta_title, meta_description)
    VALUES ('agra-fort', 'MON-AGR-002', 'Agra Fort', 'Agra',
            50, 650,
            'Sunrise to sunset', 'None',
            'Agra Fort — 16th-century Mughal fortress of red sandstone, UNESCO World Heritage Site.',
            'draft',
            'Agra Fort — Timings, Entry Fee & How to Reach',
            'Agra Fort visitor guide: timings, entry fees, and cab options.');
  END IF;
END $$;
