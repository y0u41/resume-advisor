import type { ModelSelection, ProviderGroup } from "../lib/ui/models";

interface Props {
  groups: ProviderGroup[];
  value: ModelSelection | null;
  onChange: (selection: ModelSelection) => void;
}

export default function ModelSelect({ groups, value, onChange }: Props) {
  const total = groups.reduce((n, g) => n + g.models.length, 0);
  if (total <= 1) return null;

  const current = value ? `${value.provider}::${value.model}` : "";

  return (
    <div className="model-select">
      <span className="model-select-label">模型</span>
      <select
        value={current}
        onChange={(e) => {
          const [provider, model] = e.target.value.split("::");
          onChange({ provider, model });
        }}
      >
        {groups.map((g) => (
          <optgroup key={g.provider} label={g.label}>
            {g.models.map((m) => (
              <option key={m.id} value={`${g.provider}::${m.id}`}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
