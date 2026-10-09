interface ShowMoreToggleProps {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
  controlsId?: string;
}

export function ShowMoreToggle({
  expanded,
  hiddenCount,
  onToggle,
  controlsId,
}: ShowMoreToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      className="rounded-pill border-surface-3 bg-surface-2 text-text-2 col-span-full cursor-pointer justify-self-center border px-4 py-2 text-sm leading-(--lh-normal)"
    >
      {expanded ? 'Show less' : `Show ${hiddenCount} more`}
    </button>
  );
}
