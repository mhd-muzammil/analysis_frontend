import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppStep, ClassifiedRow, ProcessingResult } from '../lib/types';
import { DEFAULT_ENGINEERS } from '../lib/types';
import { isValidWO } from '../lib/engine';
import { getWorkspace, syncWorkspace } from '../api/client';
import { realtimeClient, type WSMessage } from '../api/websocket';
import { clearTokens } from '../api/auth';

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

  // WebSocket connection status
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

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
        // Disconnect WebSocket and clear tokens
        realtimeClient.disconnect();
        clearTokens();
        set({
          isLoggedIn: false,
          username: '',
          step: 'login',
          wsConnected: false,
          // Note: Analysis data is NOT cleared on logout to fulfill the user request
          // "naa login logout pannalum data maintaine agitte irukanum"
        });
      },

      wsConnected: false,
      setWsConnected: (connected) => set({ wsConnected: connected }),

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
          return { rows: [row, ...state.rows] };
        }),

      updateRow: (ticketNo, field, value) =>
        set((state) => {
          const up = (r: ClassifiedRow) =>
            r.ticketNo.trim().toUpperCase() === ticketNo.trim().toUpperCase()
              ? { ...r, [field]: value }
              : r;

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
              // don't overwrite local auth/ws variables
              isLoggedIn: state.isLoggedIn,
              username: state.username,
              step: state.step,
              wsConnected: state.wsConnected,
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

// ── WebSocket message handler ──
// Listens for workspace updates from other clients and applies them
realtimeClient.onMessage((msg: WSMessage) => {
  if (msg.type === 'workspace_updated') {
    const currentUser = useStore.getState().username;
    // Only apply if from another user (avoid echo)
    if (msg.source && msg.source !== currentUser && msg.payload) {
      applyingRemote = true;
      useStore.setState((state) => ({
        ...state,
        ...msg.payload,
        // Preserve local auth/nav state
        isLoggedIn: state.isLoggedIn,
        username: state.username,
        step: state.step,
        wsConnected: state.wsConnected,
      }));
      applyingRemote = false;
    }
  }
});

// Track WebSocket connection status
realtimeClient.onStatusChange((connected) => {
  useStore.getState().setWsConnected(connected);
});

// ── Background auto-sync: push changes via WebSocket ──
let syncTimeout: ReturnType<typeof setTimeout>;
useStore.subscribe((state, prevState) => {
  // Don't push if we're applying a remote update
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
        const dataToSync = {
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
        };

        if (realtimeClient.isConnected) {
          // Push via WebSocket (instant broadcast to all clients)
          realtimeClient.sendWorkspaceUpdate(dataToSync);
        } else {
          // Fallback to REST API if WebSocket is disconnected
          syncWorkspace(dataToSync).catch((err) =>
            console.error('REST sync error:', err),
          );
        }
      }, 300);
    }
  }
});
