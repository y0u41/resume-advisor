import { providerLabel, type ProviderInfo } from "../lib/models";

interface Props {
  providers: ProviderInfo[];
  value: string;
  onChange: (provider: string) => void;
}

export default function ModelSelect({ providers, value, onChange }: Props) {
  if (providers.length <= 1) return null;

  return (
    <div className="model-select">
      <span className="model-select-label">模型</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {providers.map((p) => (
          <option key={p.provider} value={p.provider}>
            {providerLabel(p)}
          </option>
        ))}
      </select>
    </div>
  );
}
