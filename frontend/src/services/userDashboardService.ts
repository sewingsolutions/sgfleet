import { api } from '../api/client'
import type { UserProfile, UserModelsResponse, UserStats, UserRequestsResponse, UserQuota, UserConfigResponse } from '../api/types'

export async function getMe(): Promise<UserProfile> {
  return api.user.getMe()
}

export async function getModels(): Promise<UserModelsResponse> {
  return api.user.getModels()
}

export async function getStats(range?: string): Promise<UserStats> {
  return api.user.getStats(range)
}

export async function getRequests(limit?: number, offset?: number): Promise<UserRequestsResponse> {
  return api.user.getRequests(limit, offset)
}

export async function getQuota(): Promise<UserQuota> {
  return api.user.getQuota()
}

export async function generateConfig(clientId?: string): Promise<UserConfigResponse> {
  return api.user.generateConfig(clientId)
}
