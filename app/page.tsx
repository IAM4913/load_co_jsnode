// app/page.tsx - Main application entry point
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import LoadGrid from '@/components/LoadGrid'
import UploadForm from '@/components/UploadForm'
import LoadDetails from '@/components/LoadDetails'

interface UserProfile {
  id: string
  email: string
  role: 'ADMIN' | 'OPERATOR'
  organization: 'Willbanks' | 'WSI' | 'Jordan'
  location_filter?: string
  carrier_filter?: string
}

interface Load {
  load_id: string
  ship_from_loc: string
  carrier_code: string
  status: 'Open' | 'Ready' | 'Assigned' | 'Shipped' | 'Closed' | 'Cancelled'
  trailer_no?: string
  driver_name?: string
  ship_req_date: string
  created_at: string
  updated_at: string
}

export default function LoadCoordinator() {
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loads, setLoads] = useState<Load[]>([])
  const [selectedLoad, setSelectedLoad] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'grid' | 'upload' | 'details'>('grid')
  const supabase = createClient()

  // Authentication effect
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
    }
    
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Load user profile
  useEffect(() => {
    if (user) {
      loadUserProfile()
    }
  }, [user])

  // Load data based on user profile
  useEffect(() => {
    if (userProfile) {
      loadData()
      setupRealTimeSubscription()
    }
  }, [userProfile])

  const loadUserProfile = async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Error loading user profile:', error)
      // Create profile if it doesn't exist (for demo purposes)
      await createDemoProfile()
    } else {
      setUserProfile(data)
    }
  }

  const createDemoProfile = async () => {
    if (!user) return

    // Determine organization based on email for demo
    let organization: 'Willbanks' | 'WSI' | 'Jordan' = 'Willbanks'
    let role: 'ADMIN' | 'OPERATOR' = 'ADMIN'
    let location_filter = null
    let carrier_filter = null

    if (user.email?.includes('wsi')) {
      organization = 'WSI'
      role = 'OPERATOR'
      location_filter = 'WSI'
    } else if (user.email?.includes('jordan')) {
      organization = 'Jordan'
      role = 'OPERATOR'
      carrier_filter = 'Jordan'
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        id: user.id,
        email: user.email!,
        role,
        organization,
        location_filter,
        carrier_filter
      })
      .select()
      .single()

    if (!error) {
      setUserProfile(data)
    }
  }

  const loadData = async () => {
    if (!userProfile) return

    let query = supabase.from('loads').select('*')

    // Apply filters based on user role
    if (userProfile.organization === 'WSI' && userProfile.location_filter) {
      query = query.eq('ship_from_loc', userProfile.location_filter)
    } else if (userProfile.organization === 'Jordan' && userProfile.carrier_filter) {
      query = query
        .eq('carrier_code', userProfile.carrier_filter)
        .in('status', ['Ready', 'Assigned', 'Shipped'])
    }

    const { data, error } = await query.order('ship_req_date', { ascending: false })

    if (error) {
      console.error('Error loading loads:', error)
    } else {
      setLoads(data || [])
    }
  }

  const setupRealTimeSubscription = () => {
    const subscription = supabase
      .channel('loads-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loads' },
        () => {
          loadData() // Reload data on any change
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }

const updateLoad = async (loadId: string, updates: Partial<Load>) => {
    console.log('🚀 Updating load:', loadId, 'with updates:', updates)
    
    try {
      // Get current load data first
      const { data: currentLoad, error: fetchError } = await supabase
        .from('loads')
        .select('*')
        .eq('load_id', loadId)
        .single()

      if (fetchError) {
        console.error('❌ Error fetching current load:', fetchError)
        throw fetchError
      }

      console.log('📄 Current load data:', currentLoad)

      // Clean up the updates object - remove any undefined/null values that might confuse triggers
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key, value]) => {
          // Keep the value if it's not undefined and not null (but allow empty strings)
          return value !== undefined && value !== null
        })
      )

      console.log('🧹 Clean updates:', cleanUpdates)

      // Add updated_at timestamp
      const finalUpdates = {
        ...cleanUpdates,
        updated_at: new Date().toISOString()
      }

      console.log('📝 Final updates to apply:', finalUpdates)

      // Apply the updates
      const { error } = await supabase
        .from('loads')
        .update(finalUpdates)
        .eq('load_id', loadId)

      if (error) {
        console.error('❌ Database error details:', error)
        
        // Better error message handling
        let errorMessage = 'Database update failed'
        
        if (error.message) {
          errorMessage = error.message
        } else if (error.details) {
          errorMessage = error.details
        } else if (error.hint) {
          errorMessage = error.hint
        } else if (error.code) {
          errorMessage = `Database error code: ${error.code}`
        } else {
          errorMessage = 'Unknown database error: ' + JSON.stringify(error)
        }
        
        alert('Error updating load: ' + errorMessage)
        return false
      }

      console.log('✅ Main update successful')

      // Now handle the driver-status business logic
      const finalDriverName = cleanUpdates.driver_name !== undefined ? cleanUpdates.driver_name : currentLoad.driver_name
      const finalStatus = cleanUpdates.status !== undefined ? cleanUpdates.status : currentLoad.status

      console.log('🔍 Checking business rules:', { finalDriverName, finalStatus, updatedStatus: cleanUpdates.status })

      // Only apply auto-status logic if we didn't manually update the status
      if (cleanUpdates.status === undefined) {
        let needsStatusUpdate = false
        let newStatus = finalStatus

        // Rule 1: Driver populated + Ready status → Assigned
        if (finalDriverName && finalDriverName.trim() !== '' && finalStatus === 'Ready') {
          newStatus = 'Assigned'
          needsStatusUpdate = true
          console.log('🔄 Rule 1: Driver populated + Ready → Changing to Assigned')
        }
        
        // Rule 2: Driver removed + Assigned status → Ready
        else if ((!finalDriverName || finalDriverName.trim() === '') && finalStatus === 'Assigned') {
          newStatus = 'Ready'
          needsStatusUpdate = true
          console.log('🔄 Rule 2: Driver removed + Assigned → Changing to Ready')
        }

        // Apply the automatic status change
        if (needsStatusUpdate) {
          console.log(`🔄 Applying automatic status change to: ${newStatus}`)
          
          const { error: statusError } = await supabase
            .from('loads')
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('load_id', loadId)
            
          if (statusError) {
            console.error('❌ Error updating status automatically:', statusError)
            // Don't fail the whole operation, just log the error
            alert('Warning: Main update succeeded but automatic status change failed')
          } else {
            console.log(`✅ Status automatically updated to: ${newStatus}`)
          }
        }
      } else {
        console.log('⏭️ Skipping auto-status logic (status was manually updated)')
      }

      // Reload data to reflect all changes
      console.log('🔄 Reloading data...')
      loadData()
      return true

    } catch (catchError) {
      console.error('💥 Unexpected error in updateLoad:', catchError)
      
      const errorMessage = catchError instanceof Error 
        ? catchError.message 
        : 'Unexpected error occurred'
        
      alert('Error updating load: ' + errorMessage)
      return false
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserProfile(null)
    setLoads([])
  }

  // Show auth UI if not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Load Coordinator</h1>
            <p className="text-gray-600">Sign in to manage loads</p>
          </div>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={[]}
            redirectTo={typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}
          />
          <div className="mt-4 text-xs text-gray-500">
            <p>Demo accounts:</p>
            <p>• willbanks@company.com (Admin)</p>
            <p>• wsi@company.com (Warehouse)</p>
            <p>• jordan@company.com (Dispatch)</p>
          </div>
        </div>
      </div>
    )
  }

  // Show loading if profile not loaded
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  // Get theme color based on organization
  const getThemeColor = () => {
    switch (userProfile.organization) {
      case 'Willbanks': return 'red'
      case 'WSI': return 'blue'
      case 'Jordan': return 'green'
      default: return 'gray'
    }
  }

  const themeColor = getThemeColor()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className={`bg-${themeColor}-600 text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 md:py-4">
            <div>
              <h1 className="text-lg md:text-2xl font-bold">
                <span className="hidden sm:inline">{userProfile.organization}</span>
                <span className="sm:hidden">Load Coordinator</span>
                <span className="hidden sm:inline"> Load Coordinator</span>
              </h1>
              <p className="text-xs md:text-sm opacity-90">
                {userProfile.role} • <span className="hidden sm:inline">{user.email}</span>
                <span className="sm:hidden">Mobile</span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-white text-gray-700 px-3 py-2 md:px-4 md:py-2 rounded-md hover:bg-gray-100 transition-colors text-sm"
            >
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <nav className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('grid')}
              className={`mobile-tab ${
                activeTab === 'grid'
                  ? `border-${themeColor}-500 text-${themeColor}-600`
                  : 'border-transparent text-gray-500'
              }`}
            >
              <span className="block text-xs">Loads</span>
              <span className="block text-xs font-normal">({loads.length})</span>
            </button>
            {userProfile.role === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('upload')}
                className={`mobile-tab ${
                  activeTab === 'upload'
                    ? `border-${themeColor}-500 text-${themeColor}-600`
                    : 'border-transparent text-gray-500'
                }`}
              >
                <span className="block text-xs">Upload</span>
                <span className="block text-xs font-normal">CSV</span>
              </button>
            )}
            {selectedLoad && (
              <button
                onClick={() => setActiveTab('details')}
                className={`mobile-tab ${
                  activeTab === 'details'
                    ? `border-${themeColor}-500 text-${themeColor}-600`
                    : 'border-transparent text-gray-500'
                }`}
              >
                <span className="block text-xs">Details</span>
                <span className="block text-xs font-normal">{selectedLoad}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Desktop Navigation */}
      <nav className="hidden md:block bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('grid')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'grid'
                  ? `border-${themeColor}-500 text-${themeColor}-600`
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Load Grid
            </button>
            {userProfile.role === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('upload')}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === 'upload'
                    ? `border-${themeColor}-500 text-${themeColor}-600`
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Upload CSV
              </button>
            )}
            {selectedLoad && (
              <button
                onClick={() => setActiveTab('details')}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === 'details'
                    ? `border-${themeColor}-500 text-${themeColor}-600`
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Load Details
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-2 md:py-6 px-4 sm:px-6 lg:px-8">
        <div className="space-y-4">
          
          {/* Load Grid Tab */}
          {activeTab === 'grid' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-3 py-4 md:px-4 md:py-5 sm:p-6">
                <h3 className="text-base md:text-lg leading-6 font-medium text-gray-900 mb-4">
                  Load Management
                  <span className="ml-2 text-sm text-gray-500">
                    ({loads.length} loads)
                  </span>
                </h3>
                <LoadGrid
                  loads={loads}
                  onUpdateLoad={updateLoad}
                  onSelectLoad={setSelectedLoad}
                  userProfile={userProfile}
                  themeColor={themeColor}
                />
              </div>
            </div>
          )}

          {/* Upload CSV Tab */}
          {activeTab === 'upload' && userProfile.role === 'ADMIN' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-3 py-4 md:px-4 md:py-5 sm:p-6">
                <h3 className="text-base md:text-lg leading-6 font-medium text-gray-900 mb-4">
                  Upload CSV Files
                </h3>
                <UploadForm
                  onUploadComplete={loadData}
                  themeColor={themeColor}
                />
              </div>
            </div>
          )}

          {/* Load Details Tab */}
          {activeTab === 'details' && selectedLoad && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-3 py-4 md:px-4 md:py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base md:text-lg leading-6 font-medium text-gray-900">
                    Load Details - {selectedLoad}
                  </h3>
                  <button
                    onClick={() => setSelectedLoad(null)}
                    className="md:hidden text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <LoadDetails
                  loadId={selectedLoad}
                  userProfile={userProfile}
                  onUpdate={loadData}
                  themeColor={themeColor}
                />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}