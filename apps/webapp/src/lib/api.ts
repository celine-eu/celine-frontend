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
};

export type Overview = {
  period: string;
  user: OverviewUser;
  rec: OverviewRec;
  trend: TrendItem[];
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
  temp: number;
  humidity: number;
  uvi: number;
  clouds: number;
  wind_deg: number;
  weather_main: string;
  weather_description: string;
  sunrise: string;
  sunset: string;
};

export type WeatherDayItem = {
  date: string;
  temp_min: number;
  temp_max: number;
  temp_day: number;
  pop: number;
  rain: number | null;
  clouds: number;
  uvi: number;
  weather_main: string;
  weather_description: string;
  summary: string | null;
};

export type WeatherAlertItem = {
  event: string;
  sender_name: string;
  start_ts: string;
  end_ts: string;
  description: string;
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
  impact_kwh_estimated: number;
  reward_points: number;
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

export type GamificationResponse = {
  total_points: number;
  level: number;
  next_level_at: number;
  badges: BadgeItem[];
  actions_taken: number;
  pending_commitment?: FlexibilityCommitmentItem | null;
  ranking?: RankingInfo | null;
};

export type FlexibilityHistoryItem = {
  id: string;
  suggestion_type: string;
  period_start: string;
  period_end: string;
  committed_at: string;
  settled_at?: string | null;
  status: 'committed' | 'settled' | 'rejected';
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

export const api = {
  me: () => j<Me>('/api/me'),
  overview: (days: number = 7) => j<Overview>(`/api/overview?days=${days}`),
  notifications: () => j<NotificationItem[]>('/api/notifications'),
  notificationMarkRead: (id: string) =>
    j<{ ok: true }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  notificationMarkAllRead: () =>
    j<{ ok: true }>('/api/notifications/read-all', { method: 'POST' }),
  acceptTerms: () => j<{ ok: true }>('/api/terms/accept', { method: 'POST', body: JSON.stringify({ accept: true }) }),
  settingsGet: () => j<Settings>('/api/settings'),
  settingsPut: (s: Settings) => j<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  vapidPublicKey: () => j<{ public_key: string }>('/api/notifications/webpush/vapid-public-key'),
  subscribeWebPush: (subscription: PushSubscriptionJSON) =>
    j<{ ok: true }>('/api/notifications/webpush/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribeWebPush: (endpoint: string) =>
    j<{ ok: true }>('/api/notifications/webpush/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  enableNotifications: () => j<{ ok: true }>('/api/notifications/enable', { method: 'POST', body: JSON.stringify({ enable: true }) }),
  community: () => j<CommunityMeta>('/api/community'),
  weather: () => j<WeatherResponse>('/api/weather'),
  forecast: () => j<ForecastResponse>('/api/forecast'),
  suggestions: () => j<SuggestionItem[]>('/api/suggestions'),
  suggestionRespond: (id: string, response: 'accepted' | 'declined', reward_points?: number) =>
    j<GamificationResponse>(`/api/suggestions/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, ...(reward_points !== undefined ? { reward_points } : {}) })
    }),
  gamification: () => j<GamificationResponse>('/api/gamification'),
  gamificationHistory: () => j<CommitmentHistoryResponse>('/api/gamification/history'),
  co2Settings: () => j<Co2SettingsResponse>('/api/settings/co2'),
};
