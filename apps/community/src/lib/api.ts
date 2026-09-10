import type { FeedbackContext, FeedbackScreenshot } from './feedback';

export type Period = 'today' | '7d' | '30d';

export interface Me {
  sub: string;
  email: string;
  name?: string;
  preferredUsername?: string;
  locale?: string;
  organization: string;
  communityKey: string;
  communityName: string;
  scopes: string[];
}

export interface FeedbackSubmission {
  rating: number;
  comment: string;
  context: FeedbackContext;
  screenshot?: FeedbackScreenshot | null;
}

export interface FeedbackCreated {
  id: string;
  createdAt: string;
}

export interface EnergyPoint {
  label: string;
  importKwh: number;
  exportKwh: number;
  sharedKwh: number;
}

export interface Kpi {
  id: 'import' | 'export' | 'shared' | 'ratio';
  value: number;
  unit: string;
  change: number;
}

export interface Objective {
  id: 'shared' | 'uptake' | 'delivery' | 'participation';
  current: number;
  target: number;
  unit: string;
}

export interface Overview {
  communityKey: string;
  communityName: string;
  period: Period;
  updatedAt: string;
  estimated: boolean;
  partial: boolean;
  missingSources: string[];
  kpis: Kpi[];
  energy: EnergyPoint[];
  population: {
    administrativeMembers: number;
    monitoredMembers: number;
    monitoredDevices: number;
    unregisteredMeters: number;
  };
  meterHealth: {
    reporting: number;
    degraded: number;
    silent: number;
  };
  objectives: Objective[];
  windowStory: {
    id: string;
    start: string;
    offeredKwh: number;
    deliveredKwh: number;
    baselineMultiplier: number;
    steps: Array<{ id: string; value: number }>;
  };
}

export type DeviceStatus = 'reporting' | 'degraded' | 'silent';
export type EngagementState = 'active' | 'dormant' | 'never-activated';
export type PipelineState = 'success' | 'running' | 'failed' | 'stale' | 'unknown';

export interface DeviceSummary {
  deviceId: string;
  lastSeen?: string;
  gapMinutes: number;
  coveragePercent: number;
  points30d: number;
  engagementState: EngagementState;
  meterStatus: DeviceStatus;
}

export interface MeterGap {
  start: string;
  end: string;
  sizeMinutes: number;
  expectedIntervals: number;
}

export interface DeviceDetail extends DeviceSummary {
  firstSeen?: string;
  receivedIntervals: number;
  expectedIntervals: number;
  gaps: MeterGap[];
}

export interface DeviceList {
  communityKey: string;
  period: Period;
  page: number;
  pageSize: number;
  total: number;
  partial: boolean;
  missingSources: string[];
  summary: {
    reporting: number;
    degraded: number;
    silent: number;
    active: number;
    dormant: number;
    neverActivated: number;
  };
  items: DeviceSummary[];
}

export interface DeviceDetailResponse {
  communityKey: string;
  partial: boolean;
  missingSources: string[];
  device: DeviceDetail;
}

export interface PipelineRun {
  id: string;
  name: string;
  state: PipelineState;
  lastRunAt?: string;
  lastSuccessAt?: string;
  durationSeconds?: number;
  freshnessMinutes?: number;
  message?: string;
}

export interface DataFlow {
  communityKey: string;
  period: Period;
  updatedAt: string;
  coveragePercent: number;
  receivedIntervals: number;
  expectedIntervals: number;
  gapCount: number;
  partial: boolean;
  missingSources: string[];
  pipelines: PipelineRun[];
}

export type FlexibilityWindowState = 'upcoming' | 'open' | 'closed' | 'settled';
export type ChainStepId =
  | 'offered'
  | 'nudged'
  | 'read'
  | 'opened'
  | 'committed'
  | 'delivered'
  | 'points';
export type CorrelationState = 'complete' | 'partial' | 'missing';

export interface FlexibilityWindow {
  id: string;
  start: string;
  end: string;
  state: FlexibilityWindowState;
  offeredKwh: number;
  committedKwh: number;
  deliveredKwh: number;
  confidence?: number;
  model?: string;
  participatingDevices: number;
  deliveryRate: number;
  correlationState: CorrelationState;
}

export interface FlexibilityWindows {
  communityKey: string;
  period: Period;
  partial: boolean;
  missingSources: string[];
  items: FlexibilityWindow[];
}

export interface FlexibilityUptake {
  communityKey: string;
  period: Period;
  offeredKwh: number;
  committedKwh: number;
  deliveredKwh: number;
  uptakePercent: number;
  deliveryPercent: number;
  settledWindows: number;
}

export interface ChainStep {
  id: ChainStepId;
  count: number;
  conversionPercent: number;
  dropOff: number;
}

export interface DemonstrationChain {
  communityKey: string;
  period: Period;
  partial: boolean;
  missingSources: string[];
  steps: ChainStep[];
  offeredKwh: number;
  committedKwh: number;
  deliveredKwh: number;
  pointsAwarded: number;
  averageEffortMultiplier?: number;
  correlationPercent: number;
  weakStep?: ChainStepId;
  summary: string;
}

export interface DeviceWindowOutcome {
  deviceId: string;
  nudged: boolean;
  read: boolean;
  opened: boolean;
  committed: boolean;
  deliveredKwh?: number;
  baselineKwh?: number;
  effortMultiplier?: number;
  points?: number;
  correlationState: CorrelationState;
}

export interface FlexibilityWindowDetail {
  communityKey: string;
  partial: boolean;
  missingSources: string[];
  window: FlexibilityWindow;
  steps: ChainStep[];
  devices: DeviceWindowOutcome[];
  correlationPercent: number;
  weakestStep?: ChainStepId;
  narrative: string;
}

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type AlertState = 'open' | 'acknowledged' | 'muted';

export interface PointsDistribution {
  communityKey: string;
  period: Period;
  partial: boolean;
  missingSources: string[];
  monitoredDevices: number;
  awardedDevices: number;
  coveragePercent: number;
  medianPoints: number;
  topDecilePoints: number;
  bottomDecilePoints: number;
  concentrationIndex: number;
  buckets: Array<{ label: string; minimum: number; maximum?: number; count: number }>;
  leaderboard: Array<{ rank: number; deviceId: string; points: number; trend: number }>;
}

export interface AntiGamingFlag {
  id: string;
  deviceId: string;
  rule: string;
  severity: Severity;
  detail: string;
  observedValue: number;
  threshold: number;
  occurredAt: string;
  state: 'open' | 'acknowledged';
}

export interface AntiGamingFlags {
  communityKey: string;
  partial: boolean;
  missingSources: string[];
  items: AntiGamingFlag[];
}

export interface PointsLedger {
  communityKey: string;
  deviceId: string;
  partial: boolean;
  missingSources: string[];
  settlementPoints: number;
  bonusPoints: number;
  capAdjustments: number;
  totalPoints: number;
  entries: Array<{
    id: string;
    occurredAt: string;
    kind: 'settlement' | 'bonus' | 'cap';
    sourceRef: string;
    points: number;
    description: string;
  }>;
}

export interface NudgeFunnelStep {
  id: 'sent' | 'delivered' | 'read' | 'clicked' | 'committed';
  count: number;
  conversionPercent: number;
}

export interface NudgingConversion {
  communityKey: string;
  period: Period;
  partial: boolean;
  missingSources: string[];
  steps: NudgeFunnelStep[];
  clickToCommitPercent: number;
  rules: Array<{
    id: string;
    name: string;
    family: string;
    channel: 'webpush' | 'email';
    severity: Severity;
    active: boolean;
    lastFiredAt?: string;
    volume: number;
    steps: NudgeFunnelStep[];
  }>;
  failures: Array<{ channel: 'webpush' | 'email'; errorClass: string; count: number }>;
  reachability: Array<{
    channel: 'webpush' | 'email';
    reachable: number;
    total: number;
    reachablePercent: number;
    optedOut: number;
  }>;
}

export interface ManagerAlert {
  id: string;
  source: string;
  severity: Severity;
  title: string;
  detail?: string;
  resourceType?: string;
  resourceId?: string;
  assignedTo?: string;
  mutedUntil?: string;
  active: boolean;
  acknowledged: boolean;
  state: AlertState;
  createdAt: string;
  updatedAt: string;
}

export interface AlertsResponse {
  communityKey: string;
  total: number;
  items: ManagerAlert[];
}

export interface DeviceQuery {
  period?: Period;
  search?: string;
  status?: DeviceStatus | '';
  engagement?: EngagementState | '';
  sort?: 'device_id' | 'last_seen' | 'gap_minutes' | 'coverage_percent' | 'points_30d';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

interface MeResponse {
  user: Me;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  if (response.status === 401) {
    window.location.href = `/oauth2/sign_in?rd=${encodeURIComponent(window.location.href)}`;
    return new Promise(() => {});
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
}

export async function getMe(): Promise<Me> {
  return request<MeResponse>('/api/me').then((response) => response.user);
}

export async function getOverview(communityKey: string, period: Period): Promise<Overview> {
  const params = new URLSearchParams({ period });
  return request<Overview>(
    `/api/communities/${encodeURIComponent(communityKey)}/overview?${params.toString()}`,
  );
}

export async function getDevices(
  communityKey: string,
  query: DeviceQuery = {},
): Promise<DeviceList> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return request<DeviceList>(
    `/api/communities/${encodeURIComponent(communityKey)}/devices?${params.toString()}`,
  );
}

export async function getDevice(
  communityKey: string,
  deviceId: string,
  period: Period = '30d',
): Promise<DeviceDetailResponse> {
  const params = new URLSearchParams({ period });
  return request<DeviceDetailResponse>(
    `/api/communities/${encodeURIComponent(communityKey)}/devices/${encodeURIComponent(deviceId)}?${params.toString()}`,
  );
}

export async function getDataFlow(
  communityKey: string,
  period: Period = '7d',
): Promise<DataFlow> {
  const params = new URLSearchParams({ period });
  return request<DataFlow>(
    `/api/communities/${encodeURIComponent(communityKey)}/data-flow/pipelines?${params.toString()}`,
  );
}

export async function getFlexibilityWindows(
  communityKey: string,
  period: Period = '30d',
): Promise<FlexibilityWindows> {
  const params = new URLSearchParams({ period });
  return request<FlexibilityWindows>(
    `/api/communities/${encodeURIComponent(communityKey)}/flexibility/windows?${params.toString()}`,
  );
}

export async function getFlexibilityUptake(
  communityKey: string,
  period: Period = '30d',
): Promise<FlexibilityUptake> {
  const params = new URLSearchParams({ period });
  return request<FlexibilityUptake>(
    `/api/communities/${encodeURIComponent(communityKey)}/flexibility/uptake?${params.toString()}`,
  );
}

export async function getDemonstrationChain(
  communityKey: string,
  period: Period = '30d',
): Promise<DemonstrationChain> {
  const params = new URLSearchParams({ period });
  return request<DemonstrationChain>(
    `/api/communities/${encodeURIComponent(communityKey)}/demonstration/chain?${params.toString()}`,
  );
}

export async function getFlexibilityWindow(
  communityKey: string,
  windowId: string,
  period: Period = '30d',
): Promise<FlexibilityWindowDetail> {
  const params = new URLSearchParams({ period });
  return request<FlexibilityWindowDetail>(
    `/api/communities/${encodeURIComponent(communityKey)}/flexibility/windows/${encodeURIComponent(windowId)}?${params.toString()}`,
  );
}

export async function getPointsDistribution(
  communityKey: string,
  period: Period = '30d',
): Promise<PointsDistribution> {
  const params = new URLSearchParams({ period });
  return request<PointsDistribution>(
    `/api/communities/${encodeURIComponent(communityKey)}/points/distribution?${params.toString()}`,
  );
}

export async function getAntiGamingFlags(
  communityKey: string,
  period: Period = '30d',
): Promise<AntiGamingFlags> {
  const params = new URLSearchParams({ period });
  return request<AntiGamingFlags>(
    `/api/communities/${encodeURIComponent(communityKey)}/points/flags?${params.toString()}`,
  );
}

export async function acknowledgeAntiGamingFlag(
  communityKey: string,
  flagId: string,
): Promise<AntiGamingFlag> {
  return request<AntiGamingFlag>(
    `/api/communities/${encodeURIComponent(communityKey)}/points/flags/${encodeURIComponent(flagId)}/ack`,
    { method: 'POST' },
  );
}

export async function getPointsLedger(
  communityKey: string,
  deviceId: string,
  period: Period = '30d',
): Promise<PointsLedger> {
  const params = new URLSearchParams({ period });
  return request<PointsLedger>(
    `/api/communities/${encodeURIComponent(communityKey)}/devices/${encodeURIComponent(deviceId)}/points/ledger?${params.toString()}`,
  );
}

export async function getNudgingConversion(
  communityKey: string,
  period: Period = '30d',
): Promise<NudgingConversion> {
  const params = new URLSearchParams({ period });
  return request<NudgingConversion>(
    `/api/communities/${encodeURIComponent(communityKey)}/nudging/conversion?${params.toString()}`,
  );
}

export async function getAlerts(
  communityKey: string,
  filters: { severity?: Severity | ''; state?: AlertState | ''; source?: string } = {},
): Promise<AlertsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return request<AlertsResponse>(
    `/api/communities/${encodeURIComponent(communityKey)}/alerts?${params.toString()}`,
  );
}

export async function acknowledgeAlert(
  communityKey: string,
  alertId: string,
): Promise<ManagerAlert> {
  return request<ManagerAlert>(
    `/api/communities/${encodeURIComponent(communityKey)}/alerts/${encodeURIComponent(alertId)}/ack`,
    { method: 'POST' },
  );
}

export async function muteAlert(
  communityKey: string,
  alertId: string,
  mutedUntil: string,
): Promise<ManagerAlert> {
  return request<ManagerAlert>(
    `/api/communities/${encodeURIComponent(communityKey)}/alerts/${encodeURIComponent(alertId)}/mute`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutedUntil }),
    },
  );
}

export async function assignAlert(
  communityKey: string,
  alertId: string,
  assignedTo: string,
): Promise<ManagerAlert> {
  return request<ManagerAlert>(
    `/api/communities/${encodeURIComponent(communityKey)}/alerts/${encodeURIComponent(alertId)}/assign`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedTo }),
    },
  );
}

export async function submitFeedback(payload: FeedbackSubmission): Promise<FeedbackCreated> {
  return request<FeedbackCreated>('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
