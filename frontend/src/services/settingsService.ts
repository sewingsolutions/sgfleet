import { api } from '../api/client'
import type { SettingsDefaults } from '../api/types'

export async function getSettingsDefaults(): Promise<SettingsDefaults> {
  return api.getSettingsDefaults()
}

export async function updateSettingsDefaults(data: Partial<SettingsDefaults>): Promise<SettingsDefaults> {
  return api.updateSettingsDefaults(data)
}

export async function getBaseUrl(): Promise<{ base_url: string }> {
  return api.getBaseUrl()
}

export async function setBaseUrl(url: string): Promise<{ saved: boolean }> {
  return api.setBaseUrl(url)
}



export async function fetchWebhooks(): Promise<Record<string, unknown>> {
  return api.fetchGet('/api/webhooks')
}

export async function createWebhook(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return api.fetchPost('/api/webhooks', data)
}

export async function deleteWebhook(id: number | string): Promise<Record<string, unknown>> {
  return api.fetchDelete('/api/webhooks/' + id)
}
