import { createContext, useContext } from "react";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export { ToastContext };
