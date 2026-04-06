import { useState } from 'react';
import type { ClassifiedRow } from '../lib/types';
import { COLUMNS, MORNING_STATUS_OPTIONS } from '../lib/types';
import { useStore } from '../store/useStore';
import { Search, X, Plus, Info } from 'lucide-react';

interface DataTableProps {
  data: ClassifiedRow[];
  isDroppedTab: boolean;
  onAddRow?: () => void;
}

export default function DataTable({ data, isDroppedTab, onAddRow }: DataTableProps) {
  const { updateRow, engineers, selectedCity } = useStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = data.filter(row => {
    const query = searchQuery.toLowerCase();
    return (
      row.ticketNo.toLowerCase().includes(query) ||
      (row.woOtcCode && row.woOtcCode.toLowerCase().includes(query)) ||
      row.caseId.toLowerCase().includes(query) ||
      row.location.toLowerCase().includes(query) ||
      row.product.toLowerCase().includes(query) ||
      (row.engg && row.engg.toLowerCase().includes(query))
    );
  });

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

  const handleChange = (
    ticketNo: string,
    field: keyof ClassifiedRow,
    value: string | number
  ) => {
    updateRow(ticketNo, field, value);
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
                  <th key={col} className="px-4 py-3 border-l border-gray-700/50">{col}</th>
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
