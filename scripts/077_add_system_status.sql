ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS system_down BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_down_message TEXT NOT NULL DEFAULT 'We''ll be back soon. Our systems are undergoing maintenance.';
