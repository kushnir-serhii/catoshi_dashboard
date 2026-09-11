import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="prowl">
      <div className="relative z-1 flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
        <p
          className="mono uppercase"
          style={{
            fontSize: 'var(--fs-xs)',
            letterSpacing: 'var(--ls-label)',
            color: 'var(--text-3)',
          }}
        >
          Error 404
        </p>
        <h1
          className="max-w-[20ch]"
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 500,
            lineHeight: 'var(--lh-tight)',
            letterSpacing: 'var(--ls-tight)',
            color: 'var(--text)',
          }}
        >
          This page isn&rsquo;t on the map.
        </h1>
        <p
          className="max-w-[42ch]"
          style={{ fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-2)' }}
        >
          The link may be broken, or the page may have moved. Everything else is still where you
          left it.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center justify-center rounded-lg border border-line-2 px-5 py-3 transition-colors hover:bg-surface-2"
          style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
