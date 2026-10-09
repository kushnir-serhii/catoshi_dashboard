import { cn } from '@/utils/cn';

interface FaqItemProps {
  id: string;
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}

export function FaqItem({ id, q, a, open, onToggle }: FaqItemProps) {
  // The question is a real <button>, not a div with a click handler: the row
  // is reachable by keyboard, announces its open/closed state, and the answer
  // is tied to it so a screen reader reads the pair together.
  return (
    <div className={cn('faq-item', open && 'open')}>
      <button
        type="button"
        className="faq-q"
        aria-expanded={open}
        aria-controls={`${id}-answer`}
        id={`${id}-question`}
        onClick={onToggle}
      >
        <span>{q}</span>
        <span className="faq-icon" aria-hidden="true">
          +
        </span>
      </button>
      <div
        className="faq-body"
        id={`${id}-answer`}
        role="region"
        aria-labelledby={`${id}-question`}
      >
        <div>
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}
