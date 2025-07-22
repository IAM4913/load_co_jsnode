// components/ExcelFileWatcher.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface ExcelFileWatcherProps {
  onSyncComplete: () => void
  themeColor: string
}

interface SyncResult {
  newLoads: number
  skippedLoads: number
  errors: string[]
  lastSyncTime: Date
}

export default function ExcelFileWatcher({ onSyncComplete, themeColor }: ExcelFileWatcherProps) {
  const [isWatching, setIsWatching] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [excelFilePath, setExcelFilePath] = useState<string>('')
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncInterval, setSyncInterval] = useState(300) // 5 minutes default
  const [isProcessing, setIsProcessing] = useState(false)
  
  const fileWatcherRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  // Stop watching when component unmounts
  useEffect(() => {
    return () => {
      if (fileWatcherRef.current) {
        clearInterval(fileWatcherRef.current)
      }
    }
  }, [])

  // Auto-sync interval effect
  useEffect(() => {
    if (autoSyncEnabled && excelFilePath) {
      fileWatcherRef.current = setInterval(() => {
        syncFromExcel()
      }, syncInterval * 1000)
    } else if (fileWatcherRef.current) {
      clearInterval(fileWatcherRef.current)
    }

    return () => {
      if (fileWatcherRef.current) {
        clearInterval(fileWatcherRef.current)
      }
    }
  }, [autoSyncEnabled, excelFilePath, syncInterval])

  const checkIfLoadExists = async (loadId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('loads')
      .select('load_id')
      .eq('load_id', loadId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error checking load existence:', error)
      return false
    }

    return !!data
  }

  const getLoadAppStatus = async (loadId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('loads')
      .select('status')
      .eq('load_id', loadId)
      .single()

    if (error) {
      console.error('Error getting load status:', error)
      return null
    }

    return data?.status || null
  }

  const processExcelFile = async (file: File): Promise<SyncResult> => {
    const result: SyncResult = {
      newLoads: 0,
      skippedLoads: 0,
      errors: [],
      lastSyncTime: new Date()
    }

    try {
      // Convert Excel to CSV using a web-based solution
      const csvData = await convertExcelToCsv(file)
      
      // Parse CSV data
      const Papa = await import('papaparse')
      const parseResult = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
      })

      if (parseResult.errors.length > 0) {
        result.errors.push(...parseResult.errors.map(e => e.message))
        return result
      }

      const rows = parseResult.data as any[]
      console.log(`Processing ${rows.length} rows from Excel file`)

      for (const row of rows) {
        const loadId = row.LOAD_ID?.toString().trim()
        const erpStatus = row.STATUS?.toString().trim()
        
        if (!loadId) {
          result.errors.push('Missing LOAD_ID in row')
          continue
        }

        try {
          // Check if load exists in our system
          const exists = await checkIfLoadExists(loadId)
          
          if (exists) {
            // Load exists - check if we should skip or warn
            const appStatus = await getLoadAppStatus(loadId)
            
            // Skip if ERP status is "Open" but app status is more advanced
            if (erpStatus === 'Open' && appStatus && ['Ready', 'Assigned', 'Shipped'].includes(appStatus)) {
              result.skippedLoads++
              console.log(`Skipped ${loadId}: ERP shows '${erpStatus}' but app shows '${appStatus}'`)
              continue
            }
            
            // Update existing load if ERP status is more advanced
            if (shouldUpdateFromErp(erpStatus, appStatus)) {
              await updateLoadFromErp(loadId, row)
              console.log(`Updated ${loadId} from ERP`)
            }
            
            result.skippedLoads++
            continue
          }

          // New load - create it
          const newLoad = await createLoadFromExcelRow(row)
          if (newLoad) {
            result.newLoads++
            console.log(`Created new load: ${loadId}`)
          }
        } catch (error) {
          console.error(`Error processing load ${loadId}:`, error)
          result.errors.push(`Error processing load ${loadId}: ${error}`)
        }
      }

    } catch (error) {
      console.error('Error processing Excel file:', error)
      result.errors.push(`File processing error: ${error}`)
    }

    return result
  }

  const convertExcelToCsv = async (file: File): Promise<string> => {
    // For now, we'll assume the client converts Excel to CSV
    // In a real implementation, you'd use a library like xlsx or SheetJS
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const data = e.target?.result as string
        resolve(data)
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  const shouldUpdateFromErp = (erpStatus: string, appStatus: string | null): boolean => {
    const statusHierarchy = ['Open', 'Ready', 'Assigned', 'Shipped', 'Closed', 'Cancelled']
    const erpIndex = statusHierarchy.indexOf(erpStatus)
    const appIndex = appStatus ? statusHierarchy.indexOf(appStatus) : -1
    
    // Update if ERP status is more advanced than app status
    return erpIndex > appIndex
  }

  const updateLoadFromErp = async (loadId: string, row: any) => {
    const updateData: any = {}
    
    // Map Excel columns to database columns
    if (row.STATUS) updateData.status = row.STATUS
    if (row.CARRIER_CODE) updateData.carrier_code = row.CARRIER_CODE
    if (row.SHIP_FROM_LOC) updateData.ship_from_loc = row.SHIP_FROM_LOC
    if (row.DRIVER_NAME) updateData.driver_name = row.DRIVER_NAME
    if (row.TRAILER_NO) updateData.trailer_no = row.TRAILER_NO
    if (row.SHIP_REQ_DATE) updateData.ship_req_date = row.SHIP_REQ_DATE
    if (row.ETA) updateData.eta = row.ETA

    const { error } = await supabase
      .from('loads')
      .update(updateData)
      .eq('load_id', loadId)

    if (error) {
      throw new Error(`Failed to update load: ${error.message}`)
    }
  }

  const createLoadFromExcelRow = async (row: any) => {
    const loadData = {
      load_id: row.LOAD_ID?.toString().trim(),
      ship_from_loc: row.SHIP_FROM_LOC?.toString().trim() || '',
      carrier_code: row.CARRIER_CODE?.toString().trim() || '',
      status: row.STATUS?.toString().trim() || 'Open',
      driver_name: row.DRIVER_NAME?.toString().trim() || null,
      trailer_no: row.TRAILER_NO?.toString().trim() || null,
      ship_req_date: row.SHIP_REQ_DATE || new Date().toISOString(),
      eta: row.ETA || null
    }

    const { data, error } = await supabase
      .from('loads')
      .insert([loadData])
      .select()

    if (error) {
      throw new Error(`Failed to create load: ${error.message}`)
    }

    return data[0]
  }

  const syncFromExcel = async () => {
    if (isProcessing) return
    
    setIsProcessing(true)
    
    try {
      // This would need to be adapted based on how you access the Excel file
      // For now, we'll show the manual upload approach
      const fileInput = document.getElementById('excelFileInput') as HTMLInputElement
      if (!fileInput?.files?.[0]) {
        throw new Error('No file selected')
      }

      const result = await processExcelFile(fileInput.files[0])
      setSyncResult(result)
      onSyncComplete()
    } catch (error) {
      console.error('Sync error:', error)
      setSyncResult({
        newLoads: 0,
        skippedLoads: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastSyncTime: new Date()
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setExcelFilePath(file.name)
    }
  }

  const startWatching = () => {
    setIsWatching(true)
    setAutoSyncEnabled(true)
  }

  const stopWatching = () => {
    setIsWatching(false)
    setAutoSyncEnabled(false)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">Excel File Sync</h2>
      
      {/* File Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Excel File
        </label>
        <input
          id="excelFileInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {excelFilePath && (
          <p className="mt-2 text-sm text-gray-600">
            Selected: {excelFilePath}
          </p>
        )}
      </div>

      {/* Sync Settings */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm font-medium">Auto-sync enabled</span>
          </label>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Interval:</label>
            <select
              value={syncInterval}
              onChange={(e) => setSyncInterval(Number(e.target.value))}
              className="p-1 border border-gray-300 rounded text-sm"
            >
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={1800}>30 minutes</option>
            </select>
          </div>
        </div>

        {/* Manual Sync Button */}
        <button
          onClick={syncFromExcel}
          disabled={isProcessing || !excelFilePath}
          className={`px-4 py-2 rounded-md font-medium ${
            isProcessing || !excelFilePath
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : `bg-${themeColor}-600 text-white hover:bg-${themeColor}-700`
          }`}
        >
          {isProcessing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Sync Results */}
      {syncResult && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Last Sync Results</h3>
          <div className="bg-gray-50 rounded-md p-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <span className="text-sm font-medium text-green-600">New Loads:</span>
                <span className="ml-2 text-sm">{syncResult.newLoads}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-yellow-600">Skipped:</span>
                <span className="ml-2 text-sm">{syncResult.skippedLoads}</span>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Last sync: {syncResult.lastSyncTime.toLocaleString()}
            </div>
            
            {syncResult.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-red-600 mb-2">Errors:</h4>
                <ul className="text-xs text-red-500 space-y-1">
                  {syncResult.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Information */}
      <div className="bg-blue-50 rounded-md p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">How it works:</h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• <strong>New loads:</strong> Creates loads that don't exist in the system</li>
          <li>• <strong>Existing loads:</strong> Skips loads that already exist</li>
          <li>• <strong>Smart skipping:</strong> Ignores ERP "Open" status if app shows "Ready/Assigned"</li>
          <li>• <strong>ERP updates:</strong> Updates from ERP when ERP status is more advanced</li>
          <li>• <strong>Auto-sync:</strong> Monitors file changes at set intervals</li>
        </ul>
      </div>
    </div>
  )
}
