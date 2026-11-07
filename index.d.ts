export interface GjallarhornConfig {
  projectId: string;
  dashboardUrl?: string;
  projectKey?: string;
  intervalMs?: number;
  serviceType?: "web" | "api" | "worker";
  version?: string;
  environment?: "production" | "staging" | "development";
  autoCatchErrors?: boolean;
}

export interface IncidentReport {
  title: string;
  severity?: "critical" | "warning" | "minor";
  rootCause?: string;
}

export class GjallarhornClient {
  constructor(config: GjallarhornConfig);
  start(): void;
  stop(): void;
  middleware(): (req: any, res: any, next?: () => void) => void;
  reportIncident(incident: IncidentReport): Promise<void>;
  sendTick(): Promise<void>;
}

export function initGjallarhorn(config: GjallarhornConfig): GjallarhornClient;
