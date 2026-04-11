import { useRef, useState } from "react";
import { useStore } from "../store/useStore";
import DataTable from "./DataTable";
import {
  Download,
  FileDown,
  AlertCircle,
  Sparkles,
  UploadCloud,
  CheckCircle,
  PlusCircle,
  X,
  History,
} from "lucide-react";
import {
  exportSummaryXLSX,
  exportCallPlanXLSX,
  parseCSV,
  parseXLSX,
  detectCities,
  findOpenCallSheet,
} from "../lib/fileIO";
import { processCallPlan } from "../lib/engine";
import type { ClassifiedRow } from "../lib/types";
import { MORNING_STATUS_OPTIONS } from "../lib/types";
import {
  uploadFile,
  exportCallPlan as apiExportCallPlan,
  listFiles,
  createUploadSession,
  saveAnalysis,
  type ApiRow,
  type FileListItem,
} from "../api/client";
import { realtimeClient } from "../api/websocket";

export default function ReviewView() {
  const {
    result,
    rows,
    droppedRows,
    activeTab,
    setActiveTab,
    selectedCity,
    reportDate,
    engineers,
    setFlexData,
    setYesterdayData,
    availableCities,
    setSelectedCity,
    setReportDate,
    flexData,
    yesterdayData,
    setResult,
    setRows,
    setDroppedRows,
    addRow,
    username,
  } = useStore();

  const [flexFile, setFlexFile] = useState<File | null>(null);
  const [yestFile, setYestFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showImport, setShowImport] = useState(!result && rows.length === 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<FileListItem[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);

  // Interactivity State
  const [activeDetail, setActiveDetail] = useState<{
    label: string;
    items: string[];
  } | null>(null);

  const handleMetricClick = (label: string) => {
    let items: string[] = [];
    const activeRows = rows.filter((r) => r.classification !== "DROPPED");
    switch (label) {
      case "Engineer Count":
        items = Array.from(
          new Set(
            activeRows.map((r) => r.engg).filter((e) => e && e.trim() !== ""),
          ),
        ).sort();
        break;
      case "Total Flex Call":
        items = rows.map((r) => r.ticketNo);
        break;
      case "WIP Call":
        items = activeRows
          .filter((r) => r.morningStatus.toLowerCase() !== "closed")
          .map((r) => r.ticketNo);
        break;
      case "Actionable Calls":
        items = activeRows
          .filter((r) => r.morningStatus.toLowerCase() === "actionable")
          .map((r) => r.ticketNo);
        break;
      case "Trade WIP Call":
        items = activeRows
          .filter((r) => r.segment.toLowerCase() === "trade")
          .map((r) => r.ticketNo);
        break;
      case "Closed(OTB)":
        items = activeRows
          .filter((r) => r.morningStatus.toLowerCase() === "closed")
          .map((r) => r.ticketNo);
        break;
    }
    if (items.length > 0) setActiveDetail({ label, items });
  };

  const [newRow, setNewRow] = useState<Partial<ClassifiedRow>>({
    classification: "NEW",
    month: "",
    ticketNo: "",
    woOtcCode: "",
    caseId: "",
    product: "",
    wipAging: 0,
    location: "",
    segment: "Trade",
    hpOwner: "Manual",
    flexStatus: "Manual Entry",
    morningStatus: "To be scheduled",
    eveningStatus: "",
    currentStatusTAT: "",
    engg: "",
    contactNo: "",
    parts: "",
  });

  const flexRef = useRef<HTMLInputElement>(null);
  const yestRef = useRef<HTMLInputElement>(null);

  const handleFlexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      let data: Record<string, unknown>[];
      if (file.name.endsWith(".csv")) data = await parseCSV(file);
      else {
        const parsed = await parseXLSX(file);
        let name =
          parsed.sheets.find((s) => s.toLowerCase() === "data") ||
          parsed.sheets.reduce(
            (b, s) =>
              (parsed.data[s] || []).length > (parsed.data[b] || []).length
                ? s
                : b,
            parsed.sheets[0],
          );
        data = parsed.data[name] || [];
      }
      setFlexData(data, detectCities(data));
      setFlexFile(file);
      realtimeClient.sendActivity({ action: 'uploading', detail: 'Flex WIP' });

      // Create upload session if not yet created, then upload with session_id
      let sid = sessionId;
      if (!sid) {
        try {
          const session = await createUploadSession(selectedCity, reportDate);
          sid = session.id;
          setSessionId(sid);
        } catch {
          // Session creation failed, upload without session
        }
      }
      uploadFile(file, "flex_wip", selectedCity, reportDate, sid ?? undefined).catch(
        () => {},
      );
    } catch {
      setError("Parse error.");
    }
  };

  const handleYestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = await parseXLSX(file);
      const name = findOpenCallSheet(parsed.sheets);
      if (!name) throw new Error("Sheet missing.");
      setYesterdayData(parsed.data[name]);
      setYestFile(file);
      realtimeClient.sendActivity({ action: 'uploading', detail: 'Call Plan' });

      // Create upload session if not yet created, then upload with session_id
      let sid = sessionId;
      if (!sid) {
        try {
          const session = await createUploadSession(selectedCity, reportDate);
          sid = session.id;
          setSessionId(sid);
        } catch {
          // Session creation failed, upload without session
        }
      }
      uploadFile(file, "call_plan", selectedCity, reportDate, sid ?? undefined).catch(
        () => {},
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGenerate = () => {
    if (!flexData || !yesterdayData) return;
    setIsProcessing(true);
    realtimeClient.sendActivity({ action: 'processing', detail: 'Generating call plan' });
    setTimeout(() => {
      try {
        const res = processCallPlan(
          flexData,
          yesterdayData,
          selectedCity,
          new Date(reportDate),
        );
        setResult(res);
        setRows(res.all);
        setDroppedRows(res.dropped);
        setShowImport(false);

        // Save analysis result to backend DB
        saveAnalysis({
          city: selectedCity !== 'all' ? selectedCity : 'Chennai',
          report_date: reportDate,
          session_id: sessionId ?? undefined,
          total_count: res.metrics.finalCount,
          pending_count: res.metrics.pendingCount,
          new_count: res.metrics.newCount,
          dropped_count: res.metrics.droppedCount,
        }).catch((err) => console.error('Failed to save analysis to DB:', err));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsProcessing(false);
      }
    }, 400);
  };

  const handleExportSummary = () => {
    try {
      exportSummaryXLSX(
        rows,
        engineers.filter((e) => e.trim() !== "").length,
        selectedCity,
        reportDate,
      );
    } catch {
      alert("Failed.");
    }
  };

  const handleExportCallPlan = async () => {
    try {
      realtimeClient.sendActivity({ action: 'exporting', detail: 'Call Plan' });
      exportCallPlanXLSX(rows, droppedRows, selectedCity, reportDate);
      const apiRows: ApiRow[] = rows.map((r) => ({
        ticket_no: r.ticketNo,
        case_id: r.caseId,
        product: r.product,
        wip_aging: r.wipAging,
        location: r.location,
        segment: r.segment,
        classification: r.classification,
        morning_status: r.morningStatus,
        evening_status: r.eveningStatus,
        engineer: r.engg,
        contact_no: r.contactNo,
        parts: r.parts,
        month: r.month,
        wo_otc_code: r.woOtcCode,
        hp_owner: r.hpOwner,
        flex_status: r.flexStatus,
        wip_changed: r.wipChanged,
        current_status_tat: r.currentStatusTAT,
      }));
      await apiExportCallPlan(apiRows, selectedCity, reportDate);
    } catch {
      alert("Failed.");
    }
  };

  const loadHistory = async () => {
    try {
      const history = await listFiles(undefined, undefined, username);
      setUploadHistory(history);
      setIsHistoryOpen(true);
    } catch {}
  };

  const handleAddManualRow = () => {
    if (!newRow.ticketNo) {
      alert("Ticket No required");
      return;
    }
    addRow(newRow as ClassifiedRow);
    setIsModalOpen(false);
    setNewRow({
      classification: "NEW",
      month: "",
      ticketNo: "",
      woOtcCode: "",
      caseId: "",
      product: "",
      wipAging: 0,
      location: "",
      segment: "Trade",
      hpOwner: "Manual",
      flexStatus: "Manual Entry",
      morningStatus: "To be scheduled",
      eveningStatus: "",
      currentStatusTAT: "",
      engg: "",
      contactNo: "",
      parts: "",
    });
  };

  const totalFlexCalls = flexData?.length || 0;
  const boxMetrics = [
    {
      label: "Total Flex Call",
      value: totalFlexCalls,
      icon: UploadCloud,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Engineer Count",
      value: engineers.filter((e) => e.trim() !== "").length,
      icon: Sparkles,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
    },
    {
      label: "WIP Call",
      value: rows.length,
      icon: FileDown,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Actionable Calls",
      value: rows.filter((r) => r.morningStatus.toLowerCase() === "actionable")
        .length,
      icon: AlertCircle,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Trade WIP Call",
      value: rows.filter((r) => r.segment.toLowerCase() === "trade").length,
      icon: Sparkles,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Closed(OTB)",
      value: rows.filter((r) => r.morningStatus.toLowerCase() === "closed").length,
      icon: FileDown,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
  ];

  const tableMetrics = [
    {
      label: "Engineer Count",
      value: engineers.filter((e) => e.trim() !== "").length,
    },
    {
      label: "No.of Engg Presents",
      value: new Set(
        rows
          .filter((r) => r.morningStatus.toLowerCase() === "actionable")
          .map((r) => r.engg)
          .filter((e) => e && e.trim() !== ""),
      ).size,
    },
    { label: "Open Calls", value: rows.length },
    {
      label: "Actionable",
      value: rows.filter((r) => r.morningStatus.toLowerCase() === "actionable")
        .length,
    },
    {
      label: "Additional Part",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "additional part",
      ).length,
    },
    {
      label: "CRT Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "crt pending",
      ).length,
    },
    {
      label: "CT Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "ct pending",
      ).length,
    },
    {
      label: "CT Validation Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "ct validation pending",
      ).length,
    },
    {
      label: "Cx Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "cx pending",
      ).length,
    },
    {
      label: "Problem Resolution",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "problem resolution",
      ).length,
    },
    {
      label: "Part Order Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "part order pending",
      ).length,
    },
    {
      label: "Need to Cancel",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "need to cancel",
      ).length,
    },
    {
      label: "Need to Cancel - Mail",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "need to cancel - mail",
      ).length,
    },
    {
      label: "Need to Yank",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "need to yank",
      ).length,
    },
    {
      label: "Part Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "part pending",
      ).length,
    },
    {
      label: "To be Scheduled",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "to be scheduled",
      ).length,
    },
    {
      label: "Visit Estimate",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "visit estimate",
      ).length,
    },
    {
      label: "Visit Quote Customer",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "visit quote customer",
      ).length,
    },
    {
      label: "Yank",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "yank",
      ).length,
    },
    {
      label: "Under Observation",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "under observation",
      ).length,
    },
    {
      label: "Elevation Part Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "elevation part pending",
      ).length,
    },
    {
      label: "Elevation - WP Pending",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "elevation - wp pending",
      ).length,
    },
    {
      label: "OTP",
      value: rows.filter(
        (r) => r.morningStatus.toLowerCase() === "otp",
      ).length,
    },
    {
      label: "Planned Calls",
      value: rows.filter((r) => r.engg && r.engg.trim() !== "").length,
    },
    {
      label: "New calls",
      value: rows.filter((r) => r.classification === "NEW").length,
    },
    {
      label: "Trade Open Calls",
      value: rows.filter((r) => r.segment.toLowerCase() === "trade").length,
    },
  ];

  const sortedEnggs = Object.entries(
    rows.reduce(
      (acc, row) => {
        if (
          row.engg &&
          row.engg.trim() !== "" &&
          row.morningStatus.toLowerCase() === "actionable"
        ) {
          acc[row.engg] = (acc[row.engg] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="w-full flex-col space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className={`glass-panel p-6 rounded-2xl border border-gray-700/50 transition-all duration-500 overflow-hidden ${(!result && rows.length === 0) || showImport ? "max-h-[1000px]" : "max-h-[70px] opacity-70 hover:opacity-100"}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <UploadCloud className="h-5 w-5 text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-100 italic uppercase">
              Operational Data
            </h2>
          </div>
          {(result || rows.length > 0) && (
            <button
              onClick={() => setShowImport(!showImport)}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest px-4 py-1.5 bg-blue-500/5 border border-blue-500/20 rounded-lg"
            >
              {showImport ? "Close" : "Update Data"}
            </button>
          )}
        </div>
        {((!result && rows.length === 0) || showImport) && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-xs italic">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => flexRef.current?.click()}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${flexFile ? "bg-green-500/5 border-green-500/30" : "bg-gray-900/50 border-gray-800 hover:border-blue-500/50"}`}
              >
                <input
                  type="file"
                  className="hidden"
                  ref={flexRef}
                  onChange={handleFlexUpload}
                  accept=".csv,.xlsx"
                />
                {flexFile ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[150px]">
                      {flexFile.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">
                    Upload Today's Flex WIP
                  </span>
                )}
              </div>
              <div
                onClick={() => yestRef.current?.click()}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${yestFile ? "bg-green-500/5 border-green-500/30" : "bg-gray-900/50 border-gray-800 hover:border-blue-500/50"}`}
              >
                <input
                  type="file"
                  className="hidden"
                  ref={yestRef}
                  onChange={handleYestUpload}
                  accept=".xlsx"
                />
                {yestFile ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[150px]">
                      {yestFile.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">
                    Upload Yesterday's Plan
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-1 w-full">
                <label className="text-[10px] font-bold uppercase text-gray-500">
                  City
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full glass-input bg-gray-900 text-xs py-2"
                >
                  {availableCities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1 w-full">
                <label className="text-[10px] font-bold uppercase text-gray-500">
                  Date
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full glass-input bg-gray-900 text-xs py-2"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={isProcessing}
                className={`flex-1 h-[34px] flex items-center justify-center gap-2 rounded-lg font-bold text-xs transition-all ${isProcessing ? "bg-blue-600/50 cursor-not-allowed text-white/50" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"}`}
              >
                {isProcessing ? (
                  <>
                    <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                    Analyzing...
                  </>
                ) : (
                  "Run Analysis"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {(result || rows.length > 0) && (
        <>
          <div className="flex items-center justify-end glass-panel p-4 rounded-xl border border-gray-700/50 gap-3">
            <button
              onClick={loadHistory}
              className="flex items-center gap-2 text-sm px-4 py-2 border border-gray-600/30 rounded-lg text-gray-400"
            >
              <History className="h-4 w-4" /> History
            </button>
            <button
              onClick={handleExportSummary}
              className="flex items-center gap-2 text-sm px-4 py-2 border border-blue-500/30 rounded-lg text-blue-400"
            >
              <Download className="h-4 w-4" /> EXPORT TN
            </button>
            <button
              onClick={handleExportCallPlan}
              className="flex items-center gap-2 text-sm px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white shadow-lg shadow-blue-900/20"
            >
              <Download className="h-4 w-4" /> Download Call Plan
            </button>
          </div>

          <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="w-full xl:w-[48%] flex-shrink-0">
              <div className="overflow-hidden rounded-xl border border-gray-700/50 shadow-2xl">
                <div className="bg-[#00AEEF] px-4 py-2 flex justify-between items-center text-black font-black text-base">
                  <span>{reportDate.split("-").reverse().join("-")}</span>
                  <span className="uppercase">{selectedCity}</span>
                </div>
                <div className="bg-[#FFFF00] grid grid-cols-[50px_1fr_80px] text-black font-black text-[10px] uppercase border-y border-black/10">
                  <div className="px-3 py-1 border-r border-black/10 text-center">
                    S.No
                  </div>
                  <div className="px-4 py-1 border-r border-black/10">
                    Description
                  </div>
                  <div className="px-3 py-1 text-center">Count</div>
                </div>
                <div className="bg-white/95 text-black">
                  {tableMetrics.map((m, idx) => (
                    <div
                      key={idx}
                      className={`grid grid-cols-[50px_1fr_80px] border-b border-gray-300 last:border-b-0 ${[5, 14, 16].includes(idx) ? "bg-[#FFFF00]/10" : ""}`}
                    >
                      <div className="px-3 py-0.5 border-r border-gray-300 text-center text-[10px]">
                        {idx + 1}
                      </div>
                      <div className="px-4 py-0.5 border-r border-gray-300 font-bold text-xs">
                        {m.label}
                      </div>
                      <div
                        className={`px-3 py-0.5 text-center font-black text-xs ${[5, 14, 16].includes(idx) ? "bg-[#FFFF00]" : ""}`}
                      >
                        {m.value > 0 ? m.value : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 w-full space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {boxMetrics.map((m, i) => (
                  <div
                    key={i}
                    onClick={() => handleMetricClick(m.label)}
                    className="glass-panel p-3.5 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer border border-gray-700/30 hover:border-blue-500/50 transition-all hover:scale-[1.02]"
                  >
                    <div className={`p-2 rounded-xl mb-2 ${m.bg}`}>
                      <m.icon className={`h-4 w-4 ${m.color}`} />
                    </div>
                    <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                      {m.label}
                    </p>
                    <h4 className="text-xl font-black text-gray-100">
                      {m.value}
                    </h4>
                  </div>
                ))}
              </div>
              {sortedEnggs.length > 0 && (
                <div className="space-y-3 p-4 glass-panel rounded-2xl border border-gray-700/30">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">
                    Engg Allocation
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {sortedEnggs.map(([eng, count]) => (
                      <div
                        key={eng}
                        className="px-3 py-1.5 bg-gray-800/60 rounded-lg border border-white/5 flex items-center gap-2 hover:border-blue-500/30 transition-all"
                      >
                        <span className="text-[11px] font-bold text-gray-300">
                          {eng}
                        </span>
                        <span className="text-[11px] font-black text-blue-400 bg-blue-500/10 px-1.5 rounded">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-xl flex flex-col overflow-hidden border border-gray-700/50">
            <div className="flex bg-gray-900 border-b border-gray-700/80">
              {(
                [
                  "all",
                  "actionable",
                  "planned",
                  "trade",
                  "pending",
                  "new",
                  "dropped",
                ] as const
              ).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-[11px] font-black uppercase tracking-widest relative ${activeTab === tab ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
                >
                  {tab === "all"
                    ? `${selectedCity} Open Calls`
                    : tab === "actionable"
                      ? "Actionable Call"
                      : tab === "planned"
                        ? "Planned Call"
                        : tab === "trade"
                          ? "Trade Call"
                          : tab === "pending"
                            ? "Pending Call"
                            : tab === "new"
                              ? "New Call"
                              : "Closed Call (OTB)"}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="p-1">
              <DataTable
                data={
                  activeTab === "all"
                    ? rows
                    : activeTab === "actionable"
                      ? rows.filter(
                          (r) => r.morningStatus.toLowerCase() === "actionable",
                        )
                      : activeTab === "planned"
                        ? rows.filter((r) => r.engg && r.engg.trim() !== "")
                        : activeTab === "trade"
                          ? rows.filter(
                              (r) => r.segment.toLowerCase() === "trade",
                            )
                          : activeTab === "pending"
                            ? rows.filter((r) => r.classification === "PENDING")
                            : activeTab === "new"
                              ? rows.filter((r) => r.classification === "NEW")
                              : droppedRows
                }
                isDroppedTab={activeTab === "dropped"}
                onAddRow={() => setIsModalOpen(true)}
              />
            </div>
          </div>
        </>
      )}

      {activeDetail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveDetail(null)}
          />
          <div className="glass-panel w-full max-w-md relative z-10 rounded-3xl overflow-hidden border border-gray-700/50 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="bg-gray-900/80 px-6 py-4 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-100 italic uppercase">
                    {activeDetail.label}
                  </h3>
                  <p className="text-[10px] text-gray-500 underline decoration-blue-500/20">
                    {activeDetail.items.length} items found
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveDetail(null)}
                className="p-1.5 hover:bg-white/10 rounded-full"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="max-h-[400px] overflow-y-auto p-4 custom-scrollbar bg-gray-900/40">
              {activeDetail.items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-white/5 border border-white/5 rounded-xl mb-2 flex items-center gap-3"
                >
                  <span className="text-[10px] font-black text-gray-600">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-bold text-gray-300 uppercase tracking-tight">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-2xl"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="glass-panel w-full max-w-4xl relative z-60 max-h-[95vh] overflow-y-auto rounded-[3rem] border border-white/10 shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)] flex flex-col bg-gray-950/40 translate-y-0 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 px-10 py-8 flex items-center justify-between border-b border-white/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 -rotate-45 translate-x-32 -translate-y-32 blur-3xl pointer-events-none" />
              <div className="flex items-center gap-5">
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                  <PlusCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none mb-1">
                    New Manual Entry
                  </h2>
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.3em]">
                    Operational Record Registration
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-all hover:rotate-90"
              >
                <X className="h-6 w-6 text-white/80" />
              </button>
            </div>

            <div className="p-10 space-y-12 overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px flex-1 bg-blue-500/20" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">
                    Identification & Classification
                  </span>
                  <div className="h-px w-8 bg-blue-500/20" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Ticket No *
                    </label>
                    <input
                      type="text"
                      placeholder="TN-XXXXX"
                      value={newRow.ticketNo}
                      onChange={(e) =>
                        setNewRow({ ...newRow, ticketNo: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-gray-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Classification
                    </label>
                    <select
                      value={newRow.classification}
                      onChange={(e) =>
                        setNewRow({
                          ...newRow,
                          classification: e.target.value as any,
                        })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-gray-100 shadow-xl"
                    >
                      {["NEW", "PENDING", "DROPPED"].map((o) => (
                        <option key={o} value={o} className="bg-gray-900">
                          {o === "DROPPED" ? "CLOSED OTB" : o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      OTC Code
                    </label>
                    <input
                      type="text"
                      placeholder="OTC-00"
                      value={newRow.woOtcCode}
                      onChange={(e) =>
                        setNewRow({ ...newRow, woOtcCode: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-gray-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Case ID
                    </label>
                    <input
                      type="text"
                      placeholder="C-XXXXXX"
                      value={newRow.caseId}
                      onChange={(e) =>
                        setNewRow({ ...newRow, caseId: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px flex-1 bg-amber-500/20" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400">
                    Logistics & Context
                  </span>
                  <div className="h-px w-8 bg-amber-500/20" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {["product", "location", "hpOwner"].map((k) => (
                    <div key={k} className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                        {k}
                      </label>
                      <input
                        type="text"
                        placeholder={`Enter ${k}...`}
                        value={(newRow as any)[k]}
                        onChange={(e) =>
                          setNewRow({ ...newRow, [k]: e.target.value })
                        }
                        className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-gray-100 placeholder:text-gray-700"
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Segment
                    </label>
                    <select
                      value={newRow.segment}
                      onChange={(e) =>
                        setNewRow({ ...newRow, segment: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-gray-100"
                    >
                      {["Trade", "Consumer", "Corporate"].map((o) => (
                        <option key={o} value={o} className="bg-gray-900">
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      WIP Aging
                    </label>
                    <input
                      type="number"
                      value={newRow.wipAging}
                      onChange={(e) =>
                        setNewRow({
                          ...newRow,
                          wipAging: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-gray-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Flex Status
                    </label>
                    <input
                      type="text"
                      placeholder="Current Flex Status..."
                      value={newRow.flexStatus}
                      onChange={(e) =>
                        setNewRow({ ...newRow, flexStatus: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-gray-100 placeholder:text-gray-700"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px flex-1 bg-emerald-500/20" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                    Assignment & Execution
                  </span>
                  <div className="h-px w-8 bg-emerald-500/20" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      Engineer{" "}
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </label>
                    <input
                      type="text"
                      list="prev-engg"
                      placeholder="Select Engineer..."
                      value={newRow.engg}
                      onChange={(e) =>
                        setNewRow({ ...newRow, engg: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-gray-100 placeholder:text-gray-700"
                    />
                    <datalist id="prev-engg">
                      {engineers.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Morning Status
                    </label>
                    <select
                      value={newRow.morningStatus}
                      onChange={(e) =>
                        setNewRow({ ...newRow, morningStatus: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-gray-100"
                    >
                      {MORNING_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt} className="bg-gray-900">
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                      Contact No
                    </label>
                    <input
                      type="text"
                      placeholder="+91 XXXXX XXXXX"
                      value={newRow.contactNo}
                      onChange={(e) =>
                        setNewRow({ ...newRow, contactNo: e.target.value })
                      }
                      className="w-full glass-input bg-gray-950/50 border-white/5 text-sm py-3 px-4 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-gray-100 placeholder:text-gray-700"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                  Remarks / Spares Management
                </label>
                <textarea
                  rows={4}
                  placeholder="Add detailed technical remarks or parts info here..."
                  value={newRow.parts}
                  onChange={(e) =>
                    setNewRow({ ...newRow, parts: e.target.value })
                  }
                  className="w-full p-6 glass-input bg-gray-950/50 border-white/5 rounded-3xl text-sm resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-gray-300 placeholder:text-gray-700 leading-relaxed"
                />
              </div>
            </div>

            <div className="px-10 py-8 bg-gray-950/50 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-8 py-3.5 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all"
              >
                Cancel Entry
              </button>
              <button
                onClick={handleAddManualRow}
                className="px-12 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-[0_20px_40px_-10px_rgba(37,99,235,0.4)] active:scale-95"
              >
                Commit & Register
              </button>
            </div>
          </div>
        </div>
      )}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            onClick={() => setIsHistoryOpen(false)}
          />
          <div className="glass-panel w-full max-w-2xl relative z-20 max-h-[85vh] overflow-hidden rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col bg-gray-950/40 animate-in zoom-in-95 duration-500">
            <div className="bg-gradient-to-br from-gray-900 to-slate-900 px-8 py-6 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <History className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase italic tracking-tighter leading-none mb-1">
                    Upload History
                  </h3>
                  <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">
                    Past Operational Records
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {uploadHistory.length === 0 ? (
                <div className="py-20 text-center space-y-3 opacity-50">
                  <History className="h-12 w-12 text-gray-700 mx-auto" />
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-widest">
                    No history found
                  </p>
                </div>
              ) : (
                uploadHistory.map((file) => (
                  <div
                    key={file.id}
                    className="group p-5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 rounded-2xl transition-all duration-300 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-3 rounded-xl ${file.file_type === "flex_wip" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"}`}
                      >
                        {file.file_type === "flex_wip" ? (
                          <UploadCloud className="h-5 w-5" />
                        ) : (
                          <FileDown className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-200 mb-1 group-hover:text-white transition-colors">
                          {file.original_name}
                        </h4>
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-gray-600">
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> {file.city}
                          </span>
                          <span>•</span>
                          <span>
                            {file.report_date ||
                              new Date(file.uploaded_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-gray-400 mb-1">
                        {(file.file_size / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-[10px] font-bold text-blue-400/60 uppercase">
                        {file.row_count} Rows
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
