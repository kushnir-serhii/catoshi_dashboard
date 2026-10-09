import { ModalSection } from '../ModalSection';
import { ChoiceButton } from './ChoiceButton';

export type ForecastService = 'claude' | 'openai';

const PROVIDERS: ReadonlyArray<{ id: ForecastService; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
];

interface ProviderPickerProps {
  value: ForecastService;
  onChange: (service: ForecastService) => void;
}

export function ProviderPicker({ value, onChange }: ProviderPickerProps) {
  return (
    <ModalSection label="AI provider">
      <div className="flex gap-3">
        {PROVIDERS.map((p) => (
          <ChoiceButton
            key={p.id}
            selected={value === p.id}
            onClick={() => onChange(p.id)}
            className="flex-1 rounded py-3"
          >
            {p.label}
          </ChoiceButton>
        ))}
      </div>
    </ModalSection>
  );
}
