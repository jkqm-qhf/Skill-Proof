export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: data === undefined ? "GET" : "POST", headers: data === undefined ? {} : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}
export interface BackendJob { id: string; profileId: string; version: number; state: "queued" | "running" | "succeeded" | "failed" | "cancelled"; executionId?: string; error?: string; logs: { at: string; message: string }[] }
