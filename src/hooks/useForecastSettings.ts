'use client';

import { useState } from 'react';

export interface ForecastSettings {
  service: 'claude' | 'openai';
  model: string;
}

const DEFAULT_SETTINGS: ForecastSettings = {
  service: 'claude',
  model: 'claude-sonnet-4-6',
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

function readFromStorage(): ForecastSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ForecastSettings>;
    return {
      service: parsed.service === 'openai' ? 'openai' : 'claude',
      model: typeof parsed.model === 'string' && parsed.model.length > 0
        ? parsed.model
        : DEFAULT_SETTINGS.model,
    };
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

  function setService(service: 'claude' | 'openai'): void {
    const next: ForecastSettings = { ...settings, service };
    setSettings(next);
    writeToStorage(next);
  }

  function setModel(model: string): void {
    const next: ForecastSettings = { ...settings, model };
    setSettings(next);
    writeToStorage(next);
  }

  return {
    service: settings.service,
    model: settings.model,
    setService,
    setModel,
  };
}
