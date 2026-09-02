import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="relative z-1 flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-mono text-sm tracking-[0.2em] text-text-3 uppercase">Error 404</p>
      <h1 className="max-w-[20ch] text-3xl font-medium tracking-tight text-text sm:text-4xl">
        This page isn&rsquo;t on the map.
      </h1>
      <p className="max-w-[42ch] text-sm text-text-2">
        The link may be broken, or the page may have moved. Everything else is still where you left
        it.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center justify-center rounded-lg border border-line-2 px-5 py-3 text-sm text-text transition-colors hover:bg-surface-2"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
