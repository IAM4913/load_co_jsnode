-- Add ship_req_date column to loads table
ALTER TABLE loads ADD COLUMN IF NOT EXISTS ship_req_date TIMESTAMP WITH TIME ZONE;

-- Update existing records to use created_at as ship_req_date if ship_req_date is null
UPDATE loads 
SET ship_req_date = created_at 
WHERE ship_req_date IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_loads_ship_req_date ON loads(ship_req_date);
