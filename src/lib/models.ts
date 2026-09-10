import { useEffect, useState } from "react";

export interface ProviderInfo {
  provider: string;
  model: string;
}

const LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  bigmodel: "智谱 GLM",
};

export function providerLabel(p: ProviderInfo): string {
  return `${LABELS[p.provider] || p.provider} · ${p.model}`;
}

const STORAGE_KEY = "llm_provider";

export function useModels() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("");

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { providers: [], default: null }))
      .then((d) => {
        const list: ProviderInfo[] = d.providers || [];
        setProviders(list);
        const saved = localStorage.getItem(STORAGE_KEY);
        const initial = list.some((p) => p.provider === saved) ? saved : d.default;
        setProvider(initial || list[0]?.provider || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (provider) localStorage.setItem(STORAGE_KEY, provider);
  }, [provider]);

  return { providers, provider, setProvider };
}
