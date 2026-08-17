import { useState, useCallback, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { ConfirmContext } from "../hooks/useConfirm";

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<{ message: string; danger: boolean; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback((message: string, danger = false): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({ message, danger, resolve });
    });
  }, []);

  const handleConfirm = () => {
    if (modal) {
      modal.resolve(true);
      setModal(null);
    }
  };
  const handleCancel = () => {
    if (modal) {
      modal.resolve(false);
      setModal(null);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleCancel}>
          <div
            className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              {modal.danger ? (
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              )}
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{modal.message}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm rounded font-medium transition ${
                  modal.danger
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
