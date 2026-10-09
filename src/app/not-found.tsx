import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="prowl">
      <div className="relative z-1 flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-text-3 font-mono [font-feature-settings:'tnum','zero'] text-xs tracking-(--ls-label) uppercase">
          Error 404
        </p>
        <h1 className="text-text max-w-[20ch] text-xl leading-(--lh-tight) font-medium tracking-(--ls-tight)">
          This page isn&rsquo;t on the map.
        </h1>
        <p className="text-text-2 max-w-[42ch] text-sm leading-(--lh-normal)">
          The link may be broken, or the page may have moved. Everything else is still where you
          left it.
        </p>
        <Link
          href="/"
          className="border-line-2 text-text hover:bg-surface-2 mt-2 inline-flex items-center justify-center rounded-lg border px-5 py-3 text-sm transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
