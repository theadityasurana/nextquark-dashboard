-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON live_application_queue;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON live_application_queue;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON live_application_queue;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON live_application_queue;

-- Create new RLS policies with public access
CREATE POLICY "Allow public read" ON live_application_queue
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert" ON live_application_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON live_application_queue
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete" ON live_application_queue
  FOR DELETE USING (true);
