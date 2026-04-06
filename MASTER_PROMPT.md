# MASTER PROMPT — Renderways Daily Call Plan Generator

> Reverse-engineered from verified production data. Every rule below is proven against real files: Flex_WIP_ASP_Report.csv (30 Mar), Chennai 30th March Call Plan.xlsx, and Chennai 31st March Call Plan.xlsx.

---

## ROLE

You are building a web application for Renderways Technologies Private Limited (HP Authorized Service Provider, Tamil Nadu). The app automates the daily generation of the **"Open Call" sheet** — the field operations call plan sent to HP Flex before 11:00 AM every day.

---

## WORKFLOW (what happens every morning)

```
07:30 AM — Operator downloads today's Flex WIP Report (CSV) from HP Flex portal
07:35 AM — Operator opens this app in browser
07:36 AM — Uploads: (1) Today's Flex WIP CSV  (2) Yesterday's Call Plan XLSX
07:37 AM — App generates today's Call Plan (same 13-column "Open Call" format)
07:38 AM — Operator reviews, assigns engineers to NEW entries, updates statuses
08:00 AM — Operator exports XLSX → sends to HP Flex
```

**Current manual process: 1-2 hours. Target: under 5 minutes.**

---

## INPUTS

### Input 1: Today's Flex WIP Report

| Property | Value |
|----------|-------|
| Source | HP Flex Portal → WIP ASP Report download |
| Format | CSV (latin-1 encoding) or XLSX |
| Scope | ALL open WOs across ALL ASP cities (Chennai, Vellore, Salem, Kanchipuram, etc.) |
| Rows | ~200-400 (contains duplicates — one WO appears once per part order line) |
| Primary Key | Column `Ticket No` (format: `WO-XXXXXXXXX`) |

**Columns used (47 total, only these matter for output):**

```
Ticket No              → Primary key (e.g., WO-033005324)
Case Id                → HP case reference number
Product Name           → Full HP product name
Create Time            → WO creation timestamp (format: "Wed Mar 11 16:13:41 UTC 2026")
ASP City               → CITY FILTER: "Chennai", "Vellore", "Salem", "Kanchipuram"
Work Location          → ASP location code (e.g., ASPS01461 = Chennai)
WO OTC Code            → Warranty/service type → used for Segment mapping
Business Segment       → "Computing" or "Printing" → used for Segment mapping
Status                 → Current Flex status (e.g., "Engineer Assignment Pending")
Customer Phone No      → Format: "916381510725" (with country code + decimal)
Customer City          → City name for Location field (fallback for new entries)
Customer Address       → Full address (for location reference)
Booking Resource       → ASP resource string (e.g., "INY_EEG_ASP_FlexRndrwaysChennai")
```

**CRITICAL BEHAVIORS:**
- Flex WIP contains ONLY open/active WOs. A WO disappearing from today's Flex means HP closed it or reassigned it.
- Same `Ticket No` appears multiple times (once per part line). You MUST deduplicate: keep LAST row per WO ID.
- CSV uses latin-1 encoding (Indian names/addresses).

### Input 2: Yesterday's Call Plan

| Property | Value |
|----------|-------|
| Source | Internal XLSX workbook (multiple sheets) |
| Target Sheet | `Open Call` (auto-detect by sheet name) |
| Rows | ~50-100 |
| Primary Key | Column `Ticket No` |

**Exact 13-column schema (this IS the output format too):**

```
Column 1:  Month              → Date (WO creation date, carried forward; NaT/blank for new entries)
Column 2:  Ticket No          → WO ID (WO-XXXXXXXXX)
Column 3:  Case Id            → HP case reference
Column 4:  Product            → HP product name
Column 5:  WIP Aging          → Integer (days since creation)
Column 6:  Location           → Area/locality name (e.g., "Kodambakkam", "Anna Nagar", "porur")
Column 7:  Segment            → "Trade" | "print" | "Pc" | "Install" | "Print" | "PC"
Column 8:  Morning Status     → Free-text (operator fills: "Actionable", "Part Pending", "need to cancel", etc.)
Column 9:  Evening Status     → Free-text (operator fills at EOD)
Column 10: Current Status-TAT → Status note or TAT info (e.g., "ETA: 31/03/2026")
Column 11: Engg.              → Engineer first name (e.g., "sriram", "Lava", "Thamarai", "Praveen")
Column 12: Contact no.        → 10-digit phone number
Column 13: Parts              → Parts description
```

**Structure within the sheet:**
- **Rows with Month dates** = PENDING entries (carried from previous days)
- **Rows with blank/NaT Month** = NEW entries (added that day from Flex)
- Sorted by WIP Aging descending (oldest first), with PENDING block before NEW block
- **Bottom summary rows** (after empty rows): Engineer-wise counts like "Actionable-18", "Lava-6", "Sriram-4"

---

## OUTPUT: Today's Call Plan

**Format:** XLSX file with "Open Call" sheet — IDENTICAL 13-column structure as yesterday's plan.

---

## COMPARISON ALGORITHM (exact specification)

```
STEP 1: FILTER & DEDUPLICATE FLEX
  a. Filter Flex WIP rows WHERE ASP City == "Chennai" (configurable)
  b. Keep only rows where Ticket No matches WO-XXXXXXXXX pattern
  c. Deduplicate: HashMap<Ticket_No, Row> — last occurrence wins
  → Result: flex_map (O(1) lookup, ~64 unique WOs for Chennai)

STEP 2: LOAD YESTERDAY'S "OPEN CALL"
  a. Read the "Open Call" sheet from yesterday's XLSX
  b. Keep only rows where Ticket No is valid WO-XXXXXXXXX
  c. Build: rtpl_map = HashMap<Ticket_No, Row>
  → Result: rtpl_map (O(1) lookup, ~57 WOs)

STEP 3: CLASSIFY EVERY WO
  For each WO in flex_map:
    IF WO exists in rtpl_map → PENDING (carry from yesterday)
    IF WO does NOT exist in rtpl_map → NEW (fresh from today's Flex)

  For each WO in rtpl_map:
    IF WO does NOT exist in flex_map → DROPPED (closed/reassigned by HP)

STEP 4: BUILD OUTPUT ROWS
  → Details in "FIELD-BY-FIELD RULES" section below

STEP 5: SORT
  a. PENDING rows first → sorted by WIP Aging descending (oldest first)
  b. NEW rows second → sorted by WIP Aging descending

STEP 6: APPEND SUMMARY
  After 4-5 empty rows, add summary in Location column:
  - "Actionable-{count}" (count of Morning Status = "Actionable")
  - "{Engineer}-{count}" for each engineer, sorted by count descending
```

---

## FIELD-BY-FIELD RULES

### For PENDING rows (WO in BOTH Flex and yesterday's plan):

| Column | Rule | Source |
|--------|------|--------|
| Month | **Carry from yesterday** (keep exact date value) | Yesterday's Call Plan |
| Ticket No | Same WO ID | Either |
| Case Id | **Carry from yesterday** | Yesterday's Call Plan |
| Product | **Carry from yesterday** | Yesterday's Call Plan |
| WIP Aging | **Yesterday's aging + 1** | Calculated |
| Location | **Carry from yesterday** | Yesterday's Call Plan |
| Segment | **Carry from yesterday** | Yesterday's Call Plan |
| Morning Status | **Carry from yesterday** (operator updates manually before sending) | Yesterday's Call Plan |
| Evening Status | **BLANK** (clear it — new day, fresh evening slot) | Reset |
| Current Status-TAT | **Carry from yesterday** | Yesterday's Call Plan |
| Engg. | **Carry from yesterday** | Yesterday's Call Plan |
| Contact no. | **Carry from yesterday** | Yesterday's Call Plan |
| Parts | **Carry from yesterday** | Yesterday's Call Plan |

**Why "yesterday + 1" for WIP Aging:** Verified against real data — 33 of 35 pending rows in 31st have aging = 30th aging + 1. The 2 exceptions were manual corrections where the 30th had wrong values. The +1 rule is what operators actually use.

### For NEW rows (WO in Flex but NOT in yesterday's plan):

| Column | Rule | Source |
|--------|------|--------|
| Month | **BLANK** (leave empty / NaT) | — |
| Ticket No | From Flex `Ticket No` | Flex WIP |
| Case Id | From Flex `Case Id` | Flex WIP |
| Product | From Flex `Product Name` | Flex WIP |
| WIP Aging | **(report_date - create_date).days** where create_date = Flex `Create Time` parsed to date. If parse fails, use 0. | Calculated |
| Location | From Flex `Customer City` (operator refines to area-level later) | Flex WIP |
| Segment | **Mapped from Flex** (see Segment Mapping Rules) | Flex WIP |
| Morning Status | **BLANK** (operator fills: "Actionable", "Part Pending", etc.) | — |
| Evening Status | **BLANK** | — |
| Current Status-TAT | From Flex `Status` | Flex WIP |
| Engg. | **BLANK** (operator assigns from dropdown) | — |
| Contact no. | From Flex `Customer Phone No` → **cleaned** (see Phone Rules) | Flex WIP |
| Parts | **BLANK** | — |

### For DROPPED rows (WO in yesterday's plan but NOT in today's Flex):

These are **NOT included in the output "Open Call" sheet**. They are silently removed — the WO was closed or reassigned by HP.

**However, the app should show them in a separate "Dropped" tab for operator awareness.** (Verified: 18 WOs dropped between 30th→31st, 11 of which had been closed in Flex, 7 were still open in the March 30 Flex but disappeared from March 31 Flex.)

---

## SEGMENT MAPPING RULES

Derived from matching Flex `WO OTC Code` + `Business Segment` against actual Call Plan `Segment` values:

```
PRIORITY 1 — Check OTC Code first:
  IF OTC Code contains "Trade" (e.g., "01-Trade")           → "Trade"
  IF OTC Code contains "Install" or "05F" (e.g., "05F-Comp Field Install")  → "Install"

PRIORITY 2 — Fall back to Business Segment:
  IF Business Segment = "Computing"    → "Pc"
  IF Business Segment = "Printing"     → "print"

DEFAULT:
  Use Business Segment as-is
```

**Verified mapping table (from real data):**
```
OTC="01-Trade" + ANY segment       → "Trade"    (36 matches)
OTC="05F-Comp Field Install"       → "Install"  (1 match)
OTC="05K-Extended Warranty" + Computing  → "Pc"  (6 matches)
OTC="05K-Extended Warranty" + Printing   → "print" (8 matches)
OTC="02N-Normal Warranty" + Computing    → "Pc"  (1 match)
OTC="02N-Normal Warranty" + Printing     → "print" (1 match)
OTC="05R-Normal Contract" + Computing    → "Pc"  (2 matches)
OTC="00C-Claims Contract" + Printing     → "print" (2 matches)
```

---

## PHONE NUMBER CLEANUP

```
Input examples:
  "916381510725"     → "6381510725"
  "919791272922"     → "9791272922"
  "916381510725.0"   → "6381510725"
  "8838299489"       → "8838299489"

Rules:
  1. Convert to string, strip whitespace
  2. Remove trailing ".0" (pandas float artifact)
  3. Remove all non-digit characters
  4. If 12 digits and starts with "91" → strip "91" prefix
  5. Result: 10-digit Indian mobile number
```

---

## FLEX CREATE TIME PARSING

```
Input:  "Wed Mar 11 16:13:41 UTC 2026"
Output: Date object (2026-03-11)

Method: Strip " UTC", parse with standard date parser
If parse fails: set WIP Aging = 0, Month = blank
```

---

## SORT ORDER (verified from real data)

```
Section 1: PENDING rows
  → Sorted by WIP Aging DESCENDING (26, 21, 20, 16, 16, 13, 13, 12, 10, 10, ...)
  → Oldest WOs at top, newest pending at bottom

Section 2: NEW rows
  → Sorted by WIP Aging DESCENDING (2, 2, 2, 1, 1, 1, 0, 0, 0, 0, ...)
  → Older new entries first, today's new entries last

Section 3: Empty rows (4-5 blank rows)

Section 4: Summary rows in Location column
  → "Actionable-{count}"
  → "{Engineer}-{count}" for each engineer, descending by count
```

---

## WEB APPLICATION REQUIREMENTS

### Architecture
- Single-page HTML application (no backend, no install)
- All processing in browser (JavaScript)
- Libraries: SheetJS (XLSX read/write), PapaParse (CSV parsing)

### Step 1: Upload
- Left panel: Today's Flex WIP (CSV or XLSX)
- Right panel: Yesterday's Call Plan (XLSX)
- Auto-detect "Open Call" sheet in yesterday's XLSX
- Auto-detect ASP City values for filter dropdown (default: "Chennai")
- Configurable report date (default: today)

### Step 2: Review
- Show metrics: Flex total, Pending count, New count, Dropped count, Final output count
- Show comparison table in exact 13-column format
- Tabs: All | Pending | New | Dropped
- Color code: PENDING rows in amber, NEW rows in green, DROPPED in red
- Sort by WIP Aging descending (matching real output order)

### Step 3: Edit (critical for operator workflow)
- **Inline editing** on these columns for NEW rows:
  - Morning Status (dropdown: "Actionable", "Part Pending", "CRT Pending", "Cx pending", "need to cancel", "additional part", "visit quote to Customer", "request to cancel", "Under observation", "Visit Estimate", "Manual Part", custom text)
  - Engg. (dropdown: configurable engineer list, default: "sriram, Lava, Thamarai, Praveen, sasikumar, naveen")
  - Location (text input — operator refines from city to area)
  - Parts (text input)
  - Current Status-TAT (text input)
- **Inline editing** on PENDING rows too (operator updates morning status, reassigns engineers)
- Evening Status is always blank at generation (filled at EOD)

### Step 4: Export
- **Primary export: XLSX** with exact "Open Call" sheet format
  - 13 columns, no Type/classification column
  - PENDING rows first (with Month dates), then NEW rows (blank Month)
  - Sorted by WIP Aging descending within each section
  - Summary rows at bottom (Actionable count, Engineer counts)
  - File name: `Chennai_{date}_Call_Plan.xlsx`
- **Secondary: Dropped sheet** (separate tab showing removed WOs)
- **Secondary: CSV export** of current view

### Edge Cases (all verified from real data)
- CSV with latin-1 encoding (Indian names with special characters)
- XLSX with multiple sheets — must auto-find "Open Call"
- Case Id becomes float in Excel (5156348638 → 5156348638.0) — preserve as-is
- WIP Aging can be 0 (WO created same day)
- Some Flex WOs have no Create Time → set aging = 0
- Phone numbers stored as float (916381510725.0) → clean to string
- Duplicate Flex WOs (same ID, multiple part lines) → keep last occurrence
- Empty rows at bottom of yesterday's plan → ignore
- Yesterday's plan may have its own summary rows at bottom → skip non-WO rows

---

## VERIFIED METRICS (30th→31st transition)

```
Flex WIP total rows:                    294
Flex WIP unique WOs (all cities):       235
Flex WIP Chennai (filtered+deduped):    64

Yesterday (30th) Open Call:             57 WOs (44 with Month, 13 without)
Today (31st) Open Call:                 52 WOs (35 with Month, 17 without)

PENDING (in both):                      35 → carried to 31st with aging+1
NEW (in Flex, not in 30th):             17 → added to 31st with blank Month
DROPPED (in 30th, not in Flex):         18 → silently removed
  - 11 had been closed in HP Flex
  - 7 still showed in March 30 Flex but gone from March 31 Flex

Morning Status changes (30th→31st):     12 of 35 pending rows (34%) were updated by operator
Engineer changes:                        4 of 35 (11%) were reassigned
Location changes:                        1 of 35 (3%)
Parts changes:                           5 of 35 (14%)
```

---

## WHAT THIS APP DOES NOT DO

- Does NOT auto-assign engineers (operator decides based on location + workload)
- Does NOT connect to HP Flex API (operator downloads CSV manually)
- Does NOT persist data between sessions (fresh comparison each time)
- Does NOT modify yesterday's file (read-only input)
- Does NOT handle multiple cities in one output (one city per run, filter dropdown)
- Does NOT auto-fill Morning Status for new entries (operator triages manually)

---

## SUCCESS CRITERIA

1. Output "Open Call" sheet matches the exact 13-column format
2. PENDING rows carry all fields from yesterday with WIP Aging +1
3. NEW rows populate from Flex with correct Segment mapping and phone cleanup
4. Sort order: PENDING (aging desc) → NEW (aging desc) → Summary rows
5. Inline editing works for Morning Status, Engineer, Location, Parts
6. Exported XLSX is ready to send to HP Flex without manual reformatting
7. Total workflow: upload → review → edit → export in under 5 minutes
