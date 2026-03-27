import type { SystemInput, ConfigOverrides, ScenarioResult } from './types.js';

export interface RoiApi {
  runScenario(system: SystemInput, overrides?: ConfigOverrides): Promise<ScenarioResult>;
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

  return { runScenario };
}
