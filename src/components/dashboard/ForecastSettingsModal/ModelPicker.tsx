import { ModalSection } from '../ModalSection';
import { ChoiceButton } from './ChoiceButton';

interface ModelPickerProps {
  models: ReadonlyArray<{ id: string; label: string }>;
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelPicker({ models, value, onChange }: ModelPickerProps) {
  return (
    <ModalSection label="Model">
      <div className="flex flex-wrap gap-2">
        {models.map((m) => (
          <ChoiceButton
            key={m.id}
            selected={value === m.id}
            onClick={() => onChange(m.id)}
            className="rounded-pill py-2"
          >
            {m.label}
          </ChoiceButton>
        ))}
      </div>
    </ModalSection>
  );
}
