import { useState, useCallback, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { useConfirm } from "../hooks/useConfirm";
import ConfigDisplay from "./ConfigDisplay";
import { tools } from "../config/tools";
import type { Tool } from "../config/tools";
import type { CursorChecklistItem } from "../api/types";

interface ConfigModalProps {
  userId: number;
  userName: string;
  clientType: string;
  onClose: () => void;
}

export default function ConfigModal({ userId, userName, clientType, onClose }: ConfigModalProps) {
  const [configJson, setConfigJson] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rotated, setRotated] = useState(false);
  const [checklist, setChecklist] = useState<CursorChecklistItem[] | null>(null);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState("");

  const confirmAction = useConfirm();
  const selectedTool: Tool | undefined = tools.find((t) => t.id === clientType);
  const isLoaded = !!(configJson || checklist || error);

  const loadConfig = useCallback(
    async (doRotate: boolean) => {
      try {
        const result = await api.generateConfig(userId, doRotate, clientType);
        setConfigJson(result.config_json || "");
        setApiKey(result.api_key);
        setRotated(result.rotated || false);
        if (result.checklist) {
          setChecklist(result.checklist);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate config");
      }
    },
    [userId, clientType],
  );

  useEffect(() => {
    Promise.resolve().then(() => loadConfig(false));
  }, [loadConfig]);

  const handleRotate = async () => {
    if (!(await confirmAction("Rotate API key? The current key will be invalidated immediately.", true))) return;
    setRotating(true);
    setConfigJson("");
    setApiKey("");
    setRotated(false);
    setChecklist(null);
    setError("");
    await loadConfig(true);
    setRotating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 w-full max-w-2xl mx-4 p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Generate config for <span className="text-indigo-600 dark:text-indigo-400">{userName}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-xl transition"
          >
            &times;
          </button>
        </div>

        {selectedTool && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{selectedTool.name}</p>}

        {error && (
          <div className="mb-4 bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-4 py-3 rounded text-sm flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="shrink-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 transition"
            >
              &times;
            </button>
          </div>
        )}

        {!isLoaded && !configJson && !error && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
          </div>
        )}

        {(configJson || checklist || apiKey) && (
          <>
            <ConfigDisplay
              configJson={configJson}
              apiKey={apiKey}
              rotated={rotated}
              checklist={checklist}
              tool={selectedTool}
              showApiKey
            />

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleRotate}
                disabled={rotating}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition text-white"
              >
                <RefreshCw className={`w-4 h-4 ${rotating ? "animate-spin" : ""}`} />
                {rotating ? "Rotating..." : "Rotate Key"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
