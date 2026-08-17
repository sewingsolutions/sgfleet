import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserProfile } from "../api/types";

export function useMe() {
  return useQuery<UserProfile, Error>({
    queryKey: ["me"],
    queryFn: () => api.user.getMe(),
  });
}
