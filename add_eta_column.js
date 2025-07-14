// add_eta_column.js - Script to add ETA column to loads table
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://gatkglhazsjwtbsarift.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhdGtnbGhhenNqd3Ric2FyaWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MTg4NzMsImV4cCI6MjA2Nzk5NDg3M30.pI59BKKbnP7z5xvudH60p4fjATN-1GpROCGl_3Wok_M'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addEtaColumn() {
  try {
    // Use RPC to execute SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE loads ADD COLUMN IF NOT EXISTS eta TEXT;'
    })
    
    if (error) {
      console.error('Error adding ETA column:', error)
    } else {
      console.log('ETA column added successfully:', data)
    }
  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

addEtaColumn()
