import type { SystemInput, ConfigOverrides, ScenarioResult, CapexEstimateResponse, CompareResponse } from './types.js';

export interface RoiApi {
  runScenario(system: SystemInput, overrides?: ConfigOverrides): Promise<ScenarioResult>;
  estimateCapex(rooftop_area_m2: number, num_panels?: number): Promise<CapexEstimateResponse>;
  compareScenarios(system: SystemInput, scenarios: Record<string, Record<string, unknown>>, overrides?: ConfigOverrides): Promise<CompareResponse>;
}

export function createRoiApi(baseUrl: string = '/api'): RoiApi {
  const base = baseUrl.replace(/\/$/, '');

  async function runScenario(
    system: SystemInput,
    overrides: ConfigOverrides = {}
  ): Promise<ScenarioResult> {
    const res = await fetch(`${base}/v1/scenario`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, config_overrides: overrides }),
      credentials: 'include',
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = await res.json();
        detail = err.detail ?? err.error ?? detail;
      } catch {
        // ignore parse error
      }
      throw new Error(detail);
    }
    return res.json() as Promise<ScenarioResult>;
  }

  async function estimateCapex(
    rooftop_area_m2: number,
    num_panels?: number
  ): Promise<CapexEstimateResponse> {
    const body: Record<string, unknown> = { rooftop_area_m2 };
    if (num_panels != null) body.num_panels = num_panels;
    const res = await fetch(`${base}/v1/capex-estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { const err = await res.json(); detail = err.detail ?? err.error ?? detail; } catch {}
      throw new Error(detail);
    }
    return res.json() as Promise<CapexEstimateResponse>;
  }

  async function compareScenarios(
    system: SystemInput,
    scenarios: Record<string, Record<string, unknown>>,
    overrides: ConfigOverrides = {}
  ): Promise<CompareResponse> {
    const res = await fetch(`${base}/v1/compare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, scenarios, config_overrides: overrides }),
      credentials: 'include',
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { const err = await res.json(); detail = err.detail ?? err.error ?? detail; } catch {}
      throw new Error(detail);
    }
    return res.json() as Promise<CompareResponse>;
  }

  return { runScenario, estimateCapex, compareScenarios };
}
