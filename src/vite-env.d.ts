/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend REST API base URL (e.g., https://analysis.systimus.in/api) */
  readonly VITE_API_BASE: string;
  /** Backend WebSocket base URL (e.g., wss://analysis.systimus.in) */
  readonly VITE_WS_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
