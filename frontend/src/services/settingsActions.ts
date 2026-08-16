import { api } from '../api/client'
import { downloadJson } from './importExport'
import type { User } from '../api/types'

export async function fetchUsersExport(): Promise<User[]> {
  const res = await fetch('/api/users', { credentials: 'same-origin' })
  return res.json()
}

export async function exportUsersFile(): Promise<void> {
  const users = await fetchUsersExport()
  downloadJson(JSON.stringify(users, null, 2), 'users-export.json')
}

export async function importUsersFromJson(jsonText: string): Promise<{
  created: string[]
  skipped: string[]
}> {
  const parsed = JSON.parse(jsonText)
  const res = await api.fetchPost('/api/settings/import_users', parsed)
  return res as { created: string[]; skipped: string[] }
}

export async function exportDatabase(): Promise<string> {
  const res = await api.fetchPost('/api/settings/export_db', {})
  return String(res.json)
}

export async function rotateAdminKey(): Promise<{ newKey: string }> {
  const res = await api.fetchPost('/api/settings/rotate_admin_key', {})
  return { newKey: String(res.new_key) }
}

export function formatUptime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
