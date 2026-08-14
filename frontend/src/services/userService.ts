import { api } from '../api/client'
import type { User } from '../api/types'

export async function getUsers(): Promise<User[]> {
  return api.getUsers()
}

export async function createUser(data: { name: string; rate_limit?: number; max_concurrent?: number }): Promise<User> {
  return api.createUser(data)
}

export async function getUser(id: number): Promise<User> {
  return api.getUser(id)
}

export async function updateUser(id: number, data: Record<string, unknown>): Promise<User> {
  return api.updateUser(id, data)
}

export async function rotateKey(id: number): Promise<{ id: number; name: string; api_key: string }> {
  return api.rotateKey(id)
}

export async function deleteUser(id: number): Promise<{ id: number; name: string; deleted: true }> {
  return api.deleteUser(id)
}

export async function bulkUpdateUsers(data: { user_ids: number[]; is_active: boolean }): Promise<{ id: number; name: string; is_active: boolean }[]> {
  return api.bulkUpdateUsers(data)
}
