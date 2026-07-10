// Webapp API client

export type Me = {
  user: { sub: string; email?: string; name?: string };
  has_smart_meter: boolean;
  terms_required: boolean;
  policy_version: string;
  accepted_policy_version?: string | null;
  simple_mode: boolean;
  font_scale: number;
  notification_permission: 'default' | 'granted' | 'denied';
  webpush_configured: boolean;
  onboarding_seen: boolean;
  onboarding_seen_pages: string[];
  locale?: string;
};

export type OverviewUser = {
  production_kwh: number | null;
  consumption_kwh: number | null;
  self_consumption_kwh: number | null;
  self_consumption_rate: number | null;
};

export type OverviewRec = {
  production_kwh: number | null;
  consumption_kwh: number | null;
  self_consumption_kwh: number | null;
  self_consumption_rate: number | null;
};

export type MeterDevice = {
  sensor_id: string | null;
  key: string | null;
  name: string | null;
  details: Record<string, any> | null;
};

export type TrendItem = {
  date: string;
  production_kwh: number | null;
  consumption_kwh: number | null;
  self_consumption_kwh: number | null;
  surplus_kwh?: number | null;
};

export type Overview = {
  period: string;
  user: OverviewUser;
  rec: OverviewRec;
  trend: TrendItem[];
  user_trend: TrendItem[];
  devices: MeterDevice[];
};

export type NotificationItem = {
  id: string;
  created_at: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  read_at?: string | null;
};

export type Settings = {
  simple_mode: boolean;
  font_scale: number;
  notifications: {
    kinds: {
      kind: string;
      label: string;
      description: string;
      cadence: string;
      enabled: boolean;
      editable: boolean;
    }[];
    email_enabled: boolean;
    email: string;
    webpush_enabled: boolean;
    limit: number;
  };
};

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (res.status === 401) {
    const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    window.location.href = `/oauth2/sign_in?rd=${encodeURIComponent(returnTo)}`;
    return new Promise(() => {});
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${txt ? `: ${txt}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type CommunityMeta = {
  key: string;
  name: string;
  description?: string | null;
  legal_name?: string | null;
  legal_form?: string | null;
  vat?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  website?: string | null;
  terms_url?: string | null;
  privacy_url?: string | null;
};

export type WeatherCurrent = {
  temp: number | null;
  humidity: number;
  uvi?: number;
  clouds?: number;
  wind_deg: number;
  wind_speed_ms?: number | null;
  wind_gust_ms?: number | null;
  weather_main: string;
  weather_description: string;
  sunrise?: string;
  sunset?: string;
};

export type WeatherDayItem = {
  date: string;
  temp_min: number | null;
  temp_max: number | null;
  temp_day: number | null;
  pop?: number;
  rain: number | null;
  clouds?: number;
  uvi?: number;
  weather_main: string;
  weather_description: string;
  summary: string | null;
};

export type WeatherAlertItem = {
  event: string;
  sender_name?: string;
  start_ts: string;
  end_ts?: string;
  description?: string;
  severity?: string | null;
  urgency?: string | null;
  headline?: string | null;
};

export type WeatherIrradianceItem = {
  ts: string;
  shortwave_radiation: number | null;
  diffuse_radiation: number | null;
  global_tilted_irradiance: number | null;
  cloud_cover: number | null;
};

export type WeatherResponse = {
  current: WeatherCurrent | null;
  daily: WeatherDayItem[];
  hourly_irradiance: WeatherIrradianceItem[];
  alerts: WeatherAlertItem[];
  irradiance_date?: string | null;
};

export type ForecastHourItem = {
  ts: string;
  value: number;
  lower: number | null;
  upper: number | null;
  period: string;
};

export type ForecastResponse = {
  user_forecast: ForecastHourItem[];
  rec_forecast: ForecastHourItem[];
};

export type SuggestionItem = {
  id: string;
  suggestion_type: string;
  period_start: string;
  period_end: string;
  from_period: string;
  clock_range: string;
  to_is_tomorrow: boolean;
  to_period: string;
  to_time: string;
  impact_kwh_estimated: number | null;
  reward_points: number | null;
  community_kwh: number;
  confidence: number;
};

export type BadgeItem = {
  badge_id: string;
  icon: string;
  earned_at: string;
};

export type FlexibilityCommitmentItem = {
  id: string;
  suggestion_id: string;
  status: 'committed' | 'settled' | 'rejected';
  period_end: string;
  reward_points_estimated: number;
  reward_points_actual?: number | null;
  committed_at: string;
  settled_at?: string | null;
};

export type RankingInfo = {
  position: number;
  total_members: number;
  percentile: number;
  period: 'week' | 'month';
};

export type DailyPointsItem = {
  date: string;   // YYYY-MM-DD
  points: number;
};

export type GamificationResponse = {
  total_points: number;
  level: number;
  next_level_at: number;
  badges: BadgeItem[];
  actions_taken: number;
  pending_commitment?: FlexibilityCommitmentItem | null;
  ranking?: RankingInfo | null;
  daily_points?: DailyPointsItem[];
};

export type FlexibilityHistoryItem = {
  id: string;
  suggestion_type: string;
  period_start: string;
  period_end: string;
  committed_at: string;
  settled_at?: string | null;
  status: 'committed' | 'settled' | 'rejected' | 'cancelled';
  reward_points_estimated: number;
  reward_points_actual?: number | null;
  impact_kwh_actual?: number | null;
};

export type CommitmentHistoryResponse = {
  items: FlexibilityHistoryItem[];
  total_points_earned: number;
};

export type Co2LocaleSettings = {
  country_code: string;
  country_name: string;
  kg_per_kwh: number;
  trees_per_ton: number;
};

export type Co2SettingsResponse = {
  current: Co2LocaleSettings;
  available: Co2LocaleSettings[];
};

export type FeedbackContextPayload = {
  page_url: string;
  page_title?: string | null;
  page_path?: string | null;
  locale?: string | null;
  timezone?: string | null;
  user_agent?: string | null;
  viewport_width?: number | null;
  viewport_height?: number | null;
  screen_width?: number | null;
  screen_height?: number | null;
  color_scheme?: 'light' | 'dark' | null;
  client_timestamp?: string | null;
  extra?: Record<string, unknown>;
};

export type FeedbackScreenshotPayload = {
  mime_type: string;
  data_base64: string;
};

export type FeedbackSubmission = {
  rating: number;
  comment: string;
  context: FeedbackContextPayload;
  screenshot?: FeedbackScreenshotPayload | null;
};

export type FeedbackCreated = {
  id: string;
  created_at: string;
};

export const api = {
  me: () => j<Me>('/api/me'),
  overview: (days: number = 7) => j<Overview>(`/api/overview?days=${days}`),
  notifications: () => j<NotificationItem[]>('/api/notifications'),
  notificationMarkRead: (id: string) =>
    j<{ ok: true }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  notificationMarkAllRead: () =>
    j<{ ok: true }>('/api/notifications/read-all', { method: 'POST' }),
  acceptTerms: () => j<{ ok: true }>('/api/terms/accept', { method: 'POST', body: JSON.stringify({ accept: true }) }),
  markOnboardingSeen: (page_key: string) =>
    j<{ ok: true }>('/api/onboarding/seen', { method: 'POST', body: JSON.stringify({ page_key }) }),
  settingsGet: (lang?: string) => j<Settings>(lang ? `/api/settings?lang=${encodeURIComponent(lang)}` : '/api/settings'),
  settingsPut: (s: Settings, lang?: string) =>
    j<Settings>(lang ? `/api/settings?lang=${encodeURIComponent(lang)}` : '/api/settings', {
      method: 'PUT',
      body: JSON.stringify(s)
    }),
  vapidPublicKey: () => j<{ public_key: string }>('/api/notifications/webpush/vapid-public-key'),
  subscribeWebPush: (subscription: PushSubscriptionJSON) =>
    j<{ ok: true }>('/api/notifications/webpush/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribeWebPush: (endpoint: string) =>
    j<{ ok: true }>('/api/notifications/webpush/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  enableNotifications: () => j<{ ok: true }>('/api/notifications/enable', { method: 'POST', body: JSON.stringify({ enable: true }) }),
  community: () => j<CommunityMeta>('/api/community'),
  weather: () => j<WeatherResponse>('/api/weather'),
  forecast: (days: number = 2) => j<ForecastResponse>(`/api/forecast?days=${days}`),
  suggestions: () => j<SuggestionItem[]>('/api/suggestions'),
  suggestionRespond: (id: string, response: 'accepted' | 'declined', reward_points?: number, period_start?: string, period_end?: string) =>
    j<GamificationResponse>(`/api/suggestions/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, ...(reward_points !== undefined ? { reward_points } : {}), ...(period_start ? { period_start, period_end } : {}) })
    }),
  suggestionRemind: (id: string, period_start: string, period_end: string, reward_points: number, lang?: string) =>
    j<{ ok: true }>(`/api/suggestions/${id}/remind`, {
      method: 'POST',
      body: JSON.stringify({ period_start, period_end, reward_points, ...(lang ? { lang } : {}) })
    }),
  cancelCommitment: (id: string) =>
    j<void>(`/api/commitments/${id}`, { method: 'DELETE' }),
  gamification: () => j<GamificationResponse>('/api/gamification'),
  gamificationHistory: () => j<CommitmentHistoryResponse>('/api/gamification/history'),
  co2Settings: () => j<Co2SettingsResponse>('/api/settings/co2'),
  submitFeedback: (payload: FeedbackSubmission) =>
    j<FeedbackCreated>('/api/feedback', { method: 'POST', body: JSON.stringify(payload) }),
};
