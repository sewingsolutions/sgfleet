import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import UserLayout from "../../components/UserLayout";
import ConfigDisplay from "../../components/ConfigDisplay";
import { useGenerateConfig } from "../../hooks/useGenerateConfig";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import { api } from "../../api/client";
import { copyToClipboard } from "../../utils/copyToClipboard";
import { tools } from "../../config/tools";
import type { UserConfigResponse, CursorChecklistItem } from "../../api/types";

const Card = ({
  tool,
  loading,
  result,
  checklist,
  error,
  visible,
  onGenerate,
  onClose,
}: {
  tool: (typeof tools)[0];
  loading: boolean;
  result: UserConfigResponse | null;
  checklist: CursorChecklistItem[] | null;
  error: string | null;
  visible: boolean;
  onGenerate: () => void;
  onClose: () => void;
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
      <h3 className="font-bold text-lg mb-1">{tool.name}</h3>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{tool.description}</p>

      <button
        onClick={onGenerate}
        disabled={loading}
        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {loading ? "Generating..." : "Generate"}
      </button>

      {visible && result && !error && (
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
          >
            Hide
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {visible && result && !error && (
        <ConfigDisplay configJson={result.config_json} checklist={checklist} tool={tool} showApiKey={false} />
      )}
    </div>
  );
};

export default function UserConfigPage() {
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, UserConfigResponse | null>>({});
  const [checklists, setChecklists] = useState<Record<string, CursorChecklistItem[] | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [rotating, setRotating] = useState(false);

  const confirmAction = useConfirm();
  const showToast = useToast();
  const { mutate: generateConfig } = useGenerateConfig();

  const handleGenerate = useCallback(
    (clientId: string) => {
      if (results[clientId]) {
        setVisible((prev) => ({ ...prev, [clientId]: true }));
        return;
      }

      setGenerating((prev) => ({ ...prev, [clientId]: true }));
      setErrors((prev) => ({ ...prev, [clientId]: null }));
      generateConfig(clientId, {
        onSuccess: (res) => {
          if (res.error) {
            setErrors((prev) => ({ ...prev, [clientId]: res.error || null }));
          } else {
            setResults((prev) => ({ ...prev, [clientId]: res }));
            setVisible((prev) => ({ ...prev, [clientId]: true }));
            setChecklists((prev) => ({ ...prev, [clientId]: res.checklist || null }));
            if (res.api_key && !apiKey) {
              setApiKey(res.api_key);
            }
          }
        },
        onError: (e: Error) => {
          setErrors((prev) => ({ ...prev, [clientId]: e?.message || "Failed to generate config" }));
        },
        onSettled: () => {
          setGenerating((prev) => ({ ...prev, [clientId]: false }));
        },
      });
    },
    [results, apiKey, generateConfig],
  );

  const handleClose = useCallback((clientId: string) => {
    setVisible((prev) => ({ ...prev, [clientId]: false }));
  }, []);

  const handleRotateKey = useCallback(async () => {
    if (!(await confirmAction("Rotate your API key? The current key will be invalidated immediately.", true))) return;
    setRotating(true);
    try {
      const res = await api.user.rotateKey();
      setApiKey(res.api_key);
      setResults({});
      setChecklists({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to rotate key";
      showToast(msg);
    } finally {
      setRotating(false);
    }
  }, [confirmAction, showToast]);

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Config Generator</h1>

      <div className="mb-6">
        {!showToken ? (
          <button
            onClick={() => setShowToken(true)}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition text-sm sm:w-auto"
          >
            Show token
          </button>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            {apiKey ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">Your API Key:</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-sm text-indigo-600 dark:text-indigo-300 font-mono break-all">
                    {apiKey}
                  </code>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => {
                        copyToClipboard(apiKey);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                      className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
                    >
                      {copiedToken ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Generate a config below to see your token.</p>
            )}
            <div className="flex justify-between items-center mt-3">
              <button
                onClick={handleRotateKey}
                disabled={rotating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition text-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotating ? "animate-spin" : ""}`} />
                {rotating ? "Rotating..." : "Rotate Key"}
              </button>
              <button
                onClick={() => setShowToken(false)}
                className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
              >
                Hide
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <Card
            key={tool.id}
            tool={tool}
            loading={!!generating[tool.id]}
            result={results[tool.id] || null}
            checklist={checklists[tool.id] || null}
            error={errors[tool.id] || null}
            visible={!!visible[tool.id]}
            onGenerate={() => handleGenerate(tool.id)}
            onClose={() => handleClose(tool.id)}
          />
        ))}
      </div>
    </UserLayout>
  );
}
