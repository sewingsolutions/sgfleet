import type { Model } from "../api/types";

export interface ModelAccessQueryResult {
  data?: { access: Model[]; userId: number };
  isError?: boolean;
}

export interface DefaultModelQueryResult {
  data?: { model: Model | null; userId: number };
  isError?: boolean;
}

export function buildModelAccessMap(
  users: { id: number }[],
  queries: ModelAccessQueryResult[],
): Record<number, Model[]> {
  const map: Record<number, Model[]> = {};
  queries.forEach((q) => {
    if (q.data) {
      map[q.data.userId] = q.data.access;
    } else if (q.isError) {
      const index = queries.indexOf(q);
      const user = users[index];
      if (user) map[user.id] = [];
    }
  });
  return map;
}

export function buildDefaultModelMap(
  users: { id: number }[],
  queries: DefaultModelQueryResult[],
): Record<number, Model | null> {
  const map: Record<number, Model | null> = {};
  queries.forEach((q) => {
    if (q.data) {
      map[q.data.userId] = q.data.model;
    } else if (q.isError) {
      const index = queries.indexOf(q);
      const user = users[index];
      if (user) map[user.id] = null;
    }
  });
  return map;
}
