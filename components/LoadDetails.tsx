// components/LoadDetails.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient, logCustomAuditEvent } from '@/lib/supabase'
import AuditHistory from '@/components/AuditHistory'
import jsPDF from 'jspdf'

interface LoadDetail {
  id: string
  load_id: string
  line: number
  item_desc: string | null
  qty_ordered: number | null
  qty_shipped: number | null
  status_code: 'Open' | 'Loaded' | 'Marked_Off'
  markoff_reason: string | null
  heat_number: string | null
}

interface StopDetail {
  id: string
  load_id: string
  seq_no: number
  customer_name: string | null
  address: string | null
  miles: number | null
  weight: number | null
}

interface LoadDetailsProps {
  loadId: string
  userProfile: {
    role: 'ADMIN' | 'OPERATOR'
    organization: 'Willbanks' | 'WSI' | 'Jordan'
    email?: string
    id: string
  }
  onUpdate: () => void
  themeColor: string
}

export default function LoadDetails({ loadId, userProfile, onUpdate, themeColor }: LoadDetailsProps) {
  const [loadDetails, setLoadDetails] = useState<LoadDetail[]>([])
  const [stopDetails, setStopDetails] = useState<StopDetail[]>([])
  const [load, setLoad] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [trailerNumber, setTrailerNumber] = useState('')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [showAuditHistory, setShowAuditHistory] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [loadId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load main load data
      const { data: loadData, error: loadError } = await supabase
        .from('loads')
        .select('*')
        .eq('load_id', loadId)
        .single()

      if (loadError) throw loadError
      setLoad(loadData)
      setTrailerNumber(loadData.trailer_no || '')
      setIsConfirmed(loadData.status !== 'Open')

      // Load line items
      const { data: detailsData, error: detailsError } = await supabase
        .from('load_details')
        .select('*')
        .eq('load_id', loadId)
        .order('line')

      if (detailsError) throw detailsError
      setLoadDetails(detailsData || [])

      // Load stop details
      const { data: stopsData, error: stopsError } = await supabase
        .from('stop_details')
        .select('*')
        .eq('load_id', loadId)
        .order('seq_no')

      if (stopsError) throw stopsError
      setStopDetails(stopsData || [])

    } catch (error) {
      console.error('Error loading load details:', error)
      alert('Error loading load details: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const updateLineItem = async (detailId: string, field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('load_details')
        .update({ [field]: value })
        .eq('id', detailId)

      if (error) throw error
      
      // Refresh data
      loadData()
    } catch (error) {
      console.error('Error updating line item:', error)
      alert('Error updating line item: ' + (error as Error).message)
    }
  }

  const validateConfirmation = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []

    // Check trailer number
    if (!trailerNumber || trailerNumber.trim() === '') {
      errors.push('Trailer number is required')
    } else if (!/^\d+$/.test(trailerNumber.trim())) {
      errors.push('Trailer number must be numeric')
    }

    // Check all lines are processed
    const unprocessedLines = loadDetails.filter(detail => detail.status_code === 'Open')
    if (unprocessedLines.length > 0) {
      errors.push(`${unprocessedLines.length} line(s) still marked as "Open"`)
    }

    // Check marked off lines have reasons
    const markedOffWithoutReason = loadDetails.filter(
      detail => detail.status_code === 'Marked_Off' && (!detail.markoff_reason || detail.markoff_reason.trim() === '')
    )
    if (markedOffWithoutReason.length > 0) {
      errors.push(`${markedOffWithoutReason.length} marked-off line(s) missing reason`)
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  const confirmLoad = async () => {
    const validation = validateConfirmation()
    
    if (!validation.isValid) {
      alert('Cannot confirm load:\n' + validation.errors.join('\n'))
      return
    }

    if (!confirm('Confirm this load as Ready? This will generate documents and notify dispatch.')) {
      return
    }

    setSaving(true)
    try {
      // Update load with trailer number and Ready status
      const { error: loadError } = await supabase
        .from('loads')
        .update({
          trailer_no: trailerNumber,
          status: 'Ready',
          updated_at: new Date().toISOString()
        })
        .eq('load_id', loadId)

      if (loadError) throw loadError

      // Log custom audit event
      await logCustomAuditEvent(
        loadId,
        'Load Confirmed',
        `Load confirmed with trailer ${trailerNumber}. Generated documents.`,
        userProfile.email || userProfile.id
      )

      // Generate confirmed CSV
      await generateConfirmedCSV()
      
      // Generate loading docs PDF
      await generateLoadingDocsPDF()

      setIsConfirmed(true)
      onUpdate()
      
      alert('Load confirmed successfully! Documents have been generated.')

    } catch (error) {
      console.error('Error confirming load:', error)
      alert('Error confirming load: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const generateConfirmedCSV = async () => {
    const csvContent = [
      // Header
      ['Load ID', 'Line', 'Item Description', 'Qty Ordered', 'Qty Shipped', 'Status', 'Markoff Reason', 'Heat Number'].join(','),
      // Data rows
      ...loadDetails.map(detail => [
        detail.load_id,
        detail.line,
        `"${detail.item_desc || ''}"`,
        detail.qty_ordered || '',
        detail.qty_shipped || detail.qty_ordered || '',
        detail.status_code,
        `"${detail.markoff_reason || ''}"`,
        detail.heat_number || ''
      ].join(','))
    ].join('\n')

    // Create and download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `confirmed_${loadId}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const generateLoadingDocsPDF = async () => {
    const pdf = new jsPDF()
    
    // Header
    pdf.setFontSize(16)
    pdf.text('LOADING DOCUMENTS', 20, 20)
    
    pdf.setFontSize(12)
    pdf.text(`Load ID: ${loadId}`, 20, 35)
    pdf.text(`Trailer: ${trailerNumber || 'TBD'}`, 20, 45)
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, 20, 55)
    
    // Line items table
    pdf.setFontSize(10)
    let yPosition = 75
    
    // Table headers - Updated to include Heat Number
    pdf.text('Line', 20, yPosition)
    pdf.text('Description', 40, yPosition)
    pdf.text('Heat #', 120, yPosition)
    pdf.text('Qty Ordered', 150, yPosition)
    pdf.text('Status', 180, yPosition)
    
    yPosition += 10
    
    // Table data
    loadDetails.forEach((detail, index) => {
      if (yPosition > 250) {
        pdf.addPage()
        yPosition = 20
        // Re-add headers on new page
        pdf.setFontSize(10)
        pdf.text('Line', 20, yPosition)
        pdf.text('Description', 40, yPosition)
        pdf.text('Heat #', 120, yPosition)
        pdf.text('Qty Ordered', 150, yPosition)
        pdf.text('Status', 180, yPosition)
        yPosition += 10
      }
      
      pdf.text(String(detail.line), 20, yPosition)
      pdf.text(detail.item_desc?.substring(0, 30) || '', 40, yPosition)
      pdf.text(detail.heat_number || '', 120, yPosition)
      pdf.text(String(detail.qty_ordered || ''), 150, yPosition)
      pdf.text(detail.status_code, 180, yPosition)
      
      if (detail.markoff_reason) {
        yPosition += 7
        pdf.setFontSize(8)
        pdf.text(`Reason: ${detail.markoff_reason}`, 40, yPosition)
        pdf.setFontSize(10)
      }
      
      yPosition += 10
    })
    
    // Download PDF
    pdf.save(`Loading_Docs_${loadId}.pdf`)

    // Log audit event
    await logCustomAuditEvent(
      loadId,
      'Document Generated',
      'Loading Documents PDF generated',
      userProfile.email || userProfile.id
    )
  }

  const generateBOL = async () => {
    if (stopDetails.length === 0) {
      alert('No stop details available for Bill of Lading generation')
      return
    }

    const pdf = new jsPDF('landscape')
    
    // Header
    pdf.setFontSize(16)
    pdf.text('BILL OF LADING', 20, 20)
    
    pdf.setFontSize(12)
    pdf.text(`Load ID: ${loadId}`, 20, 35)
    pdf.text(`Driver: ${load?.driver_name || 'TBD'}`, 120, 35)
    pdf.text(`Trailer: ${trailerNumber}`, 220, 35)
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50)
    
    // Stop details table
    pdf.setFontSize(10)
    let yPosition = 70
    
    // Table headers
    pdf.text('Stop', 20, yPosition)
    pdf.text('Customer', 50, yPosition)
    pdf.text('Address', 120, yPosition)
    pdf.text('Miles', 220, yPosition)
    pdf.text('Weight', 250, yPosition)
    
    yPosition += 10
    
    // Calculate totals
    let totalMiles = 0
    let totalWeight = 0
    
    // Table data
    stopDetails.forEach((stop) => {
      if (yPosition > 180) {
        pdf.addPage()
        yPosition = 20
      }
      
      pdf.text(String(stop.seq_no), 20, yPosition)
      pdf.text(stop.customer_name?.substring(0, 25) || '', 50, yPosition)
      pdf.text(stop.address?.substring(0, 35) || '', 120, yPosition)
      pdf.text(String(stop.miles || ''), 220, yPosition)
      pdf.text(String(stop.weight || ''), 250, yPosition)
      
      totalMiles += stop.miles || 0
      totalWeight += stop.weight || 0
      
      yPosition += 10
    })
    
    // Totals
    yPosition += 10
    pdf.setFontSize(12)
    pdf.text(`Total Miles: ${totalMiles.toFixed(1)}`, 20, yPosition)
    pdf.text(`Total Weight: ${totalWeight.toFixed(0)} lbs`, 120, yPosition)
    
    // Download PDF
    pdf.save(`BOL_${loadId}.pdf`)

    // Log audit event
    await logCustomAuditEvent(
      loadId,
      'Document Generated',
      'Bill of Lading PDF generated',
      userProfile.email || userProfile.id
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading details...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      
      {/* Load Summary */}
      <div className="bg-gray-50 rounded-lg p-3 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Load ID</label>
            <div className="text-lg font-semibold">{loadId}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Ship From</label>
            <div className="text-sm md:text-base">{load?.ship_from_loc}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Requested</label>
            <div className="text-sm md:text-base">{load?.ship_req_date ? new Date(load.ship_req_date).toLocaleDateString() : 'N/A'}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <div className={`inline-flex items-center px-2 py-1 rounded text-sm ${
              load?.status === 'Open' ? 'bg-yellow-100 text-yellow-800' :
              load?.status === 'Ready' ? 'bg-blue-100 text-blue-800' :
              load?.status === 'Assigned' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {load?.status}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Carrier</label>
            <div className="text-sm md:text-base">{load?.carrier_code || 'TBD'}</div>
          </div>
        </div>
      </div>

      {/* Trailer Number */}
      <div className="bg-white border rounded-lg p-3 md:p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Trailer Number *
        </label>
        <input
          type="text"
          value={trailerNumber}
          onChange={(e) => setTrailerNumber(e.target.value)}
          disabled={isConfirmed}
          placeholder="Enter trailer number"
          className="mobile-input w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <p className="mt-1 text-xs text-gray-500">Must be numeric</p>
      </div>

      {/* Line Items - Mobile Cards */}
      <div className="md:hidden bg-white border rounded-lg overflow-hidden">
        <div className="px-3 py-3 bg-gray-50 border-b">
          <h4 className="text-base font-medium">Line Items ({loadDetails.length})</h4>
        </div>
        
        <div className="space-y-3 p-3">
          {loadDetails.map((detail) => (
            <div key={detail.id} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm">Line {detail.line}</div>
                <div className={`px-2 py-1 rounded text-xs ${
                  detail.status_code === 'Open' ? 'bg-yellow-100 text-yellow-800' :
                  detail.status_code === 'Loaded' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {detail.status_code.replace('_', ' ')}
                </div>
              </div>
              
              <div className="text-sm text-gray-900 mb-2">{detail.item_desc}</div>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-medium">Heat #:</span> {detail.heat_number || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Qty:</span> {detail.qty_ordered || 'N/A'}
                </div>
              </div>
              
              {detail.markoff_reason && (
                <div className="mt-2 text-xs text-red-600">
                  <span className="font-medium">Reason:</span> {detail.markoff_reason}
                </div>
              )}
              
              {/* Mobile buttons available to all users (same as desktop dropdown) */}
              <div className="mt-3 space-y-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => updateLineItem(detail.id, 'status_code', 'Open')}
                    disabled={isConfirmed}
                    className="flex-1 mobile-button px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => updateLineItem(detail.id, 'status_code', 'Loaded')}
                    disabled={isConfirmed}
                    className="flex-1 mobile-button px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Loaded
                  </button>
                  <button
                    onClick={() => updateLineItem(detail.id, 'status_code', 'Marked_Off')}
                    disabled={isConfirmed}
                    className="flex-1 mobile-button px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark Off
                  </button>
                </div>
                
                {/* Reason input for marked off items */}
                {detail.status_code === 'Marked_Off' && (
                  <input
                    type="text"
                    value={detail.markoff_reason || ''}
                    onChange={(e) => updateLineItem(detail.id, 'markoff_reason', e.target.value)}
                    disabled={isConfirmed}
                    placeholder="Enter reason for marking off"
                    className="mobile-form-select text-xs focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Line Items - Desktop Table */}
      <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h4 className="text-lg font-medium">Line Items ({loadDetails.length})</h4>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Line</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Heat #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty Ordered</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadDetails.map((detail) => (
                <tr key={detail.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {detail.line}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {detail.item_desc}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {detail.heat_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {detail.qty_ordered}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={detail.status_code}
                      onChange={(e) => updateLineItem(detail.id, 'status_code', e.target.value)}
                      disabled={isConfirmed}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    >
                      <option value="Open">Open</option>
                      <option value="Loaded">Loaded</option>
                      <option value="Marked_Off">Marked Off</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {detail.status_code === 'Marked_Off' ? (
                      <input
                        type="text"
                        value={detail.markoff_reason || ''}
                        onChange={(e) => updateLineItem(detail.id, 'markoff_reason', e.target.value)}
                        disabled={isConfirmed}
                        placeholder="Enter reason"
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        
        {/* View History Button - Always Visible */}
        <button
          onClick={() => setShowAuditHistory(true)}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          📋 View History
        </button>

        {/* Print Loading Docs Button - Available even before confirmation */}
        {loadDetails.length > 0 && (
          <button
            onClick={generateLoadingDocsPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            📄 Print Loading Docs
          </button>
        )}

        {/* Confirm Load Button - Only shown when not confirmed */}
        {!isConfirmed && (
          <button
            onClick={confirmLoad}
            disabled={saving}
            className={`px-4 py-2 bg-${themeColor}-600 text-white rounded-md hover:bg-${themeColor}-700 focus:outline-none focus:ring-2 focus:ring-${themeColor}-500 disabled:opacity-50`}
          >
            {saving ? 'Confirming...' : 'Confirm Load'}
          </button>
        )}
      </div>

      {/* Stop Details (if available) */}
      {stopDetails.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h4 className="text-lg font-medium">Stop Details ({stopDetails.length})</h4>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stop</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Miles</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stopDetails.map((stop) => (
                  <tr key={stop.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {stop.seq_no}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {stop.customer_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {stop.address}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {stop.miles}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {stop.weight}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="px-4 py-3 bg-gray-50 border-t">
            <div className="flex justify-between text-sm font-medium">
              <span>
                Total Miles: {stopDetails.reduce((sum, stop) => sum + (stop.miles || 0), 0).toFixed(1)}
              </span>
              <span>
                Total Weight: {stopDetails.reduce((sum, stop) => sum + (stop.weight || 0), 0).toFixed(0)} lbs
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Print BOL Button - Always visible, positioned after stop details */}
      <div className="flex justify-center">
        <button
          onClick={generateBOL}
          className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium shadow-md"
        >
          📊 Print Bill of Lading
        </button>
      </div>

      {/* Audit History Modal */}
      <AuditHistory
        loadId={loadId}
        isOpen={showAuditHistory}
        onClose={() => setShowAuditHistory(false)}
      />
    </div>
  )
}