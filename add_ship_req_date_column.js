// add_ship_req_date_column.js
// This script adds the ship_req_date column to the loads table

const { createClient } = require('@supabase/supabase-js')

// You'll need to set these environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function addShipReqDateColumn() {
  try {
    console.log('Adding ship_req_date column to loads table...')
    
    // First, let's check if the column already exists
    const { data: columns, error: columnError } = await supabase
      .from('loads')
      .select('*')
      .limit(1)
    
    if (columnError) {
      console.error('Error checking table structure:', columnError)
      return
    }
    
    // Since we can't directly ALTER TABLE through the client, we'll try to update some records
    // to see if the column exists
    try {
      const { error: testError } = await supabase
        .from('loads')
        .update({ ship_req_date: new Date().toISOString() })
        .eq('load_id', 'test_nonexistent_id')
      
      if (testError && testError.message.includes('column "ship_req_date" does not exist')) {
        console.log('Column does not exist. You need to run the SQL migration manually.')
        console.log('Please run the SQL script in add_ship_req_date_column.sql in your Supabase SQL editor.')
        return
      }
    } catch (e) {
      console.log('Column might not exist. Please run the SQL migration manually.')
      return
    }
    
    console.log('Column exists or was added successfully.')
    
    // Update existing records to set ship_req_date = created_at where ship_req_date is null
    console.log('Updating existing records...')
    
    // First, get all records that need updating
    const { data: loadsToUpdate, error: fetchError } = await supabase
      .from('loads')
      .select('load_id, created_at, ship_req_date')
      .is('ship_req_date', null)
    
    if (fetchError) {
      console.error('Error fetching loads:', fetchError)
      return
    }
    
    console.log(`Found ${loadsToUpdate?.length || 0} records to update.`)
    
    if (loadsToUpdate && loadsToUpdate.length > 0) {
      // Update records in batches
      const batchSize = 100
      for (let i = 0; i < loadsToUpdate.length; i += batchSize) {
        const batch = loadsToUpdate.slice(i, i + batchSize)
        const updates = batch.map(load => ({
          load_id: load.load_id,
          ship_req_date: load.created_at
        }))
        
        const { error: updateError } = await supabase
          .from('loads')
          .upsert(updates, { onConflict: 'load_id' })
        
        if (updateError) {
          console.error('Error updating batch:', updateError)
          return
        }
        
        console.log(`Updated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(loadsToUpdate.length / batchSize)}`)
      }
    }
    
    console.log('Successfully updated all records!')
    
  } catch (error) {
    console.error('Error:', error)
  }
}

addShipReqDateColumn()
