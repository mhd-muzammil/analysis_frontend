import type {
  FlexRow,
  CallPlanRow,
  ClassifiedRow,
  ProcessingResult,
} from "./types";

// ── Smart Column Finder (Fuzzy/Case-insensitive) ──
export function findCol(
  raw: Record<string, unknown>,
  aliases: string[],
): string {
  const keys = Object.keys(raw);
  const normalizedAliases = aliases.map((a) =>
    a.toLowerCase().replace(/\s+/g, ""),
  );

  for (const key of keys) {
    const normKey = key.toLowerCase().replace(/\s+/g, "");
    if (normalizedAliases.includes(normKey)) {
      return String(raw[key] ?? "").trim();
    }
  }
  return "";
}

// ── Phone number cleanup ──
export function cleanPhone(raw: unknown): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/\.0$/, "");
  s = s.replace(/\D/g, "");
  // Remove 91 prefix if exactly 12 digits
  if (s.length === 12 && s.startsWith("91")) s = s.slice(2);
  // Keep only last 10 digits if longer
  if (s.length > 10) s = s.slice(-10);
  return s;
}

// ── Flex Create Time → Date ──
export function parseFlexDate(raw: string): Date | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(" UTC", "").trim();
    if (!cleaned) return null;
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ── Segment mapping ──
export function mapSegment(otcCode: string, bizSegment: string): string {
  const otc = (otcCode ?? "").toLowerCase();
  if (otc.includes("trade")) return "Trade";
  if (otc.includes("install") || otc.includes("05f")) return "Install";
  const seg = (bizSegment ?? "").toLowerCase();
  if (seg === "computing") return "Pc";
  if (seg === "printing") return "print";
  if (seg.includes("consumer")) return "Consumer";
  if (seg.includes("corporate")) return "Corporate";
  return bizSegment || "Trade";
}

// ── WIP Aging calculation ──
export function calcAging(createTime: string, reportDate: Date): number {
  const created = parseFlexDate(createTime);
  if (!created) return 0;
  const diff = reportDate.getTime() - created.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

// ── Strict Validation (Now more lenient) ──
export function isValidWO(id: string): boolean {
  const trimmed = (id ?? "").trim().toUpperCase();
  // Valid if: WO-XXXXXXXXX OR just XXXXXXXXX (9 digits)
  return /^WO-\d{9}$/i.test(trimmed) || /^\d{9}$/.test(trimmed);
}

export function isValidCase(id: string): boolean {
  const trimmed = (id ?? "").trim();
  return /^\d{8,10}$/.test(trimmed) || trimmed.length > 4; // Case IDs are usually 8-10 digits
}

// ── Normalize raw flex data into typed rows ──
export function normalizeFlexRow(raw: Record<string, unknown>): FlexRow {
  let ticketNo = findCol(raw, [
    "Ticket No",
    "TicketNo",
    "WorkOrder",
    "WO",
    "Work Order",
    "Service Order",
  ]);

  // Auto-prepend WO- if it's just 9 digits
  if (/^\d{9}$/.test(ticketNo)) {
    ticketNo = `WO-${ticketNo}`;
  }

  const caseId = findCol(raw, ["Case Id", "CaseId", "Case", "Incident"]);
  const product = findCol(raw, [
    "Product Name",
    "ProductName",
    "Product",
    "Model",
    "Machine",
  ]);
  const city = findCol(raw, [
    "ASP City",
    "ASPCity",
    "City",
    "Location",
    "Branch",
  ]);
  const otc = findCol(raw, [
    "WO OTC Code",
    "Wo otc code",
    "OTCCode",
    "OTC",
    "OTC Code",
  ]);
  const status = findCol(raw, [
    "Status",
    "Flex Status",
    "FlexStatus",
    "Job Status",
  ]);
  const phone = findCol(raw, [
    "Customer Phone No",
    "Phone",
    "Contact",
    "Mobile",
  ]);
  const hpOwner = findCol(raw, ["HP Owner", "HPOwner", "Owner", "HP Contact"]);
  const address = findCol(raw, [
    "Customer Address",
    "Address",
    "Customer Address ",
  ]);
  const location = findCol(raw, [
    "Work Location",
    "WorkLocation",
    "Area",
    "Sub-Area",
  ]);
  const segment = findCol(raw, [
    "Business Segment",
    "BusinessSegment",
    "Segment",
    "Biz Segment",
  ]);
  const createTime = findCol(raw, [
    "Create Time",
    "CreateTime",
    "CreatedDate",
    "Creation Date",
  ]);

  // Handle WIP Aging (can be direct number or calculated)
  let wipAgingRaw = 0;
  const agingVal = findCol(raw, ["WIP Aging", "WIPAging", "Aging", "WIPDays"]);
  if (agingVal) wipAgingRaw = parseInt(agingVal, 10) || 0;

  return {
    ticketNo,
    caseId,
    productName: product,
    createTime,
    aspCity: city,
    workLocation: location,
    woOtcCode: otc,
    businessSegment: segment,
    status: status,
    customerPhoneNo: phone,
    customerCity: city,
    customerAddress: address,
    bookingResource: findCol(raw, ["Booking Resource", "BookingResource"]),
    wipAgingRaw,
    hpOwner,
    flexStatus: status,
  };
}

// ── Normalize yesterday's call plan row ──
export function normalizeCallPlanRow(
  raw: Record<string, unknown>,
): CallPlanRow {
  const ticketNo = findCol(raw, ["Ticket No", "TicketNo", "WO"]);
  const monthVal = raw["Month"] || raw["month"];
  let monthStr = "";

  if (monthVal instanceof Date) {
    monthStr = monthVal
      .toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
      .replace(" ", "-");
  } else if (
    monthVal != null &&
    String(monthVal).trim() !== "" &&
    String(monthVal) !== "NaT"
  ) {
    monthStr = String(monthVal).trim();
  }

  return {
    month: monthStr,
    ticketNo,
    woOtcCode: findCol(raw, ["WO OTC Code", "OTC", "OTCCode"]),
    caseId: findCol(raw, ["Case Id", "CaseId", "Case"]),
    product: findCol(raw, ["Product", "ProductName"]),
    wipAging:
      parseInt(String(raw["WIP Aging"] || raw["Aging"] || "0"), 10) || 0,
    location: findCol(raw, ["Location", "Area", "WorkLocation"]),
    segment: findCol(raw, ["Segment", "BusinessSegment"]),
    hpOwner: findCol(raw, ["HP Owner", "Owner"]),
    flexStatus: findCol(raw, ["Flex Status", "Status", "Status Category"]),
    wipChanged: findCol(raw, ["WIP Changed", "WIPChanged"]),
    morningStatus: findCol(raw, [
      "Morning Report",
      "Morning Status",
      "MorningReport",
    ]),
    eveningStatus: findCol(raw, [
      "Evening Report",
      "Evening Status",
      "EveningReport",
    ]),
    currentStatusTAT: findCol(raw, ["Current Status-TAT", "TAT", "Status-TAT"]),
    engg: findCol(raw, ["Engg.", "Engineer", "EngineerName"]),
    contactNo: findCol(raw, ["Contact no.", "Phone", "Contact"]),
    parts: findCol(raw, ["Parts", "PartsInfo", "PartRemarks"]),
  };
}

// ── Detect format (Smart) ──
function detectFlexFormat(flexRaw: Record<string, unknown>[]): "csv" | "xlsx" {
  if (flexRaw.length === 0) return "csv";
  const sample = flexRaw[0];
  const keys = Object.keys(sample).map((k) =>
    k.toLowerCase().replace(/\s+/g, ""),
  );

  // XLSX usually has 'wipaging' pre-calculated
  if (keys.includes("wipaging")) return "xlsx";
  // CSV usually has 'createtime'
  if (keys.includes("createtime")) return "csv";

  return "csv";
}

// ── Main comparison engine ──
export function processCallPlan(
  flexRaw: Record<string, unknown>[],
  yesterdayRaw: Record<string, unknown>[],
  city: string,
  reportDate: Date,
): ProcessingResult {
  const format = detectFlexFormat(flexRaw);
  const targetCity = city.trim().toLowerCase();

  const flexMap = new Map<string, FlexRow>();
  let flexTotal = 0;
  for (const raw of flexRaw) {
    flexTotal++;
    const row = normalizeFlexRow(raw);
    if (!isValidWO(row.ticketNo)) continue;

    // Strict but flexible city filtering
    const rowCity = (row.aspCity || "").toLowerCase().trim();
    const targetCityNorm = (targetCity || "").toLowerCase().trim();
    const isAllCities = targetCityNorm === "all" || targetCityNorm === "";

    if (
      !isAllCities &&
      rowCity !== targetCityNorm &&
      !rowCity.includes(targetCityNorm) &&
      !targetCityNorm.includes(rowCity)
    ) {
      continue;
    }

    flexMap.set(row.ticketNo.toUpperCase(), row);
  }

  const rtplMap = new Map<string, CallPlanRow>();
  for (const raw of yesterdayRaw) {
    const row = normalizeCallPlanRow(raw);
    if (!isValidWO(row.ticketNo)) continue;
    rtplMap.set(row.ticketNo.toUpperCase(), row);
  }

  const pending: ClassifiedRow[] = [];
  const newRows: ClassifiedRow[] = [];
  const dropped: ClassifiedRow[] = [];

  // Identify Pending and New
  for (const [ticketNo, flexRow] of flexMap) {
    const yesterday = rtplMap.get(ticketNo);
    if (yesterday) {
      // Comparison logic for WIP Changed status
      const wipChanged =
        yesterday.flexStatus.toLowerCase() !== flexRow.flexStatus.toLowerCase()
          ? "Yes"
          : "No";

      pending.push({
        ...yesterday,
        wipAging:
          flexRow.wipAgingRaw > 0 ? flexRow.wipAgingRaw : yesterday.wipAging,
        eveningStatus: "", // Clear evening status for the new day
        hpOwner: flexRow.hpOwner || yesterday.hpOwner,
        flexStatus: flexRow.flexStatus,
        wipChanged,
        classification: "PENDING",
        woOtcCode: flexRow.woOtcCode || yesterday.woOtcCode,
      });
    } else {
      // New row logic
      let aging: number;
      if (format === "xlsx" && flexRow.wipAgingRaw > 0) {
        aging = flexRow.wipAgingRaw;
      } else {
        aging = calcAging(flexRow.createTime, reportDate);
      }

      newRows.push({
        month: reportDate
          .toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
          .replace(" ", "-"),
        ticketNo: flexRow.ticketNo,
        woOtcCode: flexRow.woOtcCode,
        caseId: flexRow.caseId,
        product: flexRow.productName,
        wipAging: aging,
        location: flexRow.workLocation || flexRow.customerCity,
        segment: mapSegment(flexRow.woOtcCode, flexRow.businessSegment),
        hpOwner: flexRow.hpOwner,
        flexStatus: flexRow.flexStatus,
        wipChanged: "New",
        morningStatus: "To be scheduled", // Default for new rows
        eveningStatus: "",
        currentStatusTAT: "",
        engg: "",
        contactNo: cleanPhone(flexRow.customerPhoneNo),
        parts: "",
        classification: "NEW",
      });
    }
  }

  // Identify Dropped (Closed)
  for (const [ticketNo, row] of rtplMap) {
    if (!flexMap.has(ticketNo)) {
      dropped.push({ ...row, classification: "DROPPED" });
    }
  }

  // Sort by aging desc
  pending.sort((a, b) => b.wipAging - a.wipAging);
  newRows.sort((a, b) => b.wipAging - a.wipAging);
  dropped.sort((a, b) => b.wipAging - a.wipAging);

  const all = [...pending, ...newRows];

  // Calculate Metrics
  let tradeCount = 0;
  let actionableCount = 0;
  let toScheduleCount = 0;
  let sscPendingCount = 0;
  let techSupportCount = 0;
  let toYankCount = 0;
  const enggSet = new Set<string>();

  for (const row of all) {
    if (row.segment.toLowerCase() === "trade") tradeCount++;
    const ms = row.morningStatus.toLowerCase().trim();
    if (ms === "actionable") actionableCount++;
    if (ms === "to be scheduled") toScheduleCount++;
    if (ms === "ssc pending") sscPendingCount++;
    if (ms.includes("elevate") || ms.includes("tech support"))
      techSupportCount++;
    if (ms === "to be yank") toYankCount++;
    if (row.engg && row.engg.trim() !== "")
      enggSet.add(row.engg.trim().toLowerCase());
  }

  return {
    pending,
    new: newRows,
    dropped,
    all,
    metrics: {
      flexTotal,
      flexFiltered: flexMap.size,
      yesterdayTotal: rtplMap.size,
      pendingCount: pending.length,
      newCount: newRows.length,
      droppedCount: dropped.length,
      finalCount: all.length,
      tradeCount,
      actionableCount,
      toScheduleCount,
      sscPendingCount,
      techSupportCount,
      toYankCount,
      enggPresentCount: enggSet.size,
    },
  };
}

// Summary builder (18 Metrics)
export function buildSummaryTable(
  rows: ClassifiedRow[],
  engineersCount: number,
): string[][] {
  const outputRows = rows.filter((r) => r.classification !== "DROPPED");
  const activeEnggs = new Set(
    outputRows
      .map((r) => r.engg)
      .filter((e) => e && e.trim() !== "")
      .map((e) => e.toLowerCase().trim()),
  );

  const openCallsCount = outputRows.length;
  const actionableCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "actionable",
  ).length;
  const plannedCallsCount = outputRows.filter(
    (r) => r.engg && r.engg.trim() !== "",
  ).length;
  const closedCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "closed",
  ).length;
  const enggOnsiteCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "engg onsite",
  ).length;
  const toScheduleCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "to be scheduled",
  ).length;
  const cxRescheduleCount = outputRows.filter((r) => {
    const ms = r.morningStatus.toLowerCase();
    return ms === "cx reschedule" || ms === "cx pending";
  }).length;
  const sscPendingCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "ssc pending",
  ).length;
  const techSupportCount = outputRows.filter((r) => {
    const ms = r.morningStatus.toLowerCase();
    return ms.includes("elevate") || ms.includes("tech support");
  }).length;
  const observationCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "under observation",
  ).length;
  const toYankCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "to be yank",
  ).length;
  const closedCancelledCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "closed cancelled",
  ).length;
  const partOrderedCount = outputRows.filter(
    (r) => r.morningStatus.toLowerCase() === "additional part",
  ).length;
  const toCancelCount = outputRows.filter(
    (r) =>
      r.morningStatus.toLowerCase().includes("cancel") &&
      r.morningStatus.toLowerCase() !== "closed cancelled",
  ).length;
  const newCallsCount = outputRows.filter(
    (r) => r.classification === "NEW",
  ).length;
  const tradeCount = outputRows.filter(
    (r) => r.segment.toLowerCase() === "trade",
  ).length;

  return [
    ["S.No", "Description", "Count"],
    ["1", "Engineer Count", String(engineersCount)],
    ["2", "No.of Engg Presents", String(activeEnggs.size)],
    ["3", "WIP Call", String(openCallsCount)],
    ["4", "Actionable Calls", String(actionableCount)],
    ["5", "Planned Calls", String(plannedCallsCount)],
    ["6", "Closed Calls", String(closedCount > 0 ? closedCount : "")],
    ["7", "Engg onsite", String(enggOnsiteCount > 0 ? enggOnsiteCount : "")],
    ["8", "To be schedule", String(toScheduleCount)],
    [
      "9",
      "CX Reschedule Calls",
      String(cxRescheduleCount > 0 ? cxRescheduleCount : ""),
    ],
    ["10", "SSC Pending Calls", String(sscPendingCount)],
    ["11", "Elevate/Tech Support Calls", String(techSupportCount)],
    [
      "12",
      "Under observation Calls",
      String(observationCount > 0 ? observationCount : ""),
    ],
    ["13", "To be Yank", String(toYankCount)],
    [
      "14",
      "Closed cancelled",
      String(closedCancelledCount > 0 ? closedCancelledCount : ""),
    ],
    [
      "15",
      "Add.Part ordered",
      String(partOrderedCount > 0 ? partOrderedCount : ""),
    ],
    ["16", "To be Cancel", String(toCancelCount)],
    ["17", "New calls", String(newCallsCount > 0 ? newCallsCount : "")],
    ["18", "Trade WIP Call", String(tradeCount)],
  ];
}

export function buildEngineerBreakdown(rows: ClassifiedRow[]): string[][] {
  const outputRows = rows.filter((r) => r.classification !== "DROPPED");
  const engCounts = new Map<string, number>();
  for (const row of outputRows) {
    if (row.engg && row.engg.trim() !== "") {
      const name = row.engg.trim();
      engCounts.set(name, (engCounts.get(name) ?? 0) + 1);
    }
  }
  const sorted = [...engCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];
  const result: string[][] = [["Engineer", "Allocated Calls"]];
  for (const [eng, count] of sorted) {
    result.push([eng, String(count)]);
  }
  return result;
}

export interface ChennaiDashboardData {
  leftMetrics: { label: string; value: string | number; bg?: string }[];
  rightMetrics: { label: string; value: string | number; bg?: string }[];
}

export function buildChennaiDashboardData(
  rows: ClassifiedRow[],
  totalEngCount: number,
  reportDateStr: string,
): ChennaiDashboardData {
  const activeRows = rows.filter((r) => r.classification !== "DROPPED");

  const totalOpen = activeRows.length;

  const fieldActionable = activeRows.filter(
    (r) => r.morningStatus.toLowerCase() === "actionable",
  ).length;
  const totalScheduled = activeRows.filter(
    (r) =>
      r.morningStatus.toLowerCase() === "to be scheduled" ||
      (r.engg && r.engg.trim() !== ""),
  ).length;

  const activeEnggs = new Set(
    activeRows
      .filter((r) => r.morningStatus.toLowerCase() === "actionable")
      .map((r) => r.engg)
      .filter((e) => e && e.trim() !== ""),
  ).size;

  const callAllocEngWise =
    activeEnggs > 0 ? (fieldActionable / activeEnggs).toFixed(1) : "0.0";

  const printOpen2D = activeRows.filter(
    (r) => r.segment.toLowerCase() === "print" && r.wipAging >= 2,
  ).length;
  const printActionable2D = activeRows.filter(
    (r) =>
      r.segment.toLowerCase() === "print" &&
      r.morningStatus.toLowerCase() === "actionable" &&
      r.wipAging >= 2,
  ).length;
  const printScheduled2D = activeRows.filter(
    (r) =>
      r.segment.toLowerCase() === "print" &&
      r.morningStatus.toLowerCase() === "to be scheduled" &&
      r.wipAging >= 2,
  ).length;

  const open10D = activeRows.filter((r) => r.wipAging > 10).length;
  const actionable10D = activeRows.filter(
    (r) => r.morningStatus.toLowerCase() === "actionable" && r.wipAging > 10,
  ).length;
  const scheduled10D = activeRows.filter(
    (r) =>
      r.morningStatus.toLowerCase() === "to be scheduled" && r.wipAging > 10,
  ).length;

  const mps1D = activeRows.filter(
    (r) => r.segment.toLowerCase() === "mps" && r.wipAging > 1,
  ).length;

  const eodCallCloser = activeRows.filter(
    (r) => r.morningStatus.toLowerCase() === "closed",
  ).length;
  const newCallsReceived = activeRows.filter(
    (r) => r.classification === "NEW",
  ).length;

  const csoDaysInventory =
    eodCallCloser > 0 ? (totalOpen / eodCallCloser).toFixed(1) : "#DIV/0!";

  const engProductivity =
    totalEngCount > 0 ? (eodCallCloser / totalEngCount).toFixed(1) : "0.0";

  const missedToSchedule = 0; // Default placeholder
  const missedByEng = 0; // Default placeholder
  const gTotalMissed = missedToSchedule + missedByEng;
  const percentMissed =
    totalOpen > 0 ? ((gTotalMissed / totalOpen) * 100).toFixed(0) + "%" : "0%";
  const closureAdherence =
    fieldActionable > 0
      ? ((eodCallCloser / fieldActionable) * 100).toFixed(0) + "%"
      : "0%";

  const leftMetrics = [
    { label: "Total open call", value: totalOpen },
    { label: "Total field Actionable call", value: fieldActionable },
    { label: "Total Call Scheduled", value: totalScheduled },
    { label: "Call Allocation Engineer Wise", value: callAllocEngWise },
    { label: "Print - Open call (=>2 days)", value: printOpen2D },
    { label: "Print - Actionable call (=>2 days)", value: printActionable2D },
    { label: "Print - Scheduled (=>2 days)", value: printScheduled2D },
    { label: "Open call (>10 days)", value: open10D },
    { label: "Actionable call (>10 days)", value: actionable10D },
    { label: "Call Scheduled (>10 days)", value: scheduled10D },
    { label: "MPS >1 Days", value: mps1D },
    { label: "EOD Call Closer", value: eodCallCloser, bg: "bg-[#d9e1f2]" },
    {
      label: "New Calls Received",
      value: newCallsReceived,
      bg: "bg-[#d9e1f2]",
    },
    {
      label: "CSO Days Inventory",
      value: csoDaysInventory,
      bg: "bg-[#f4cccc]",
    },
    { label: "Total Eng Count", value: totalEngCount },
    { label: "Eng Avl in Field", value: activeEnggs },
    { label: "Engineers Productivity", value: engProductivity },
    {
      label: "Missed to schedule field action calls due to non avl of Eng",
      value: missedToSchedule,
    },
    {
      label: "Missed by Eng to attend scheduled Call (High call allocation)",
      value: missedByEng,
      bg: "bg-[#fce5cd]",
    },
    {
      label: "G Total (Missed to schedule & Attend Daily basis)",
      value: gTotalMissed,
    },
    {
      label: "% - Missed to schedule & Attend Daily call",
      value: percentMissed,
      bg: "bg-[#eeeeee]",
    },
    { label: "Closure Adherence", value: closureAdherence, bg: "bg-[#ffd966]" },
  ];

  // Right metrics NAF
  const flexBackend = activeRows.filter((r) =>
    r.morningStatus.toLowerCase().includes("part"),
  ).length;
  const ssc = activeRows.filter(
    (r) => r.morningStatus.toLowerCase() === "ssc pending",
  ).length;
  const hpBackend = activeRows.filter((r) => {
    const ms = r.morningStatus.toLowerCase();
    return (
      ms.includes("elevate") ||
      ms.includes("tech support") ||
      ms.includes("yank")
    );
  }).length;
  const obsCustomer = activeRows.filter(
    (r) => r.morningStatus.toLowerCase() === "under observation",
  ).length;
  const cuPending = activeRows.filter((r) => {
    const ms = r.morningStatus.toLowerCase();
    return ms.includes("cx") || ms.includes("visit") || ms.includes("cancel");
  }).length;
  const physicalClosed = activeRows.filter(
    (r) => r.morningStatus.toLowerCase() === "closed",
  ).length;
  const nonActionField = activeRows.filter(
    (r) =>
      r.morningStatus.toLowerCase() === "ct pending" ||
      r.morningStatus.toLowerCase() === "crt pending",
  ).length;

  const totalNaf =
    flexBackend +
    ssc +
    hpBackend +
    obsCustomer +
    cuPending +
    physicalClosed +
    nonActionField;
  const sscPercent =
    totalNaf > 0 ? ((ssc / totalNaf) * 100).toFixed(0) + "%" : "0%";

  const rightMetrics = [
    {
      label: "Date",
      value: reportDateStr.split("-").reverse().join("-"),
      bg: "bg-[#e6b8af]",
    },
    {
      label: "Non Action-Field",
      value: nonActionField > 0 ? nonActionField : "",
    },
    { label: "Flex Backend", value: flexBackend > 0 ? flexBackend : "" },
    { label: "SSC", value: ssc > 0 ? ssc : "" },
    { label: "HP Backend", value: hpBackend > 0 ? hpBackend : "" },
    { label: "OBS-Customer", value: obsCustomer > 0 ? obsCustomer : "" },
    { label: "Cu Pending", value: cuPending > 0 ? cuPending : "" },
    {
      label: "Physical Closed",
      value: physicalClosed > 0 ? physicalClosed : "",
    },
    { label: "Total NAF", value: totalNaf, bg: "bg-[#eeeeee]" },
    { label: "SSC%", value: sscPercent, bg: "bg-[#e6b8af]" },
  ];

  return { leftMetrics, rightMetrics };
}

export interface EngineerAttendanceRow {
  sNo: number;
  engineerName: string;
  assigned: number;
  attended: number;
  closed: number;
  partOrdered: number;
  underObservation: number;
  cxReschedule: number;
}

export function buildEngineerAttendanceData(
  rows: ClassifiedRow[],
): { list: EngineerAttendanceRow[]; totalAttended: number } {
  const outputRows = rows.filter((r) => r.classification !== "DROPPED");

  const engMap = new Map<
    string,
    {
      assigned: number;
      closed: number;
      partOrdered: number;
      underObservation: number;
      cxReschedule: number;
    }
  >();

  for (const row of outputRows) {
    if (row.engg && row.engg.trim() !== "") {
      const name = row.engg.trim();
      if (!engMap.has(name)) {
        engMap.set(name, {
          assigned: 0,
          closed: 0,
          partOrdered: 0,
          underObservation: 0,
          cxReschedule: 0,
        });
      }
      const data = engMap.get(name)!;
      data.assigned++;

      const ms = row.morningStatus.toLowerCase().trim();

      if (ms === "closed") {
        data.closed++;
      } else if (ms.includes("part") || ms.includes("additional part")) {
        data.partOrdered++;
      } else if (ms === "under observation") {
        data.underObservation++;
      } else if (ms === "cx reschedule" || ms === "cx pending" || ms.includes("cancel") || ms.includes("visit quote customer")) {
        data.cxReschedule++;
      }
    }
  }

  let index = 1;
  const list: EngineerAttendanceRow[] = [];
  let totalAttended = 0;

  for (const [engineerName, data] of engMap.entries()) {
    const attended = data.assigned - data.cxReschedule;
    const finalAttended = attended > 0 ? attended : 0;
    list.push({
      sNo: index++,
      engineerName,
      assigned: data.assigned,
      attended: finalAttended,
      closed: data.closed,
      partOrdered: data.partOrdered,
      underObservation: data.underObservation,
      cxReschedule: data.cxReschedule,
    });
    totalAttended += finalAttended;
  }

  // Sort alphabetically by engineer name
  list.sort((a, b) => a.engineerName.localeCompare(b.engineerName));

  list.forEach((row, idx) => {
    row.sNo = idx + 1;
  });

  return { list, totalAttended };
}
