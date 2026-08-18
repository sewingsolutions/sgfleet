import { useState } from "react";
import { useToast } from "../hooks/useToast";
import { copyToClipboard } from "../utils/copyToClipboard";
import CodeBlock from "./CodeBlock";
import { getDownloadFilename } from "../config/tools";
import type { Tool } from "../config/tools";
import type { CursorChecklistItem } from "../api/types";

interface ConfigDisplayProps {
  configJson?: string;
  apiKey?: string;
  rotated?: boolean;
  checklist?: CursorChecklistItem[] | null;
  tool?: Tool;
  showApiKey?: boolean;
}

export default function ConfigDisplay({
  configJson,
  apiKey,
  rotated = false,
  checklist,
  tool,
  showApiKey = true,
}: ConfigDisplayProps) {
  const showToast = useToast();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyValue = (text: string, idx: number) => {
    copyToClipboard(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopy = () => {
    copyToClipboard(configJson || "");
    showToast("Copied!");
  };

  const handleDownload = () => {
    if (!tool) return;
    const filename = getDownloadFilename(tool.id);
    if (filename === "(checklist - no download)") return;
    const mime = tool.language === "json" ? "application/json" : "text/plain";
    const blob = new Blob([configJson || ""], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {showApiKey && apiKey && (
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

      {configJson && tool?.configType === "code" && (
        <div className="mt-4 relative">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">{tool?.name || "Tool"} config:</p>
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
          <CodeBlock code={configJson} language={tool?.language || "text"} />
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
                    onClick={() => copyValue(item.value, idx)}
                    className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
                  >
                    {copiedIndex === idx ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
