// components/LoadGrid.tsx - Original with Default Case Fixed
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
  eta?: string
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
            case 'Shipped': return { backgroundColor: '#e0e7ff', color: '#3730a3' }
            case 'Closed': return { backgroundColor: '#f3f4f6', color: '#374151' }
            case 'Cancelled': return { backgroundColor: '#fee2e2', color: '#dc2626' }
            default: return { backgroundColor: '#f9fafb', color: '#374151' }
          }
        }
      },
      {
        field: 'driver_name',
        headerName: 'Driver Name',
        width: 150,
        editable: true,
        cellEditor: 'agTextCellEditor'
      },
      {
  field: 'pu_date',
  headerName: 'Pickup Date',
  width: 200,
  editable: true,
  cellEditor: 'agTextCellEditor',
  cellEditorParams: {
    placeholder: 'MM/DD/YYYY HH:MM AM/PM'
  },
  valueSetter: (params) => {
    // Handle various date formats
    const inputValue = params.newValue
    if (!inputValue) {
      params.data.eta = null
      return true
    }
    
    try {
      // Try to parse the input as a date
      const date = new Date(inputValue)
      if (isNaN(date.getTime())) {
        alert('Invalid date format. Use: MM/DD/YYYY HH:MM AM/PM or YYYY-MM-DD HH:MM')
        return false
      }
      params.data.eta = date.toISOString()
      return true
    } catch (error) {
      alert('Invalid date format. Use: MM/DD/YYYY HH:MM AM/PM or YYYY-MM-DD HH:MM')
      return false
    }
  },
  valueFormatter: (params) => {
    if (params.value) {
      return new Date(params.value).toLocaleString()
    }
    return ''
  }
    },  
      {
        field: 'pu_date',
        headerName: 'PU Date',
        width: 120,
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
        field: 'eta',
        headerName: 'ETA',
        width: 180,
        editable: true,
        cellEditor: 'agDateStringCellEditor',
        valueFormatter: (params) => {
          if (params.value) {
            return new Date(params.value).toLocaleString()
          }
          return ''
        }
      },
      {
        field: 'created_at',
        headerName: 'Created',
        width: 150,
        editable: false,
        valueFormatter: (params) => {
          return new Date(params.value).toLocaleDateString()
        }
      }
    ]

    // Add action column for admins
    if (userProfile.role === 'ADMIN') {
      baseColumns.push({
        headerName: 'Actions',
        width: 120,
        cellRenderer: (params: any) => {
          return `
            <div class="flex space-x-2">
              <button 
                class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                onclick="window.viewDetails('${params.data.load_id}')"
              >
                Details
              </button>
            </div>
          `
        }
      })
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
    onCellValueChanged: handleCellValueChanged,
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

  return (
    <div className="space-y-4">
      
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {statusOptions.map(status => {
          const count = loads.filter(load => load.status === status).length
          return (
            <div key={status} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{count}</div>
              <div className="text-sm text-gray-600">{status}</div>
            </div>
          )
        })}
      </div>

      {/* Bulk Actions (Admin only) */}
      {userProfile.role === 'ADMIN' && selectedRows.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedRows.length} load(s) selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkStatusUpdate('Ready')}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Mark Ready
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('Shipped')}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                Mark Shipped
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('Cancelled')}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AG Grid */}
      <div className="ag-theme-alpine" style={{ height: '500px', width: '100%' }}>
        <AgGridReact
          rowData={loads}
          columnDefs={columnDefs}
          gridOptions={gridOptions}
          rowSelection="multiple"
          suppressRowClickSelection={true}
        />
      </div>

      {/* Grid Footer Info */}
      <div className="text-sm text-gray-500 text-center">
        Showing {loads.length} loads
        {userProfile.location_filter && ` filtered by location: ${userProfile.location_filter}`}
        {userProfile.carrier_filter && ` filtered by carrier: ${userProfile.carrier_filter}`}
        {userProfile.organization === 'Jordan' && ` (Ready/Assigned/Shipped only)`}
      </div>

    </div>
  )
}