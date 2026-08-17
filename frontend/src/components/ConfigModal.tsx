import { useState } from "react";
import { api } from "../api/client";
import { useToast } from "../hooks/useToast";
import { copyToClipboard } from "../utils/copyToClipboard";
import CodeBlock from "./CodeBlock";
import { tools, getDownloadFilename } from "../config/tools";
import type { Tool } from "../config/tools";

interface ConfigModalProps {
  userId: number;
  userName: string;
  clientType?: string;
  onClose: () => void;
}

export default function ConfigModal({ userId, userName, clientType, onClose }: ConfigModalProps) {
  const showToast = useToast();
  const [selectedToolId, setSelectedToolId] = useState(clientType || "opencode");
  const [configJson, setConfigJson] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rotated, setRotated] = useState(false);
  const [rotateKey, setRotateKey] = useState(false);
  const [checklist, setChecklist] = useState<{ step: string; value: string }[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const selectedTool: Tool | undefined = tools.find((t) => t.id === selectedToolId);

  const handleGenerate = async () => {
    setGenerating(true);
    setConfigJson("");
    setApiKey("");
    setChecklist(null);
    setError("");
    try {
      const result = await api.generateConfig(userId, rotateKey, selectedToolId);
      setConfigJson(result.config_json || "");
      setApiKey(result.api_key);
      setRotated(result.rotated || false);
      if (result.checklist) {
        setChecklist(result.checklist);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate config");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    copyToClipboard(configJson);
    showToast("Copied!");
  };

  const handleDownload = () => {
    const filename = getDownloadFilename(selectedToolId);
    if (filename === "(checklist - no download)") return;
    const mime = selectedTool?.language === "json" ? "application/json" : "text/plain";
    const blob = new Blob([configJson], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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

        <div className="mb-4">
          <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Tool</label>
          <select
            value={selectedToolId}
            onChange={(e) => setSelectedToolId(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none text-sm"
          >
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selectedTool && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{selectedTool.description}</p>}
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={rotateKey}
            onChange={(e) => setRotateKey(e.target.checked)}
            className="w-4 h-4 rounded bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-indigo-600 focus:border-indigo-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Rotate API key (generates a new key)</span>
        </label>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-900 dark:text-white font-medium transition"
        >
          {generating ? "Generating..." : "Generate Config"}
        </button>

        {error && (
          <div className="mt-4 bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-4 py-3 rounded text-sm flex items-start justify-between gap-3">
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

        {apiKey && (
          <div className="mt-4 bg-gray-100 dark:bg-slate-900 border border-yellow-500/30 rounded p-3">
            <p className="text-sm text-yellow-600 dark:text-yellow-300 mb-1">
              {rotated ? "Rotated API Key (save this — it won't be shown again):" : "Current API Key:"}
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-sm text-indigo-600 dark:text-indigo-300 font-mono break-all">{apiKey}</code>
              <button
                onClick={() => {
                  copyToClipboard(apiKey);
                  showToast("Key copied!");
                }}
                className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
              >
                Copy Key
              </button>
            </div>
          </div>
        )}

        {configJson && selectedTool?.configType === "code" && (
          <div className="mt-4 relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedTool.name} config:</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
                >
                  Download
                </button>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
                >
                  Copy
                </button>
              </div>
            </div>
            <CodeBlock code={configJson} language={selectedTool.language || "text"} />
          </div>
        )}

        {checklist && checklist.length > 0 && (
          <div className="mt-4 space-y-3">
            {checklist.map((item, idx) => (
              <div key={idx}>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {idx + 1}. {item.step}
                </p>
                {item.value && (
                  <div className="flex gap-2">
                    <code className="flex-1 p-2 bg-gray-100 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 font-mono text-sm break-all">
                      {item.value}
                    </code>
                    <button
                      onClick={() => {
                        copyToClipboard(item.value);
                        showToast("Copied!");
                      }}
                      className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
