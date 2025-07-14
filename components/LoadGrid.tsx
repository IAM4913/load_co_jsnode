// components/LoadGrid.tsx - Enhanced Mobile Support
'use client'

import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { ColDef, GridOptions, CellValueChangedEvent } from 'ag-grid-community'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import { useState, useMemo, useCallback } from 'react'

ModuleRegistry.registerModules([AllCommunityModule])

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

interface UserProfile {
  id: string
  email: string
  role: 'ADMIN' | 'OPERATOR'
  organization: 'Willbanks' | 'WSI' | 'Jordan'
  location_filter?: string
  carrier_filter?: string
}

interface LoadGridProps {
  loads: Load[]
  onUpdateLoad: (loadId: string, updates: Partial<Load>) => void
  onSelectLoad: (loadId: string) => void
  userProfile: UserProfile
  themeColor: string
}

export default function LoadGrid({ 
  loads, 
  onUpdateLoad, 
  onSelectLoad, 
  userProfile,
  themeColor 
}: LoadGridProps) {
  const [selectedRows, setSelectedRows] = useState<Load[]>([])
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  // Status options for dropdown
  const statusOptions = ['Open', 'Ready', 'Assigned', 'Shipped', 'Closed', 'Cancelled']

  // Column definitions based on user role
  const columnDefs: ColDef[] = useMemo(() => {
    const baseColumns: ColDef[] = [
      {
        field: 'load_id',
        headerName: 'Load ID',
        width: 130,
        pinned: 'left',
        cellClass: 'font-medium',
        onCellClicked: (params) => {
          onSelectLoad(params.value)
        },
        cellStyle: { 
          cursor: 'pointer', 
          color: themeColor === 'red' ? '#dc2626' : themeColor === 'blue' ? '#2563eb' : '#059669'
        }
      },
      {
        field: 'ship_from_loc',
        headerName: 'Ship From',
        width: 120,
        editable: false
      },
      {
        field: 'carrier_code',
        headerName: 'Carrier',
        width: 120,
        editable: false
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        editable: userProfile.role === 'ADMIN',
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: statusOptions
        },
        cellStyle: (params) => {
          const status = params.value
          switch (status) {
            case 'Open': return { backgroundColor: '#fef3c7', color: '#92400e' }
            case 'Ready': return { backgroundColor: '#dbeafe', color: '#1e40af' }
            case 'Assigned': return { backgroundColor: '#dcfce7', color: '#166534' }
            case 'Shipped': return { backgroundColor: '#f89e04ff', color: '#3730a3' }
            case 'Closed': return { backgroundColor: '#f3f4f6', color: '#374151' }
            case 'Cancelled': return { backgroundColor: '#fee2e2', color: '#dc2626' }
            default: return { backgroundColor: '#f9fafb', color: '#374151' }
          }
        },
        comparator: (valueA, valueB) => {
          const statusOrder = ['Open', 'Ready', 'Assigned', 'Shipped', 'Closed', 'Cancelled']
          const indexA = statusOrder.indexOf(valueA)
          const indexB = statusOrder.indexOf(valueB)
          
          // If status not found in order, put it at the end
          const orderA = indexA === -1 ? statusOrder.length : indexA
          const orderB = indexB === -1 ? statusOrder.length : indexB
          
          return orderA - orderB
        },
        sort: 'asc'
      },
      {
        field: 'driver_name',
        headerName: 'Driver Name',
        width: 150,
        editable: true,
        cellEditor: 'agTextCellEditor'
      },
      
      {
        field: 'trailer_no',
        headerName: 'Trailer #',
        width: 120,
        editable: true,
        cellEditor: 'agTextCellEditor'
      },
      
      {
        field: 'ship_req_date',
        headerName: 'Requested',
        width: 150,
        editable: false,
        valueFormatter: (params) => {
          return new Date(params.value).toLocaleDateString()
        }
      }
    ]

// REPLACE the entire Actions column block with this simple version:

// Add action column for admins
if (userProfile.role === 'ADMIN') {
  baseColumns.push({
    headerName: 'Actions',
    width: 120,
    field: 'actions', // Add a field
    cellRenderer: () => 'Details', // Simple text only
    cellStyle: { 
      cursor: 'pointer', 
      color: '#2563eb',
      textAlign: 'center',
      fontWeight: '500',
      textDecoration: 'underline'
    },
    onCellClicked: (params) => {
      onSelectLoad(params.data.load_id);
    },
    sortable: false,
    filter: false,
    resizable: false
  });
}
return baseColumns
  }, [userProfile, themeColor, onSelectLoad])

  // Grid options
  const gridOptions: GridOptions = {
  defaultColDef: {
    resizable: true,
    sortable: true,
    filter: true,
    flex: 1,
    minWidth: 100
  },
  rowSelection: 'multiple',
  animateRows: true,
  pagination: true,
  paginationPageSize: 20,
  suppressRowClickSelection: true,
  sortingOrder: ['asc', 'desc'],
  onCellValueChanged: handleCellValueChanged,
  onCellClicked: (event) => {
    // Handle Actions column clicks
    if (event.colDef.headerName === 'Actions' && userProfile.role === 'ADMIN') {
      onSelectLoad(event.data.load_id);
    }
  },
  onSelectionChanged: (event) => {
    const selectedNodes = event.api.getSelectedNodes()
    setSelectedRows(selectedNodes.map(node => node.data))
  }
}

  // Handle cell value changes
  function handleCellValueChanged(event: CellValueChangedEvent) {
    const { data, colDef, newValue, oldValue } = event
    
    if (newValue !== oldValue) {
      const updates: Partial<Load> = {
        [colDef.field!]: newValue
      }

      // Auto-assign status when driver is assigned
      if (colDef.field === 'driver_name') {
        if (newValue && newValue.trim() !== '' && data.status === 'Ready') {
          updates.status = 'Assigned'
        } else if ((!newValue || newValue.trim() === '') && data.status === 'Assigned') {
          updates.status = 'Ready'
        }
      }

      onUpdateLoad(data.load_id, updates)
    }
  }

  // Handle bulk actions
  const handleBulkStatusUpdate = useCallback((newStatus: string) => {
    if (selectedRows.length === 0) {
      alert('Please select one or more loads to update.')
      return
    }

    if (confirm(`Update ${selectedRows.length} load(s) to ${newStatus}?`)) {
      selectedRows.forEach(load => {
        onUpdateLoad(load.load_id, { status: newStatus as Load['status'] })
      })
    }
  }, [selectedRows, onUpdateLoad])

  // Expose viewDetails function globally for button clicks
  if (typeof window !== 'undefined') {
    (window as any).viewDetails = (loadId: string) => {
      onSelectLoad(loadId)
    }
  }

  // Mobile card view for loads
  const renderMobileCard = (load: Load) => {
    const statusColor = {
      'Open': 'border-yellow-400 bg-yellow-50',
      'Ready': 'border-blue-400 bg-blue-50',
      'Assigned': 'border-green-400 bg-green-50',
      'Shipped': 'border-purple-400 bg-purple-50',
      'Closed': 'border-gray-400 bg-gray-50',
      'Cancelled': 'border-red-400 bg-red-50'
    }

    return (
      <div
        key={load.load_id}
        className={`mobile-load-card ${statusColor[load.status]} border-l-4 mb-3`}
        onClick={() => onSelectLoad(load.load_id)}
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-semibold text-gray-900">{load.load_id}</h4>
            <p className="text-sm text-gray-600">{load.ship_from_loc}</p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              load.status === 'Open' ? 'bg-yellow-100 text-yellow-800' :
              load.status === 'Ready' ? 'bg-blue-100 text-blue-800' :
              load.status === 'Assigned' ? 'bg-green-100 text-green-800' :
              load.status === 'Shipped' ? 'bg-purple-100 text-purple-800' :
              load.status === 'Closed' ? 'bg-gray-100 text-gray-800' :
              'bg-red-100 text-red-800'
            }`}>
              {load.status}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Carrier:</span>
            <span className="ml-1 font-medium">{load.carrier_code}</span>
          </div>
          <div>
            <span className="text-gray-500">Requested:</span>
            <span className="ml-1">{new Date(load.ship_req_date).toLocaleDateString()}</span>
          </div>
          {load.driver_name && (
            <div>
              <span className="text-gray-500">Driver:</span>
              <span className="ml-1 font-medium">{load.driver_name}</span>
            </div>
          )}
          {load.trailer_no && (
            <div>
              <span className="text-gray-500">Trailer:</span>
              <span className="ml-1 font-medium">{load.trailer_no}</span>
            </div>
          )}
        </div>
        
        {userProfile.role === 'ADMIN' && (
          <div className="mobile-form-controls">
            <input
              type="text"
              placeholder="Driver name..."
              value={load.driver_name || ''}
              onChange={(e) => handleMobileCellEdit(load.load_id, 'driver_name', e.target.value)}
              className="mobile-form-select focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="text"
              placeholder="Trailer..."
              value={load.trailer_no || ''}
              onChange={(e) => handleMobileCellEdit(load.load_id, 'trailer_no', e.target.value)}
              className="mobile-form-select focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
            <select
              value={load.status}
              onChange={(e) => handleMobileCellEdit(load.load_id, 'status', e.target.value)}
              className="mobile-form-select focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            >
              {statusOptions.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    )
  }

  // Handle cell value changes for mobile inputs
  const handleMobileCellEdit = (loadId: string, field: string, value: string) => {
    const updates: Partial<Load> = {
      [field]: value
    }

    // Auto-assign status when driver is assigned (mobile)
    if (field === 'driver_name') {
      const load = loads.find(l => l.load_id === loadId)
      if (load) {
        if (value && value.trim() !== '' && load.status === 'Ready') {
          updates.status = 'Assigned'
        } else if ((!value || value.trim() === '') && load.status === 'Assigned') {
          updates.status = 'Ready'
        }
      }
    }

    onUpdateLoad(loadId, updates)
  }

  return (
    <div className="space-y-4">
      
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4">
        {statusOptions.map(status => {
          const count = loads.filter(load => load.status === status).length
          return (
            <div key={status} className="status-card-mobile md:bg-gray-50 md:rounded-lg md:p-3 md:text-center">
              <div className="text-lg md:text-2xl font-bold text-gray-900">{count}</div>
              <div className="text-xs md:text-sm text-gray-600">{status}</div>
            </div>
          )
        })}
      </div>

      {/* View Toggle (Mobile) */}
      <div className="md:hidden flex justify-center">
        <div className="bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              viewMode === 'cards' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              viewMode === 'table' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Bulk Actions (Admin only) */}
      {userProfile.role === 'ADMIN' && selectedRows.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-2 md:space-y-0">
            <span className="text-sm font-medium text-blue-900">
              {selectedRows.length} load(s) selected
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleBulkStatusUpdate('Ready')}
                className="mobile-button px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Mark Ready
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('Shipped')}
                className="mobile-button px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                Mark Shipped
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('Cancelled')}
                className="mobile-button px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Cards View */}
      {viewMode === 'cards' && (
        <div className="md:hidden space-y-3">
          {loads.map(load => renderMobileCard(load))}
        </div>
      )}

      {/* Desktop AG Grid / Mobile Table View */}
      <div className={`${viewMode === 'table' ? 'block' : 'hidden md:block'}`}>
        <div className="ag-theme-alpine" style={{ height: '400px', width: '100%' }}>
          <AgGridReact
            rowData={loads}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onSelectionChanged={(event) => {
              setSelectedRows(event.api.getSelectedRows())
            }}
          />
        </div>
      </div>

      {/* Grid Footer Info */}
      <div className="text-sm text-gray-500 text-center">
        Showing {loads.length} loads
        {userProfile.location_filter && ` filtered by location: ${userProfile.location_filter}`}
        {userProfile.carrier_filter && ` filtered by carrier: ${userProfile.carrier_filter}`}
        {userProfile.organization === 'Jordan' && ` (Ready/Assigned/Shipped only)`}
      </div>

    </div>
  )}