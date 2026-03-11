-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id BIGINT PRIMARY KEY DEFAULT 1,
  browserUseApiKey TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read settings
CREATE POLICY "Allow authenticated users to read settings"
  ON settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to update settings
CREATE POLICY "Allow authenticated users to update settings"
  ON settings FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to insert settings
CREATE POLICY "Allow authenticated users to insert settings"
  ON settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
