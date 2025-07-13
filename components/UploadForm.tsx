// components/UploadForm.tsx
'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase'

interface UploadFormProps {
  onUploadComplete: () => void
  themeColor: string
}

interface CSVRow {
  [key: string]: string
}

interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  rowCount: number
  validRows: number
}

export default function UploadForm({ onUploadComplete, themeColor }: UploadFormProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{
    loads?: ValidationResult
    details?: ValidationResult
    stops?: ValidationResult
  }>({})
  const [uploadComplete, setUploadComplete] = useState(false)
  
  const loadsFileRef = useRef<HTMLInputElement>(null)
  const detailsFileRef = useRef<HTMLInputElement>(null)
  const stopsFileRef = useRef<HTMLInputElement>(null)
  
  const supabase = createClient()

  // Required columns for each CSV type
  const requiredColumns = {
    loads: ['LOAD_ID', 'SHIP_FROM_LOC', 'STATUS'],
    details: ['LOAD_ID', 'Line', 'ItemDesc', 'QtyOrdered'],
    stops: ['LOAD_ID', 'SeqNo', 'Cust Name', 'Address']
  }

  const validateCSV = (data: CSVRow[], type: 'loads' | 'details' | 'stops'): ValidationResult => {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      rowCount: data.length,
      validRows: 0
    }

    if (data.length === 0) {
      result.isValid = false
      result.errors.push('CSV file is empty')
      return result
    }

    // Check required columns
    const columns = Object.keys(data[0])
    const missing = requiredColumns[type].filter(col => !columns.includes(col))
    
    if (missing.length > 0) {
      result.isValid = false
      result.errors.push(`Missing required columns: ${missing.join(', ')}`)
      return result
    }

    // Validate each row
    let validRowCount = 0
    data.forEach((row, index) => {
      let rowValid = true

      // Check for empty required fields
      requiredColumns[type].forEach(col => {
        if (!row[col] || row[col].trim() === '') {
          result.warnings.push(`Row ${index + 1}: Missing ${col}`)
          rowValid = false
        }
      })

      // Type-specific validations
      if (type === 'loads') {
        if (row.STATUS && !['Open', 'Ready', 'Assigned', 'Shipped', 'Closed', 'Cancelled'].includes(row.STATUS)) {
          result.warnings.push(`Row ${index + 1}: Invalid status "${row.STATUS}"`)
        }
      }

      if (type === 'details') {
        if (row.QtyOrdered && isNaN(parseFloat(row.QtyOrdered))) {
          result.warnings.push(`Row ${index + 1}: QtyOrdered must be a number`)
          rowValid = false
        }
      }

      if (rowValid) validRowCount++
    })

    result.validRows = validRowCount
    
    if (result.validRows === 0) {
      result.isValid = false
      result.errors.push('No valid rows found in CSV')
    }

    return result
  }

  const parseCSVFile = (file: File): Promise<CSVRow[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error(`CSV parsing error: ${results.errors[0].message}`))
          } else {
            resolve(results.data as CSVRow[])
          }
        },
        error: (error) => {
          reject(error)
        }
      })
    })
  }

  const uploadToDatabase = async (data: CSVRow[], type: 'loads' | 'details' | 'stops') => {
    try {
      if (type === 'loads') {
        // Transform and insert loads
        const loads = data.map(row => ({
          load_id: row.LOAD_ID,
          ship_from_loc: row.SHIP_FROM_LOC,
          carrier_code: row.CARRIER_CODE || null,
          status: row.STATUS || 'Open',
          trailer_no: row.TRAILER_NO || null,
          driver_name: row.DRIVER_NAME || null,
          eta: row.ETA ? new Date(row.ETA).toISOString() : null
        }))

        const { error } = await supabase
          .from('loads')
          .upsert(loads, { onConflict: 'load_id' })

        if (error) throw error

      } else if (type === 'details') {
        // Transform and insert load details
        const details = data.map(row => ({
          load_id: row.LOAD_ID,
          line: parseInt(row.Line),
          item_desc: row.ItemDesc,
          qty_ordered: parseFloat(row.QtyOrdered),
          qty_shipped: row.QtyShipped ? parseFloat(row.QtyShipped) : null,
          status_code: row.StatusCode || 'Open',
          markoff_reason: row.MarkoffReason || null,
          heat_number: row.HeatNumber || null
        }))

        // Delete existing details for these loads first
        const loadIds = [...new Set(details.map(d => d.load_id))]
        await supabase
          .from('load_details')
          .delete()
          .in('load_id', loadIds)

        const { error } = await supabase
          .from('load_details')
          .insert(details)

        if (error) throw error

      } else if (type === 'stops') {
        // Transform and insert stop details
        const stops = data.map(row => ({
          load_id: row.LOAD_ID,
          seq_no: parseInt(row.SeqNo),
          customer_name: row['Cust Name'],
          address: row.Address,
          miles: row.Miles ? parseFloat(row.Miles) : null,
          weight: row.Weight ? parseFloat(row.Weight) : null
        }))

        // Delete existing stops for these loads first
        const loadIds = [...new Set(stops.map(s => s.load_id))]
        await supabase
          .from('stop_details')
          .delete()
          .in('load_id', loadIds)

        const { error } = await supabase
          .from('stop_details')
          .insert(stops)

        if (error) throw error
      }

    } catch (error) {
      console.error(`Error uploading ${type}:`, error)
      throw error
    }
  }

  const handleFileUpload = async (file: File, type: 'loads' | 'details' | 'stops') => {
    try {
      const data = await parseCSVFile(file)
      const validation = validateCSV(data, type)
      
      setUploadStatus(prev => ({
        ...prev,
        [type]: validation
      }))

      if (validation.isValid) {
        await uploadToDatabase(data, type)
      }

      return validation.isValid
    } catch (error) {
      const validation: ValidationResult = {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        rowCount: 0,
        validRows: 0
      }
      
      setUploadStatus(prev => ({
        ...prev,
        [type]: validation
      }))
      
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUploading(true)
    setUploadComplete(false)
    setUploadStatus({})

    try {
      const files = {
        loads: loadsFileRef.current?.files?.[0],
        details: detailsFileRef.current?.files?.[0],
        stops: stopsFileRef.current?.files?.[0]
      }

      // Validate required files
      if (!files.loads) {
        alert('Please select a loads.csv file')
        return
      }

      if (!files.details) {
        alert('Please select a load_details.csv file')
        return
      }

      // Upload loads first
      const loadsSuccess = await handleFileUpload(files.loads, 'loads')
      
      // Upload details second
      const detailsSuccess = await handleFileUpload(files.details, 'details')
      
      // Upload stops if provided
      let stopsSuccess = true
      if (files.stops) {
        stopsSuccess = await handleFileUpload(files.stops, 'stops')
      }

      if (loadsSuccess && detailsSuccess && stopsSuccess) {
        setUploadComplete(true)
        onUploadComplete()
        
        // Clear file inputs
        if (loadsFileRef.current) loadsFileRef.current.value = ''
        if (detailsFileRef.current) detailsFileRef.current.value = ''
        if (stopsFileRef.current) stopsFileRef.current.value = ''
      }

    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsUploading(false)
    }
  }

  const ValidationDisplay = ({ result, title }: { result: ValidationResult, title: string }) => (
    <div className="mt-4 p-4 border rounded-lg">
      <h4 className="font-medium mb-2">{title}</h4>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Total Rows:</span>
          <span>{result.rowCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Valid Rows:</span>
          <span className="text-green-600">{result.validRows}</span>
        </div>
        
        {result.errors.length > 0 && (
          <div className="mt-2">
            <h5 className="text-sm font-medium text-red-600">Errors:</h5>
            <ul className="text-sm text-red-600 list-disc list-inside">
              {result.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        
        {result.warnings.length > 0 && (
          <div className="mt-2">
            <h5 className="text-sm font-medium text-yellow-600">Warnings:</h5>
            <ul className="text-sm text-yellow-600 list-disc list-inside max-h-24 overflow-y-auto">
              {result.warnings.slice(0, 10).map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
              {result.warnings.length > 10 && (
                <li>... and {result.warnings.length - 10} more warnings</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl">
      {uploadComplete && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Upload Successful!</h3>
              <p className="text-sm text-green-700">All files have been processed and imported.</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Loads CSV */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Loads CSV (Required)
          </label>
          <input
            ref={loadsFileRef}
            type="file"
            accept=".csv"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Required columns: LOAD_ID, SHIP_FROM_LOC, STATUS
          </p>
        </div>

        {/* Load Details CSV */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Load Details CSV (Required)
          </label>
          <input
            ref={detailsFileRef}
            type="file"
            accept=".csv"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Required columns: LOAD_ID, Line, ItemDesc, QtyOrdered
          </p>
        </div>

        {/* Stop Details CSV */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stop Details CSV (Optional)
          </label>
          <input
            ref={stopsFileRef}
            type="file"
            accept=".csv"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            Required columns: LOAD_ID, SeqNo, Cust Name, Address
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isUploading}
          className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-${themeColor}-600 hover:bg-${themeColor}-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${themeColor}-500 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </button>
      </form>

      {/* Validation Results */}
      {uploadStatus.loads && (
        <ValidationDisplay result={uploadStatus.loads} title="Loads Validation" />
      )}
      {uploadStatus.details && (
        <ValidationDisplay result={uploadStatus.details} title="Load Details Validation" />
      )}
      {uploadStatus.stops && (
        <ValidationDisplay result={uploadStatus.stops} title="Stop Details Validation" />
      )}
    </div>
  )
}