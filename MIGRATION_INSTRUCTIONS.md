# Instructions for Adding ship_req_date Column

## Database Migration

1. **Add the ship_req_date column to your Supabase database:**
   - Open your Supabase dashboard
   - Go to the SQL Editor
   - Run the SQL script from `add_ship_req_date_column.sql`

   ```sql
   -- Add ship_req_date column to loads table
   ALTER TABLE loads ADD COLUMN IF NOT EXISTS ship_req_date TIMESTAMP WITH TIME ZONE;

   -- Update existing records to use created_at as ship_req_date if ship_req_date is null
   UPDATE loads 
   SET ship_req_date = created_at 
   WHERE ship_req_date IS NULL;

   -- Create index for better performance
   CREATE INDEX IF NOT EXISTS idx_loads_ship_req_date ON loads(ship_req_date);
   ```

2. **Alternative: Use the JavaScript migration script:**
   - Ensure your environment variables are set (.env.local)
   - Run: `node add_ship_req_date_column.js`

## Changes Made

The following files have been updated to use "Requested" instead of "Created" and connect to the `ship_req_date` column:

1. **app/page.tsx** - Updated Load interface and ordering
2. **components/LoadGrid.tsx** - Updated Load interface and column display
3. **components/LoadDetails.tsx** - Added "Requested" field to Load Summary
4. **components/UploadForm.tsx** - Added support for SHIP_REQ_DATE column in CSV uploads

## CSV Upload Format

When uploading loads CSV files, you can now include a `SHIP_REQ_DATE` column. If not provided, the current timestamp will be used.

Example CSV format:
```
LOAD_ID,SHIP_FROM_LOC,CARRIER_CODE,STATUS,TRAILER_NO,DRIVER_NAME,SHIP_REQ_DATE
L001,Chicago,ABC,Open,1234,John Doe,2024-01-15T10:00:00Z
```

## Testing

After applying the database migration:
1. Restart your Next.js application
2. Check the load grid to see "Requested" column instead of "Created"
3. Open load details to see the "Requested" field in the summary
4. Test CSV upload with the new SHIP_REQ_DATE column
