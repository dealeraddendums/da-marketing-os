-- Add layout_variant column to ab_events to track A/B layout test results
ALTER TABLE ab_events
  ADD COLUMN IF NOT EXISTS layout_variant text NOT NULL DEFAULT 'b';
