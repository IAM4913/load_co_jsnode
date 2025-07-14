// lib/supabase.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create singleton client instance
const supabaseInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Audit logging helper functions
export const getAuditHistory = async (loadId: string) => {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('record_id', loadId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching audit history:', error)
    return []
  }
  
  return data || []
}

export const getStatusHistory = async (loadId: string) => {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('load_status_history')
    .select('*')
    .eq('load_id', loadId)
    .order('changed_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching status history:', error)
    return []
  }
  
  return data || []
}

export const logCustomAuditEvent = async (
  loadId: string, 
  action: string, 
  details: string,
  userEmail?: string
) => {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('audit_log')
    .insert({
      table_name: 'loads',
      record_id: loadId,
      action: 'UPDATE',
      field_name: 'custom_action',
      new_value: `${action}: ${details}`,
      user_email: userEmail
    })
  
  if (error) {
    console.error('Error logging custom audit event:', error)
  }
}

// Export function that returns the same instance
export const createClient = () => supabaseInstance
// Database types for TypeScript
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string
          role: 'ADMIN' | 'OPERATOR'
          organization: 'Willbanks' | 'WSI' | 'Jordan'
          location_filter: string | null
          carrier_filter: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role: 'ADMIN' | 'OPERATOR'
          organization: 'Willbanks' | 'WSI' | 'Jordan'
          location_filter?: string | null
          carrier_filter?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'ADMIN' | 'OPERATOR'
          organization?: 'Willbanks' | 'WSI' | 'Jordan'
          location_filter?: string | null
          carrier_filter?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      loads: {
        Row: {
          load_id: string
          ship_from_loc: string
          carrier_code: string | null
          status: 'Open' | 'Ready' | 'Assigned' | 'Shipped' | 'Closed' | 'Cancelled'
          trailer_no: string | null
          driver_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          load_id: string
          ship_from_loc: string
          carrier_code?: string | null
          status?: 'Open' | 'Ready' | 'Assigned' | 'Shipped' | 'Closed' | 'Cancelled'
          trailer_no?: string | null
          driver_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          load_id?: string
          ship_from_loc?: string
          carrier_code?: string | null
          status?: 'Open' | 'Ready' | 'Assigned' | 'Shipped' | 'Closed' | 'Cancelled'
          trailer_no?: string | null
          driver_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      load_details: {
        Row: {
          id: string
          load_id: string
          line: number
          item_desc: string | null
          qty_ordered: number | null
          qty_shipped: number | null
          status_code: 'Open' | 'Loaded' | 'Marked_Off'
          markoff_reason: string | null
          heat_number: string | null
          created_at: string
        }
        Insert: {
          id?: string
          load_id: string
          line: number
          item_desc?: string | null
          qty_ordered?: number | null
          qty_shipped?: number | null
          status_code?: 'Open' | 'Loaded' | 'Marked_Off'
          markoff_reason?: string | null
          heat_number?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          load_id?: string
          line?: number
          item_desc?: string | null
          qty_ordered?: number | null
          qty_shipped?: number | null
          status_code?: 'Open' | 'Loaded' | 'Marked_Off'
          markoff_reason?: string | null
          heat_number?: string | null
          created_at?: string
        }
      }
      stop_details: {
        Row: {
          id: string
          load_id: string
          seq_no: number
          customer_name: string | null
          address: string | null
          miles: number | null
          weight: number | null
          created_at: string
        }
        Insert: {
          id?: string
          load_id: string
          seq_no: number
          customer_name?: string | null
          address?: string | null
          miles?: number | null
          weight?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          load_id?: string
          seq_no?: number
          customer_name?: string | null
          address?: string | null
          miles?: number | null
          weight?: number | null
          created_at?: string
        }
      }
      audit_log: {
        Row: {
          id: string
          user_id: string | null
          table_name: string
          record_id: string
          action: 'CREATE' | 'UPDATE' | 'DELETE'
          old_values: any | null
          new_values: any | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          table_name: string
          record_id: string
          action: 'CREATE' | 'UPDATE' | 'DELETE'
          old_values?: any | null
          new_values?: any | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          table_name?: string
          record_id?: string
          action?: 'CREATE' | 'UPDATE' | 'DELETE'
          old_values?: any | null
          new_values?: any | null
          created_at?: string
        }
      }
    }
  }
}