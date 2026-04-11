// 16-column Open Call schema
export interface CallPlanRow {
  month: string;         // Date string or blank
  ticketNo: string;      // WO-XXXXXXXXX
  woOtcCode: string;     // Added WO OTC Code
  caseId: string;
  product: string;
  wipAging: number;
  location: string;
  segment: string;
  hpOwner: string;           // HP Owner from Flex WIP
  flexStatus: string;        // Status from Flex WIP
  wipChanged: string;        // WIP changed from morning report (Yes/No/New)
  morningStatus: string;
  eveningStatus: string;
  currentStatusTAT: string;
  engg: string;
  contactNo: string;
  parts: string;
}

export type WOClassification = 'PENDING' | 'NEW' | 'DROPPED';

export interface ClassifiedRow extends CallPlanRow {
  classification: WOClassification;
}

export interface FlexRow {
  ticketNo: string;
  caseId: string;
  productName: string;
  createTime: string;
  aspCity: string;
  workLocation: string;
  woOtcCode: string;
  businessSegment: string;
  status: string;
  customerPhoneNo: string;
  customerCity: string;
  customerAddress: string;
  bookingResource: string;
  wipAgingRaw: number;       // Pre-calculated WIP Aging from Flex XLSX (0 if absent)
  hpOwner: string;           // HP Owner
  flexStatus: string;    // Status from Flex WIP
}

export interface ProcessingResult {
  all: ClassifiedRow[];
  pending: ClassifiedRow[];
  new: ClassifiedRow[];
  dropped: ClassifiedRow[];
  metrics: {
    flexTotal: number;
    flexFiltered: number;
    yesterdayTotal: number;
    pendingCount: number;
    newCount: number;
    droppedCount: number;
    finalCount: number;
    tradeCount: number;
    actionableCount: number;
    toScheduleCount: number;
    sscPendingCount: number;
    techSupportCount: number;
    toYankCount: number;
    enggPresentCount: number;
  };
}

export type AppStep = 'login' | 'upload' | 'review' | 'export';

export const COLUMNS = [
  'Month', 'Ticket No', 'Case Id', 'WO OTC Code', 'Product', 'WIP Aging',
  'Location', 'Segment', 'HP Owner', 'Flex Status', 
  'Morning Report', 'Evening Report',
  'Current Status-TAT', 'Engg.', 'Contact no.', 'Parts', 'WIP Changed'
] as const;

export const MORNING_STATUS_OPTIONS = [
  '',
  'Actionable',
  'Additional Part',
  'CRT Pending',
  'CT Pending',
  'CT Validation Pending',
  'Cx Pending',
  'Problem Resolution',
  'Part Order Pending',
  'Need to Cancel',
  'Need to Cancel - Mail',
  'Need to Yank',
  'Part Pending',
  'To be Scheduled',
  'Visit Estimate',
  'Visit Quote Customer',
  'Yank',
  'Under Observation',
  'Elevation Part Pending',
  'Elevation - WP Pending',
  'OTP',
];

export const DEFAULT_ENGINEERS = [
  '', 'sriram', 'Lava', 'Thamarai', 'Praveen', 'sasikumar', 'naveen'
];
