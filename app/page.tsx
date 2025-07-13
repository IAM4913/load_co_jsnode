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
  eta?: string
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

    const { data, error } = await query.order('created_at', { ascending: false })

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
    const { error } = await supabase
      .from('loads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('load_id', loadId)

    if (error) {
      console.error('Error updating load:', error)
      alert('Error updating load: ' + error.message)
    } else {
      // Auto-assign status when driver is assigned
      if (updates.driver_name && updates.driver_name.trim() !== '') {
        await supabase
          .from('loads')
          .update({ status: 'Assigned' })
          .eq('load_id', loadId)
      }
      loadData()
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
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold">
                {userProfile.organization} Load Coordinator
              </h1>
              <p className="text-sm opacity-90">
                {userProfile.role} • {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-white text-gray-700 px-4 py-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
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
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          
          {/* Load Grid Tab */}
          {activeTab === 'grid' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
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
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
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
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Load Details - {selectedLoad}
                </h3>
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