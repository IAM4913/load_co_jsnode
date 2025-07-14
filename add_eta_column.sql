-- Add ETA column to loads table
ALTER TABLE loads ADD COLUMN IF NOT EXISTS eta TEXT;

-- Update any existing triggers or functions to handle the new column
-- (This depends on your specific database setup)
