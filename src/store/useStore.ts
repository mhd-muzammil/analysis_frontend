import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppStep, ClassifiedRow, ProcessingResult } from '../lib/types';
import { DEFAULT_ENGINEERS } from '../lib/types';
import { isValidWO } from '../lib/engine';
import { getWorkspace, syncWorkspace, addManualWO, markClosedCall } from '../api/client';
import { realtimeClient, SESSION_ID, type WSMessage } from '../api/websocket';
import { clearTokens } from '../api/auth';

export interface ActiveUser {
  username: string;
  session_id: string;
  action: string;
  detail?: string;
  last_seen: number; // timestamp
}

interface AppState {
  // Navigation
  step: AppStep;
  setStep: (step: AppStep) => void;

  // Auth state
  isLoggedIn: boolean;
  username: string;
  setLoggedIn: (isLoggedIn: boolean) => void;
  setUsername: (username: string) => void;
  logout: () => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // WebSocket connection status
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  // Active users / presence
  activeUsers: ActiveUser[];
  setActiveUsers: (users: ActiveUser[]) => void;

  // Upload state
  flexData: Record<string, unknown>[] | null;
  yesterdayData: Record<string, unknown>[] | null;
  availableCities: string[];
  selectedCity: string;
  reportDate: string; // YYYY-MM-DD
  setFlexData: (data: Record<string, unknown>[], cities: string[]) => void;
  setYesterdayData: (data: Record<string, unknown>[]) => void;
  setSelectedCity: (city: string) => void;
  setReportDate: (date: string) => void;

  // Processing result
  result: ProcessingResult | null;
  setResult: (result: ProcessingResult) => void;

  // Editable rows (the working copy)
  rows: ClassifiedRow[];
  droppedRows: ClassifiedRow[];
  setRows: (rows: ClassifiedRow[]) => void;
  setDroppedRows: (rows: ClassifiedRow[]) => void;
  addRow: (row: ClassifiedRow) => void;
  updateRow: (ticketNo: string, field: keyof ClassifiedRow, value: string | number) => void;

  // Active tab in review
  activeTab: 'all' | 'actionable' | 'planned' | 'trade' | 'pending' | 'new' | 'dropped';
  setActiveTab: (tab: 'all' | 'actionable' | 'planned' | 'trade' | 'pending' | 'new' | 'dropped') => void;

  // Engineer list (configurable)
  engineers: string[];
  setEngineers: (engineers: string[]) => void;

  // Reset
  reset: () => void;

  // Cloud Sync (REST fallback)
  restoreFromCloud: () => Promise<void>;
}

const today = new Date().toISOString().split('T')[0];

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      step: 'login',
      setStep: (step) => set({ step }),

      isLoggedIn: false,
      username: '',
      setLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
      setUsername: (username) => set({ username }),
      logout: () => {
        realtimeClient.disconnect();
        clearTokens();
        set({
          isLoggedIn: false,
          username: '',
          step: 'login',
          wsConnected: false,
          activeUsers: [],
        });
      },

      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

      wsConnected: false,
      setWsConnected: (connected) => set({ wsConnected: connected }),

      activeUsers: [],
      setActiveUsers: (users) => set({ activeUsers: users }),

      flexData: null,
      yesterdayData: null,
      availableCities: [],
      selectedCity: 'Chennai',
      reportDate: today,
      setFlexData: (data, cities) =>
        set({
          flexData: data,
          availableCities: cities.length > 0 ? ['all', ...cities] : [],
          selectedCity: 'all',
        }),
      setYesterdayData: (data) => set({ yesterdayData: data }),
      setSelectedCity: (city) => set({ selectedCity: city }),
      setReportDate: (date) => set({ reportDate: date }),

      result: null,
      setResult: (result) => set({ result }),

      rows: [],
      droppedRows: [],
      setRows: (rows) => set({ rows }),
      setDroppedRows: (rows) => set({ droppedRows: rows }),

      addRow: (row) =>
        set((state) => {
          const trimmedWO = row.ticketNo.trim().toUpperCase();
          if (!isValidWO(trimmedWO)) {
            alert('Invalid Work Order Format (Expected: WO-XXXXXXXXX)');
            return state;
          }
          const exists = state.rows.some(
            (r) => r.ticketNo.trim().toUpperCase() === trimmedWO,
          );
          if (exists) {
            alert(`Work Order ${trimmedWO} already exists in the table.`);
            return state;
          }

          // Save manual WO to DB
          addManualWO({
            ticket_no: trimmedWO,
            case_id: row.caseId || '',
            product: row.product || '',
            wip_aging: row.wipAging || 0,
            location: row.location || '',
            segment: row.segment || '',
            classification: row.classification || 'NEW',
            morning_status: row.morningStatus || 'To be scheduled',
            evening_status: row.eveningStatus || '',
            engineer: row.engg || '',
            contact_no: row.contactNo || '',
            parts: row.parts || '',
            month: row.month || '',
            wo_otc_code: row.woOtcCode || '',
            hp_owner: row.hpOwner || 'Manual',
            flex_status: row.flexStatus || 'Manual Entry',
            wip_changed: row.wipChanged || 'New',
            current_status_tat: row.currentStatusTAT || '',
            city: state.selectedCity !== 'all' ? state.selectedCity : 'Chennai',
            report_date: state.reportDate,
          }).catch((err) => console.error('Failed to save manual WO to DB:', err));

          return { rows: [row, ...state.rows] };
        }),

      updateRow: (ticketNo, field, value) =>
        set((state) => {
          const up = (r: ClassifiedRow) =>
            r.ticketNo.trim().toUpperCase() === ticketNo.trim().toUpperCase()
              ? { ...r, [field]: value }
              : r;

          // If morning status is being changed to "Closed" or "Closed cancelled", copy to ClosedCall table
          if (
            field === 'morningStatus' &&
            typeof value === 'string' &&
            (value.toLowerCase() === 'closed' || value.toLowerCase() === 'closed cancelled')
          ) {
            const row = state.rows.find(
              (r) => r.ticketNo.trim().toUpperCase() === ticketNo.trim().toUpperCase(),
            );
            if (row) {
              markClosedCall({
                ticket_no: row.ticketNo,
                case_id: row.caseId || '',
                product: row.product || '',
                wip_aging: row.wipAging || 0,
                location: row.location || '',
                segment: row.segment || '',
                classification: row.classification || 'PENDING',
                morning_status: 'Closed',
                evening_status: row.eveningStatus || '',
                engineer: row.engg || '',
                contact_no: row.contactNo || '',
                parts: row.parts || '',
                month: row.month || '',
                wo_otc_code: row.woOtcCode || '',
                hp_owner: row.hpOwner || '',
                flex_status: row.flexStatus || '',
                wip_changed: row.wipChanged || '',
                current_status_tat: row.currentStatusTAT || '',
                city: state.selectedCity !== 'all' ? state.selectedCity : 'Chennai',
                report_date: state.reportDate,
              }).catch((err) => console.error('Failed to save closed call to DB:', err));
            }
          }

          return {
            rows: state.rows.map(up),
            droppedRows: state.droppedRows.map(up),
          };
        }),

      activeTab: 'all',
      setActiveTab: (tab) => set({ activeTab: tab }),

      engineers: DEFAULT_ENGINEERS,
      setEngineers: (engineers) => set({ engineers }),

      reset: () =>
        set({
          step: 'review',
          flexData: null,
          yesterdayData: null,
          availableCities: [],
          selectedCity: 'all',
          reportDate: today,
          result: null,
          rows: [],
          droppedRows: [],
          activeTab: 'all',
        }),

      restoreFromCloud: async () => {
        try {
          const workspace = await getWorkspace();
          if (workspace && Object.keys(workspace).length > 0) {
            set((state) => ({
              ...state,
              ...workspace,
              isLoggedIn: state.isLoggedIn,
              username: state.username,
              step: state.step,
              wsConnected: state.wsConnected,
              activeUsers: state.activeUsers,
            }));
          }
        } catch (error) {
          console.error('Failed to restore from cloud', error);
        }
      },
    }),
    {
      name: 'opencall-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        flexData: state.flexData,
        yesterdayData: state.yesterdayData,
        availableCities: state.availableCities,
        selectedCity: state.selectedCity,
        reportDate: state.reportDate,
        result: state.result,
        rows: state.rows,
        droppedRows: state.droppedRows,
        activeTab: state.activeTab,
        engineers: state.engineers,
        username: state.username,
        isLoggedIn: state.isLoggedIn,
        step: state.step,
      }),
    },
  ),
);

// ── Flag to suppress re-broadcast while applying remote update ──
let applyingRemote = false;

// ── Prune stale active users (no activity for 15 seconds) ──
setInterval(() => {
  const now = Date.now();
  const current = useStore.getState().activeUsers;
  const alive = current.filter((u) => now - u.last_seen < 15000);
  if (alive.length !== current.length) {
    useStore.getState().setActiveUsers(alive);
  }
}, 5000);

// ── WebSocket message handler ──
realtimeClient.onMessage((msg: WSMessage) => {
  if (msg.type === 'workspace_updated') {
    // Use session_id for echo suppression — allows same user on different devices to sync
    if (msg.session_id === SESSION_ID) return;

    if (msg.payload) {
      applyingRemote = true;
      useStore.setState((state) => ({
        ...state,
        ...msg.payload,
        // Preserve local auth/nav/presence state
        isLoggedIn: state.isLoggedIn,
        username: state.username,
        step: state.step,
        wsConnected: state.wsConnected,
        activeUsers: state.activeUsers,
      }));
      applyingRemote = false;
    }
  }

  if (msg.type === 'presence_update' && msg.payload) {
    // Full list of connected users from server
    const users: ActiveUser[] = (msg.payload.users || []).map((u: any) => ({
      ...u,
      last_seen: Date.now(),
    }));
    useStore.getState().setActiveUsers(users);
  }

  if (msg.type === 'user_activity') {
    if (msg.session_id === SESSION_ID) return;

    // Update the activity for this specific user session
    const incoming: ActiveUser = {
      username: msg.source || 'unknown',
      session_id: msg.session_id || '',
      action: msg.payload?.action || 'viewing',
      detail: msg.payload?.detail,
      last_seen: Date.now(),
    };

    const current = useStore.getState().activeUsers;
    const idx = current.findIndex((u) => u.session_id === incoming.session_id);
    if (idx >= 0) {
      const updated = [...current];
      updated[idx] = incoming;
      useStore.getState().setActiveUsers(updated);
    } else {
      useStore.getState().setActiveUsers([...current, incoming]);
    }
  }
});

// Track WebSocket connection status
realtimeClient.onStatusChange((connected) => {
  useStore.getState().setWsConnected(connected);
  if (!connected) {
    useStore.getState().setActiveUsers([]);
  }
});

// ── Background auto-sync: push changes via WebSocket ──
let syncTimeout: ReturnType<typeof setTimeout>;
useStore.subscribe((state, prevState) => {
  if (applyingRemote) return;

  if (state.isLoggedIn) {
    const changed =
      prevState.rows !== state.rows ||
      prevState.droppedRows !== state.droppedRows ||
      prevState.flexData !== state.flexData ||
      prevState.result !== state.result;

    if (changed) {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        const dataToSync: Record<string, any> = {
          availableCities: state.availableCities,
          selectedCity: state.selectedCity,
          reportDate: state.reportDate,
          result: state.result,
          rows: state.rows,
          droppedRows: state.droppedRows,
          activeTab: state.activeTab,
          engineers: state.engineers,
        };

        if (prevState.flexData !== state.flexData) {
          dataToSync.flexData = state.flexData;
        }
        if (prevState.yesterdayData !== state.yesterdayData) {
          dataToSync.yesterdayData = state.yesterdayData;
        }

        if (realtimeClient.isConnected) {
          realtimeClient.sendWorkspaceUpdate(dataToSync);
        } else {
          syncWorkspace(dataToSync).catch((err) =>
            console.error('REST sync error:', err),
          );
        }
      }, 50);
    }
  }
});
