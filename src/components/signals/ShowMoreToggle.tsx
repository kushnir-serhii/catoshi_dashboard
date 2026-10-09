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
      className="small"
      style={{
        gridColumn: '1 / -1',
        justifySelf: 'center',
        padding: 'var(--sp-2) var(--sp-4)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-2)',
        border: '1px solid var(--surface-3)',
        color: 'var(--text-2)',
        cursor: 'pointer',
      }}
    >
      {expanded ? 'Show less' : `Show ${hiddenCount} more`}
    </button>
  );
}
