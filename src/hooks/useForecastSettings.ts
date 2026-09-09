'use client';

import { useCallback, useState } from 'react';

import { DEFAULT_FORECAST_MODEL, DEFAULT_FORECAST_SERVICE } from '@/consts/projections';

export interface ForecastSettings {
  service: 'claude' | 'openai';
  model: string;
}

const DEFAULT_SETTINGS: ForecastSettings = {
  service: DEFAULT_FORECAST_SERVICE as ForecastSettings['service'],
  model: DEFAULT_FORECAST_MODEL,
};

const STORAGE_KEY = 'catoshi:forecast-settings';

export const CLAUDE_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
  { id: 'claude-opus-4-8', label: 'Opus' },
] as const;

export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
] as const;

/** The provider that actually owns a model id, or null for an unknown id. */
export function serviceForModel(model: string): ForecastSettings['service'] | null {
  if (CLAUDE_MODELS.some((m) => m.id === model)) return 'claude';
  if (OPENAI_MODELS.some((m) => m.id === model)) return 'openai';
  return null;
}

/** Keep { service, model } consistent: a known model id always wins over a
 * stored service, so the pair can never be a mismatch like
 * "claude + gpt-4o-mini" — which made the modal highlight the wrong provider. */
function normalize(settings: ForecastSettings): ForecastSettings {
  const owner = serviceForModel(settings.model);
  return owner ? { service: owner, model: settings.model } : settings;
}

function readFromStorage(): ForecastSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ForecastSettings>;
    return normalize({
      service:
        parsed.service === 'claude' || parsed.service === 'openai'
          ? parsed.service
          : DEFAULT_SETTINGS.service,
      model:
        typeof parsed.model === 'string' && parsed.model.length > 0
          ? parsed.model
          : DEFAULT_SETTINGS.model,
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeToStorage(settings: ForecastSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore write errors (e.g., private browsing quota exceeded)
  }
}

export function useForecastSettings() {
  const [settings, setSettings] = useState<ForecastSettings>(() => readFromStorage());

  /** Single funnel for every write: functional update so back-to-back calls
   * never build on a stale snapshot, plus persistence and normalization. */
  const update = useCallback((patch: Partial<ForecastSettings>): void => {
    setSettings((prev) => {
      const next = normalize({ ...prev, ...patch });
      writeToStorage(next);
      return next;
    });
  }, []);

  const setService = useCallback(
    (service: ForecastSettings['service']): void => {
      update({ service });
    },
    [update],
  );

  const setModel = useCallback(
    (model: string): void => {
      update({ model });
    },
    [update],
  );

  /** Apply provider and model together — the modal's Apply path. */
  const setServiceAndModel = useCallback(
    (service: ForecastSettings['service'], model: string): void => {
      update({ service, model });
    },
    [update],
  );

  return {
    service: settings.service,
    model: settings.model,
    setService,
    setModel,
    setServiceAndModel,
  };
}
