// components/AuditHistory.tsx
'use client'

import { useState, useEffect } from 'react'
import { getAuditHistory, getStatusHistory } from '@/lib/supabase'

interface AuditEvent {
  id: string
  user_email: string | null
  table_name: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

interface StatusEvent {
  id: string
  old_status: string | null
  new_status: string
  changed_by_email: string | null
  changed_at: string
  notes: string | null
}

interface AuditHistoryProps {
  loadId: string
  isOpen: boolean
  onClose: () => void
}

export default function AuditHistory({ loadId, isOpen, onClose }: AuditHistoryProps) {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'status'>('all')

  useEffect(() => {
    if (isOpen && loadId) {
      loadAuditData()
    }
  }, [isOpen, loadId])

  const loadAuditData = async () => {
    setLoading(true)
    try {
      const [auditData, statusData] = await Promise.all([
        getAuditHistory(loadId),
        getStatusHistory(loadId)
      ])
      
      setAuditEvents(auditData)
      setStatusEvents(statusData)
    } catch (error) {
      console.error('Error loading audit data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatFieldName = (fieldName: string | null) => {
    if (!fieldName) return 'Unknown Field'
    
    const fieldMap: { [key: string]: string } = {
      'status': 'Status',
      'driver_name': 'Driver Name',
      'trailer_no': 'Trailer Number',
      'eta': 'ETA',
      'record_created': 'Load Created',
      'record_deleted': 'Load Deleted',
      'custom_action': 'Custom Action'
    }
    
    // Handle line item fields
    if (fieldName.includes('line_') && fieldName.includes('_status')) {
      const lineNum = fieldName.split('_')[1]
      return `Line ${lineNum} Status`
    }
    
    if (fieldName.includes('line_') && fieldName.includes('_reason')) {
      const lineNum = fieldName.split('_')[1]
      return `Line ${lineNum} Reason`
    }
    
    return fieldMap[fieldName] || fieldName
  }

  const formatValue = (value: string | null) => {
    if (!value || value === '') return '(empty)'
    if (value.length > 50) return value.substring(0, 50) + '...'
    return value
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE': return '✨'
      case 'UPDATE': return '✏️'
      case 'DELETE': return '🗑️'
      default: return '📝'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-yellow-100 text-yellow-800'
      case 'Ready': return 'bg-blue-100 text-blue-800'
      case 'Assigned': return 'bg-green-100 text-green-800'
      case 'Shipped': return 'bg-purple-100 text-purple-800'
      case 'Closed': return 'bg-gray-100 text-gray-800'
      case 'Cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Audit History - {loadId}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 font-medium text-sm border-b-2 ${
              activeTab === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Changes ({auditEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 font-medium text-sm border-b-2 ${
              activeTab === 'status'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Status History ({statusEvents.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-96">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading audit history...</span>
            </div>
          ) : (
            <>
              {/* All Changes Tab */}
              {activeTab === 'all' && (
                <div className="space-y-3">
                  {auditEvents.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No audit events found</p>
                  ) : (
                    auditEvents.map((event) => (
                      <div key={event.id} className="bg-gray-50 rounded-lg p-3 border-l-4 border-blue-400">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">{getActionIcon(event.action)}</span>
                              <span className="font-medium text-gray-900">
                                {formatFieldName(event.field_name)}
                              </span>
                              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                {event.action}
                              </span>
                            </div>
                            
                            {event.action === 'UPDATE' && event.old_value && event.new_value && (
                              <div className="mt-2 text-sm">
                                <span className="text-gray-600">Changed from:</span>
                                <span className="mx-2 bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                                  {formatValue(event.old_value)}
                                </span>
                                <span className="text-gray-600">to:</span>
                                <span className="mx-2 bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                  {formatValue(event.new_value)}
                                </span>
                              </div>
                            )}
                            
                            {event.action === 'CREATE' && (
                              <div className="mt-2 text-sm text-green-600">
                                {event.new_value || 'Record created'}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-right text-xs text-gray-500 ml-4">
                            <div>{event.user_email || 'Unknown User'}</div>
                            <div>{new Date(event.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Status History Tab */}
              {activeTab === 'status' && (
                <div className="space-y-3">
                  {statusEvents.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No status changes found</p>
                  ) : (
                    statusEvents.map((event, index) => (
                      <div key={event.id} className="bg-gray-50 rounded-lg p-3 border-l-4 border-green-400">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="text-lg">🔄</span>
                            <div>
                              <div className="flex items-center space-x-2">
                                {event.old_status && (
                                  <>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(event.old_status)}`}>
                                      {event.old_status}
                                    </span>
                                    <span className="text-gray-400">→</span>
                                  </>
                                )}
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(event.new_status)}`}>
                                  {event.new_status}
                                </span>
                              </div>
                              {event.notes && (
                                <div className="text-sm text-gray-600 mt-1">{event.notes}</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-right text-xs text-gray-500">
                            <div>{event.changed_by_email || 'Unknown User'}</div>
                            <div>{new Date(event.changed_at).toLocaleString()}</div>
                          </div>
                        </div>
                        
                        {/* Timeline connector */}
                        {index < statusEvents.length - 1 && (
                          <div className="ml-6 mt-2 mb-1">
                            <div className="w-px h-4 bg-gray-300"></div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            Total Events: {auditEvents.length} | Status Changes: {statusEvents.length}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}