/**
 * API client for Django backend communication.
 * All requests are authenticated via JWT.
 */

import { authFetch, API_BASE } from './auth';

// ── Types for API responses ──
export interface UploadedFileInfo {
  id: number;
  file_type: string;
  original_name: string;
  uploaded_at: string;
  city: string;
  report_date: string | null;
  file_size: number;
  row_count: number;
}

export interface UploadResponse {
  file: UploadedFileInfo;
  columns: string[];
  preview: Record<string, unknown>[];
  row_count: number;
}

export interface ProcessResponse {
  summary: {
    total: number;
    pending: number;
    new: number;
    dropped: number;
    city: string;
    report_date: string | null;
  };
  pending: ApiRow[];
  new: ApiRow[];
  dropped: ApiRow[];
  all_rows: ApiRow[];
}

export interface ApiRow {
  ticket_no: string;
  case_id: string;
  product: string;
  wip_aging: number;
  location: string;
  segment: string;
  classification: string;
  morning_status: string;
  evening_status: string;
  engineer: string;
  contact_no: string;
  parts: string;
  month: string;
  wo_otc_code: string;
  hp_owner: string;
  flex_status: string;
  wip_changed: string;
  current_status_tat: string;
}

export interface FileListItem {
  id: number;
  file_type: string;
  original_name: string;
  uploaded_at: string;
  city: string;
  report_date: string | null;
  file_size: number;
  row_count: number;
}

// ── Helper ──
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await authFetch(`${API_BASE}${url}`, options);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body}`);
  }
  return resp.json() as Promise<T>;
}

// ── Upload file ──
export async function uploadFile(
  file: File,
  fileType: 'flex_wip' | 'call_plan',
  city: string = 'Chennai',
  reportDate?: string,
  sessionId?: number,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('file_type', fileType);
  form.append('city', city);
  if (reportDate) form.append('report_date', reportDate);
  if (sessionId) form.append('session_id', String(sessionId));

  return apiFetch<UploadResponse>('/upload/', {
    method: 'POST',
    body: form,
  });
}

// ── Process call plan ──
export async function processCallPlan(
  flexFileId: number,
  callplanFileId: number | null,
  city: string,
  reportDate?: string,
): Promise<ProcessResponse> {
  const body: Record<string, unknown> = {
    flex_file_id: flexFileId,
    city,
  };
  if (callplanFileId) body.callplan_file_id = callplanFileId;
  if (reportDate) body.report_date = reportDate;

  return apiFetch<ProcessResponse>('/process/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Export to XLSX (returns blob for download) ──
export async function exportCallPlan(
  rows: ApiRow[],
  city: string,
  reportDate?: string,
): Promise<Blob> {
  const resp = await authFetch(`${API_BASE}/export/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, city, report_date: reportDate }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Export error ${resp.status}: ${body}`);
  }
  return resp.blob();
}

// ── List uploaded files ──
export async function listFiles(
  fileType?: string,
  city?: string,
  uploadedBy?: string,
): Promise<FileListItem[]> {
  const params = new URLSearchParams();
  if (fileType) params.set('file_type', fileType);
  if (city) params.set('city', city);
  if (uploadedBy) params.set('uploaded_by', uploadedBy);
  const qs = params.toString();
  return apiFetch<FileListItem[]>(`/files/${qs ? '?' + qs : ''}`);
}

// ── Get file detail ──
export async function getFileDetail(id: number): Promise<UploadedFileInfo> {
  return apiFetch<UploadedFileInfo>(`/files/${id}/`);
}

// ── Get processing history ──
export async function getHistory(): Promise<FileListItem[]> {
  return apiFetch<FileListItem[]>('/history/');
}

// ── Upload Sessions ──
export interface UploadSessionInfo {
  id: number;
  uploaded_by: string;
  city: string;
  report_date: string | null;
  created_at: string;
  files: FileListItem[];
}

export async function createUploadSession(
  city: string = 'Chennai',
  reportDate?: string,
): Promise<UploadSessionInfo> {
  const body: Record<string, unknown> = { city };
  if (reportDate) body.report_date = reportDate;

  return apiFetch<UploadSessionInfo>('/sessions/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function listUploadSessions(
  city?: string,
): Promise<UploadSessionInfo[]> {
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  const qs = params.toString();
  return apiFetch<UploadSessionInfo[]>(`/sessions/list/${qs ? '?' + qs : ''}`);
}

// ── Manual WO ──
export async function addManualWO(
  row: ApiRow & { city?: string; report_date?: string },
): Promise<ApiRow> {
  return apiFetch<ApiRow>('/manual-wo/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
}

// ── Closed Calls ──
export interface ClosedCallInfo {
  id: number;
  ticket_no: string;
  case_id: string;
  product: string;
  wip_aging: number;
  location: string;
  segment: string;
  engineer: string;
  contact_no: string;
  parts: string;
  month: string;
  wo_otc_code: string;
  hp_owner: string;
  flex_status: string;
  morning_status: string;
  evening_status: string;
  current_status_tat: string;
  city: string;
  report_date: string | null;
  closed_by: string;
  closed_at: string;
}

export async function markClosedCall(
  row: ApiRow & { city?: string; report_date?: string },
): Promise<ClosedCallInfo> {
  return apiFetch<ClosedCallInfo>('/closed-calls/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
}

export async function listClosedCalls(
  city?: string,
  reportDate?: string,
): Promise<ClosedCallInfo[]> {
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (reportDate) params.set('report_date', reportDate);
  const qs = params.toString();
  return apiFetch<ClosedCallInfo[]>(`/closed-calls/list/${qs ? '?' + qs : ''}`);
}

// ── Save Analysis Result ──
export async function saveAnalysis(data: {
  city: string;
  report_date?: string;
  session_id?: number;
  total_count: number;
  pending_count: number;
  new_count: number;
  dropped_count: number;
  result_data?: Record<string, unknown>;
}): Promise<AnalysisInfo> {
  return apiFetch<AnalysisInfo>('/analyses/save/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Analysis History ──
export interface AnalysisInfo {
  id: number;
  session: number | null;
  flex_file: number | null;
  callplan_file: number | null;
  city: string;
  report_date: string | null;
  analyzed_by: string;
  analyzed_at: string;
  total_count: number;
  pending_count: number;
  new_count: number;
  dropped_count: number;
}

export async function listAnalyses(
  city?: string,
  reportDate?: string,
): Promise<AnalysisInfo[]> {
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (reportDate) params.set('report_date', reportDate);
  const qs = params.toString();
  return apiFetch<AnalysisInfo[]>(`/analyses/${qs ? '?' + qs : ''}`);
}

// ── Workspace State Synchronization ──
export async function syncWorkspace(
  state: any,
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/workspace/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

export async function getWorkspace(): Promise<any> {
  return apiFetch<any>('/workspace/');
}
