export interface BrowserTelemetryConfig {
  projectId: string;
  dashboardUrl?: string;
  projectKey?: string;
  intervalMs?: number;
  serviceType?: "web" | "api" | "worker";
  version?: string;
  environment?: "production" | "staging" | "development";
  /** Перехват window.onerror / unhandledrejection (по умолчанию true) */
  autoCatchErrors?: boolean;
  /** Учёт SPA-навигации через history API (по умолчанию true) */
  trackSpa?: boolean;
  /** Обёртка window.fetch для RPS/latency/кодов (по умолчанию true) */
  wrapFetch?: boolean;
}

export interface IncidentReport {
  title: string;
  severity?: "critical" | "warning" | "minor";
  rootCause?: string;
}

export class BrowserTelemetryClient {
  constructor(config: BrowserTelemetryConfig);
  start(): void;
  stop(): void;
  trackPageView(): void;
  reportIncident(incident: IncidentReport): Promise<void>;
  sendTick(): Promise<void>;
}

export function initItcStatistics(
  config: BrowserTelemetryConfig
): BrowserTelemetryClient;

export function initGjallarhorn(
  config: BrowserTelemetryConfig
): BrowserTelemetryClient;

export as namespace ItcStatistics;

declare global {
  interface Window {
    ItcStatistics: {
      BrowserTelemetryClient: typeof BrowserTelemetryClient;
      initItcStatistics: typeof initItcStatistics;
      initGjallarhorn: typeof initGjallarhorn;
    };
    initItcStatistics: typeof initItcStatistics;
  }
}
