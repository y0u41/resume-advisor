import { useEffect, useState } from "react";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderGroup {
  provider: string;
  label: string;
  models: ModelOption[];
}

export interface ModelSelection {
  provider: string;
  model: string;
}

const STORAGE_KEY = "llm_model";

export function useModels() {
  const [groups, setGroups] = useState<ProviderGroup[]>([]);
  const [selection, setSelection] = useState<ModelSelection | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { providers: [], default: null }))
      .then((d) => {
        const list: ProviderGroup[] = d.providers || [];
        setGroups(list);

        let initial: ModelSelection | null = null;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const [p, m] = saved.split("::");
          const g = list.find((x) => x.provider === p);
          if (g && g.models.some((mm) => mm.id === m)) initial = { provider: p, model: m };
        }
        if (!initial && d.default) initial = d.default;
        if (!initial && list[0]) initial = { provider: list[0].provider, model: list[0].models[0].id };
        setSelection(initial);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selection) {
      localStorage.setItem(STORAGE_KEY, `${selection.provider}::${selection.model}`);
    }
  }, [selection]);

  return { groups, selection, setSelection };
}
