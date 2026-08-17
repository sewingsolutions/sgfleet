import UserLayout from "../../components/UserLayout";
import { useMyModels } from "../../hooks/useMyModels";

export default function UserModelsPage() {
  const { data, isLoading, isError } = useMyModels();

  if (isError) {
    return (
      <UserLayout>
        <h1 className="text-2xl font-bold mb-6">Authorized Models</h1>
        <p className="text-gray-500 dark:text-gray-400">Unable to load models.</p>
      </UserLayout>
    );
  }

  const models = data?.models ?? [];

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Authorized Models</h1>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : models.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No models assigned. Contact your admin to request access.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((m) => (
            <div
              key={m.model_id}
              className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{m.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{m.model_alias}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full ${m.active ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${m.active ? "bg-emerald-500" : "bg-gray-400"}`} />
                    {m.active ? "Active" : "Inactive"}
                  </span>
                  {m.active && (
                    <span
                      className={`text-xs ${m.ready ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                    >
                      {m.ready ? "Ready" : "Loading..."}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </UserLayout>
  );
}
