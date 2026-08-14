import { api } from '../api/client'
import type { AuditEntry, RequestLogEntry, LogEntry, Stats, UserSummary, FleetStats, DashboardStats } from '../api/types'

export async function getAuditLog(limit?: number): Promise<AuditEntry[]> {
  return api.getAuditLog(limit)
}

export async function getUserRequests(userId: number, limit?: number): Promise<RequestLogEntry[]> {
  return api.getUserRequests(userId, limit)
}

export async function getLogs(
  limit?: number,
  filters?: { level?: string; user?: string; path?: string; keyword?: string },
): Promise<LogEntry[]> {
  return api.getLogs({
    limit,
    ...filters,
  })
}

export async function getLogLevel(): Promise<{ level: string }> {
  return api.getLogLevel()
}

export async function setLogLevel(level: string): Promise<{ level: string }> {
  return api.setLogLevel(level)
}

export async function getFleetStats(range?: string): Promise<FleetStats> {
  return api.getFleetStats(range)
}

export async function getUserStats(userId: number, range?: string): Promise<Stats> {
  return api.getUserStats(userId, range)
}

export async function getUserSummary(userId: number): Promise<UserSummary> {
  return api.getUserSummary(userId)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return api.getDashboardStats()
}

export async function getGitLog(): Promise<{ head: string; commits: { sha: string; msg: string }[] }> {
  return api.getGitLog()
}
