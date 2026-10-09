interface PredictionMetaProps {
  left: string;
  right: string;
}

/** Two-ended caption row under a prediction card's main figures. */
export function PredictionMeta({ left, right }: PredictionMetaProps) {
  return (
    <div className="text-text-3 mt-2 flex justify-between font-mono text-sm">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
