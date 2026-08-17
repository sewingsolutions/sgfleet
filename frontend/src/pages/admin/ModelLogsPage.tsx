import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useContainerLogs } from "../../hooks/useContainerLogs";
import type { LogLine } from "../../hooks/useContainerLogs";

const levelColors = {
  ERROR: "text-red-400",
  WARNING: "text-amber-400",
  INFO: "text-blue-400",
  DEBUG: "text-gray-500 dark:text-gray-400",
  TIMESTAMP: "text-emerald-400",
  NORMAL: "text-gray-300",
};

const tailOptions = [100, 500, 1000, 2000, 5000];

function PageHeader({ modelName }: { modelName: string }) {
  return (
    <>
      <div className="mb-3">
        <Link
          to="/admin/models"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Models
        </Link>
      </div>
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link to="/admin/models" className="hover:text-gray-800 dark:hover:text-gray-200 transition">
              Models
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-gray-800 dark:text-gray-200 font-medium">Logs: {modelName}</li>
        </ol>
      </nav>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Container Logs</h1>
    </>
  );
}

function LogLineRow({ line }: { line: LogLine }) {
  const colorClass = levelColors[line.level];
  const display = line.timestamp ? `${line.timestamp} ${line.content}` : line.text;

  return (
    <div className={`font-mono text-xs leading-relaxed ${colorClass} whitespace-pre-wrap break-all`}>{display}</div>
  );
}

export default function ModelLogsPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tail, setTail] = useState(500);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const { data: model } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => api.getModel(modelId!),
    enabled: !!modelId,
  });

  const { lines, status, errorMessage, startupError, startupErrorAt, reconnect } = useContainerLogs(
    modelId || "",
    tail,
    autoRefresh,
  );

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  };

  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, atBottom]);

  const stats = useMemo(() => {
    const errorCount = lines.filter((l) => l.level === "ERROR").length;
    const warnCount = lines.filter((l) => l.level === "WARNING").length;
    return { errorCount, warnCount };
  }, [lines]);

  if (!modelId) return null;

  return (
    <div>
      <PageHeader modelName={model?.name || modelId} />

      {startupError && (
        <div className="mb-4 p-3 sm:p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Container failed to start</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300 font-mono break-all">{startupError}</p>
              {startupErrorAt && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {new Date(startupErrorAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 sm:p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 dark:border-slate-600"
              />
              Auto-refresh (live stream)
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Tail lines:</span>
            <select
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
              className="px-2 py-1 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-xs text-gray-900 dark:text-white"
            >
              {tailOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === "streaming"
                    ? "bg-emerald-400"
                    : status === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : status === "error"
                        ? "bg-red-400"
                        : "bg-gray-400"
                }`}
              />
              <span className="text-gray-500 dark:text-gray-400 capitalize">{status}</span>
            </div>
            <span className="text-xs text-gray-400">{lines.length.toLocaleString()} lines</span>
            {stats.errorCount > 0 && <span className="text-xs text-red-400">{stats.errorCount} errors</span>}
            {stats.warnCount > 0 && <span className="text-xs text-amber-400">{stats.warnCount} warnings</span>}
          </div>

          {(status === "ended" || status === "error") && (
            <button
              onClick={reconnect}
              className="px-2 py-1 text-xs rounded transition bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              Reconnect
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="bg-gray-900 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-700 p-3 sm:p-4 overflow-auto"
        style={{ height: startupError ? "calc(100vh - 360px)" : "calc(100vh - 280px)", minHeight: "400px" }}
      >
        {lines.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            {status === "connecting" ? "Connecting..." : "No logs available"}
          </div>
        ) : (
          <div className="space-y-0.5">
            {lines.map((line, i) => (
              <LogLineRow key={i} line={line} />
            ))}
          </div>
        )}
      </div>

      {!atBottom && (
        <button
          onClick={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          className="fixed bottom-6 right-6 px-3 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-lg transition"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
