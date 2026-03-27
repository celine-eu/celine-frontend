export type UserType = 'residential' | 'office' | 'commercial' | 'industrial' | 'agricultural';
export type Regime = 'RID' | 'CER' | 'RID_CER';

export interface SystemInput {
  kwp: number;
  latitude: number;
  longitude: number;
  tilt?: number;
  azimuth?: number;
  capex: number;
  annual_consumption_kwh: number;
  user_type?: UserType;
  regime?: Regime;
  equity_fraction?: number;
  loan_rate?: number;
  loan_duration_years?: number;
  location?: string;
  rooftop_wkt?: string | null;
}

export interface ConfigOverrides {
  wacc?: number;
  retail_price?: number;
  sharing_ratio?: number;
  energy_inflation?: number;
  rid_tariff?: number;
  cer_tip?: number;
  cer_cacv?: number;
}

export interface PickedLocation {
  lat: number;
  lng: number;
  wkt: string;
  name: string;
}

export interface ScenarioSummary {
  npv_eur: number;
  irr_pct: number;
  payback_simple_years: number;
  payback_discounted_years: number;
  annual_production_kwh: number;
  tasso_autoconsumo_pct: number;
  source: string;
  is_valid: boolean;
}

export interface ProductionData {
  monthly_production_kwh: number[];
  annual_production_kwh: number;
  source: string;
  effective_kwp: number | null;
}

export interface EnergyResult {
  production: number[];
  consumption: number[];
  autoconsumo: number[];
  immissione: number[];
  prelievo: number[];
  energia_condivisa: number[];
  tasso_autoconsumo: number;
}

export interface IncentiveResult {
  years: number[];
  production_degraded: number[];
  risparmio_autoconsumo: number[];
  rid_revenue: number[];
  cer_tip: number[];
  cer_cacv: number[];
  ammortamento: number[];
  tax_shield: number[];
  ires_irap: number[];
}

export interface FinanceResult {
  cashflows: number[];
  cumulative: number[];
  npv: number;
  irr: number;
  payback_simple: number;
  payback_discounted: number;
  dscr: number[] | null;
}

export interface CheckResult {
  code: string;
  message: string;
}

export interface ValidationReport {
  fails: CheckResult[];
  warns: CheckResult[];
  passes: CheckResult[];
  is_valid: boolean;
}

export interface ScenarioResult {
  summary: ScenarioSummary;
  production: ProductionData;
  energy: EnergyResult;
  incentives: IncentiveResult;
  finance: FinanceResult;
  validation: ValidationReport;
}
