import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ClassifiedRow } from '../lib/types';
import { COLUMNS, MORNING_STATUS_OPTIONS } from '../lib/types';
import { useStore } from '../store/useStore';
import { realtimeClient } from '../api/websocket';
import { Search, X, Plus, Info, Filter, Check, SortAsc, SortDesc } from 'lucide-react';

const COLUMN_KEY_MAP: Record<string, keyof ClassifiedRow> = {
  'Month': 'month',
  'Ticket No': 'ticketNo',
  'Case Id': 'caseId',
  'WO OTC Code': 'woOtcCode',
  'Product': 'product',
  'WIP Aging': 'wipAging',
  'Location': 'location',
  'Segment': 'segment',
  'HP Owner': 'hpOwner',
  'Flex Status': 'flexStatus',
  'Morning Report': 'morningStatus',
  'Evening Report': 'eveningStatus',
  'Current Status-TAT': 'currentStatusTAT',
  'Engg.': 'engg',
  'Contact no.': 'contactNo',
  'Parts': 'parts',
  'WIP Changed': 'wipChanged'
};

interface DataTableProps {
  data: ClassifiedRow[];
  isDroppedTab: boolean;
  onAddRow?: () => void;
}

export default function DataTable({ data, isDroppedTab, onAddRow }: DataTableProps) {
  const { updateRow, engineers, selectedCity } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Excel Filter State
  const [sortConfig, setSortConfig] = useState<{ key: keyof ClassifiedRow; direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setActiveFilterColumn(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const processedData = useMemo(() => {
    let result = data;

    // 1. Global Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row => (
        row.ticketNo.toLowerCase().includes(query) ||
        (row.woOtcCode && row.woOtcCode.toLowerCase().includes(query)) ||
        row.caseId.toLowerCase().includes(query) ||
        row.location.toLowerCase().includes(query) ||
        row.product.toLowerCase().includes(query) ||
        (row.engg && row.engg.toLowerCase().includes(query))
      ));
    }

    // 2. Column Filters
    Object.entries(columnFilters).forEach(([colName, selectedValues]) => {
      if (selectedValues.size > 0) {
        const key = COLUMN_KEY_MAP[colName];
        if (key) {
          result = result.filter(row => {
            const val = String(row[key] || '');
            return selectedValues.has(val);
          });
        }
      }
    });

    // 3. Sorting
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined || aVal === '') return 1;
        if (bVal === null || bVal === undefined || bVal === '') return -1;
        
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
           comparison = aVal - bVal;
        } else {
           comparison = String(aVal).localeCompare(String(bVal));
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchQuery, columnFilters, sortConfig]);

  const filteredData = processedData; // Keep original reference name

  const handleFilterToggle = (colName: string, value: string) => {
    setColumnFilters(prev => {
      const current = new Set(prev[colName] || new Set());
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...prev, [colName]: current };
    });
  };

  const handleSelectAll = (colName: string, values: string[]) => {
    setColumnFilters(prev => {
       const current = prev[colName];
       if (current && current.size === values.length) {
         // Deselect all
         const updated = { ...prev };
         delete updated[colName];
         return updated;
       } else {
         // Select all
         return { ...prev, [colName]: new Set(values) };
       }
    });
  };

  const getUniqueValuesForColumn = (colName: string) => {
    const key = COLUMN_KEY_MAP[colName];
    if (!key) return [];
    // Only get unique values from currently filtered data EXCEPT the column we are filtering on to allow wider selections.
    // For true Excel behavior, we get unique values from the base data.
    const vals = data.map(r => String(r[key] || ''));
    return Array.from(new Set(vals)).sort();
  };

  if (data.length === 0 && !searchQuery) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-gray-500 bg-gray-900/40 relative rounded-xl border border-dashed border-gray-700/50 m-4">
        <div className="p-4 bg-gray-800/40 rounded-full mb-4">
          <Info className="h-8 w-8 text-blue-400" />
        </div>
        <p className="font-medium text-gray-300">No records found for this view.</p>
        <p className="text-xs text-gray-500 mt-1">Check if current city is set to <span className="text-blue-400 font-bold underline">"{selectedCity}"</span> in your Flex Report.</p>
        
        {onAddRow && !isDroppedTab && (
          <button
            onClick={onAddRow}
            className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-purple-900/30"
          >
            <Plus className="h-4 w-4" />
            Add First Work Order Manually
          </button>
        )}
      </div>
    );
  }

  // Determine row color based on classification
  const getRowClass = (klass: string) => {
    switch (klass) {
      case 'PENDING': return 'border-l-4 border-l-amber-500/80 bg-amber-500/5 hover:bg-amber-500/10';
      case 'NEW': return 'border-l-4 border-l-green-500/80 bg-green-500/5 hover:bg-green-500/10';
      case 'DROPPED': return 'border-l-4 border-l-red-500/80 bg-red-500/5 hover:bg-red-500/10 opacity-70';
      default: return 'hover:bg-gray-800/40 border-l-4 border-l-transparent';
    }
  };

  // Broadcast editing activity (debounced)
  const activityTimer = useRef<ReturnType<typeof setTimeout>>();
  const broadcastEditing = useCallback((detail: string) => {
    realtimeClient.sendActivity({ action: 'editing', detail });
    clearTimeout(activityTimer.current);
    // Revert to "viewing" after 3s of inactivity
    activityTimer.current = setTimeout(() => {
      realtimeClient.sendActivity({ action: 'viewing' });
    }, 3000);
  }, []);

  const handleChange = (
    ticketNo: string,
    field: keyof ClassifiedRow,
    value: string | number
  ) => {
    updateRow(ticketNo, field, value);
    broadcastEditing(`${field} on ${ticketNo}`);
  };

  return (
    <div className="w-full flex flex-col">
      {/* Search & Action Header */}
      <div className="bg-gray-800/40 p-3 border-b border-gray-700/50 flex items-center justify-between gap-4 sticky left-0 z-20">
        <div className="relative flex-1 max-w-md group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-400">
            <Search className="h-4 w-4 text-gray-500 transition-colors" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-9 pr-10 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all border-none"
            placeholder="Search by Ticket, OTC, Case Id, Area..."
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onAddRow && !isDroppedTab && (
            <button
              onClick={onAddRow}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-all text-purple-400 font-bold text-xs whitespace-nowrap shadow-sm shadow-purple-900/10"
            >
              <Plus className="h-3 w-3" />
              Add WO
            </button>
          )}
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold px-2 hidden sm:block">
            {filteredData.length} of {data.length} Rows Showing
          </div>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-gray-500 bg-gray-900/40">
          <p>No results matching "{searchQuery}" in this view.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-800/80 text-gray-400 font-medium sticky top-0 z-10 shadow-sm text-xs uppercase tracking-tight">
              <tr>
                <th className="px-4 py-3">Type</th>
                {COLUMNS.map((col) => (
                  <th key={col} className="px-4 py-3 border-l border-gray-700/50 relative isolate">
                    <div className="flex items-center justify-between gap-2 group/th">
                      <span>{col}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFilterSearchQuery(''); setActiveFilterColumn(activeFilterColumn === col ? null : col); }}
                        className={`p-1 rounded transition-colors ${columnFilters[col]?.size > 0 ? 'bg-blue-500/20 text-blue-400 opacity-100' : 'text-gray-500 hover:bg-gray-700 hover:text-white opacity-0 group-hover/th:opacity-100'}`}
                      >
                        <Filter className="h-3 w-3" />
                      </button>
                    </div>

                    {activeFilterColumn === col && (
                      <div ref={filterRef} className="absolute top-10 left-0 w-64 bg-gray-950/95 backdrop-blur-3xl border border-gray-700 shadow-2xl rounded-xl z-[150] overflow-hidden flex flex-col font-sans normal-case tracking-normal animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2 border-b border-gray-800 space-y-1">
                          <button onClick={() => setSortConfig({ key: COLUMN_KEY_MAP[col], direction: 'asc' })} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
                            <SortAsc className="h-3.5 w-3.5" /> Sort A to Z
                          </button>
                          <button onClick={() => setSortConfig({ key: COLUMN_KEY_MAP[col], direction: 'desc' })} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
                            <SortDesc className="h-3.5 w-3.5" /> Sort Z to A
                          </button>
                        </div>
                        <div className="p-2 border-b border-gray-800">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3 w-3 text-gray-500" />
                            <input 
                              type="text" 
                              value={filterSearchQuery}
                              onChange={(e) => setFilterSearchQuery(e.target.value)}
                              placeholder="Search..." 
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg py-1.5 pl-8 pr-3 text-xs text-gray-200 placeholder:text-gray-600 focus:border-blue-500 transition-colors focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex-1 max-h-[250px] overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                           <div className="group">
                             <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
                               <input type="checkbox" className="hidden" checked={columnFilters[col]?.size === getUniqueValuesForColumn(col).length} onChange={() => handleSelectAll(col, getUniqueValuesForColumn(col))} />
                               <div className={`h-4 w-4 rounded shrink-0 border flex items-center justify-center transition-colors ${columnFilters[col]?.size === getUniqueValuesForColumn(col).length ? 'bg-blue-500 border-blue-500' : 'bg-gray-900 border-gray-600 group-hover:border-blue-400'}`}>
                                  {columnFilters[col]?.size === getUniqueValuesForColumn(col).length && <Check className="h-3 w-3 text-white" />}
                               </div>
                               <span className="font-semibold text-gray-200">(Select All)</span>
                             </label>
                           </div>
                           {getUniqueValuesForColumn(col).filter(v => v.toLowerCase().includes(filterSearchQuery.toLowerCase())).map(val => {
                             const isSelected = columnFilters[col]?.has(val);
                             return (
                               <div key={val} className="group">
                                 <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
                                   <input type="checkbox" className="hidden" checked={isSelected || false} onChange={() => handleFilterToggle(col, val)} />
                                   <div className={`h-4 w-4 rounded shrink-0 border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-gray-900 border-gray-600 group-hover:border-blue-400'}`}>
                                      {isSelected && <Check className="h-3 w-3 text-white" />}
                                   </div>
                                   <span className="truncate">{val || '(Blank)'}</span>
                                 </label>
                               </div>
                             );
                           })}
                        </div>
                        <div className="p-2 border-t border-gray-800 flex justify-end gap-2 bg-gray-900/50">
                          <button onClick={() => setActiveFilterColumn(null)} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
                          <button onClick={() => setActiveFilterColumn(null)} className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-900/20 transition-all">OK</button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filteredData.map((row) => (
                <tr key={row.ticketNo} className={`transition-colors ${getRowClass(row.classification)}`}>
                  <td className="px-4 py-3 font-semibold text-[10px] tracking-wider uppercase">
                    {row.classification === 'PENDING' && <span className="text-amber-500">PENDING</span>}
                    {row.classification === 'NEW' && <span className="text-green-500">NEW</span>}
                    {row.classification === 'DROPPED' && <span className="text-red-500">CLOSED(OTB)</span>}
                  </td>

                  <td className="px-4 py-3 text-gray-400">{row.month || '-'}</td>
                  <td className="px-4 py-3 font-mono text-gray-200">{row.ticketNo}</td>
                  <td className="px-4 py-3 text-gray-300">{row.caseId}</td>
                  <td className="px-4 py-3 text-purple-400 font-medium">{row.woOtcCode || '-'}</td>
                  <td className="px-4 py-3 truncate max-w-[200px]" title={row.product}>{row.product}</td>

                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${row.wipAging > 5 ? 'bg-red-500/20 text-red-400' : 'bg-gray-700/50 text-gray-300'}`}>
                      {row.wipAging}
                    </span>
                  </td>

                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.location}
                      onChange={(e) => handleChange(row.ticketNo, 'location', e.target.value)}
                      disabled={isDroppedTab}
                      placeholder="Area..."
                      className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all disabled:opacity-50"
                    />
                  </td>

                  <td className="px-4 py-3 text-blue-400 font-medium">{row.segment}</td>
                  <td className="px-4 py-3 text-gray-300">{row.hpOwner || '-'}</td>
                  <td className="px-4 py-3 text-gray-300 italic text-[11px]">{row.flexStatus || '-'}</td>

                  <td className="px-2 py-2">
                    <select
                      value={row.morningStatus}
                      onChange={(e) => handleChange(row.ticketNo, 'morningStatus', e.target.value)}
                      disabled={isDroppedTab}
                      className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all appearance-none cursor-pointer disabled:opacity-50"
                      style={{ backgroundImage: 'none' }}
                    >
                      <option value="" className="bg-gray-900">-- Select --</option>
                      {MORNING_STATUS_OPTIONS.filter(opt => opt !== '').map(opt => (
                        <option key={opt} value={opt} className="bg-gray-900">{opt}</option>
                      ))}
                      {!MORNING_STATUS_OPTIONS.includes(row.morningStatus) && row.morningStatus !== '' && (
                        <option value={row.morningStatus} className="bg-gray-900">{row.morningStatus}</option>
                      )}
                    </select>
                  </td>

                  <td className="px-4 py-3 text-gray-500 italic">{row.eveningStatus || '-'}</td>

                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.currentStatusTAT}
                      onChange={(e) => handleChange(row.ticketNo, 'currentStatusTAT', e.target.value)}
                      disabled={isDroppedTab}
                      className="w-full min-w-[150px] bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all disabled:opacity-50 text-[11px]"
                    />
                  </td>

                  <td className="px-2 py-2">
                    <select
                      value={row.engg}
                      onChange={(e) => handleChange(row.ticketNo, 'engg', e.target.value)}
                      disabled={isDroppedTab}
                      className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all appearance-none cursor-pointer disabled:opacity-50"
                      style={{ backgroundImage: 'none' }}
                    >
                      <option value="" className="bg-gray-900">Unassigned</option>
                      {engineers.filter(e => e !== '').map(eng => (
                        <option key={eng} value={eng} className="bg-gray-900">{eng}</option>
                      ))}
                      {!engineers.includes(row.engg) && row.engg !== '' && (
                        <option value={row.engg} className="bg-gray-900">{row.engg}</option>
                      )}
                    </select>
                  </td>

                  <td className="px-4 py-3 text-gray-300 font-mono text-[11px]">{row.contactNo}</td>

                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.parts}
                      onChange={(e) => handleChange(row.ticketNo, 'parts', e.target.value)}
                      disabled={isDroppedTab}
                      placeholder="Parts info..."
                      className="w-full min-w-[120px] bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all disabled:opacity-50 text-[11px]"
                    />
                  </td>

                  <td className="px-4 py-3 text-center text-xs">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${row.wipChanged === 'Yes' ? 'bg-orange-500/20 text-orange-400' :
                        row.wipChanged === 'New' ? 'bg-green-500/20 text-green-400' :
                          'bg-gray-700/50 text-gray-400'
                      }`}>
                      {row.wipChanged || '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}