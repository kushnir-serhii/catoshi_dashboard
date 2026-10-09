const FRED_TERMS_URL = 'https://fred.stlouisfed.org/docs/api/terms_of_use.html';

/** Attribution required by the FRED API Terms of Use. Rendered in every page footer. */
export function FredAttribution() {
  return (
    <p className="text-text-3 mt-4 w-full text-xs leading-(--lh-normal) in-[.app-footer]:mt-0">
      This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank
      of St. Louis.{' '}
      <a
        href={FRED_TERMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-2 hover:text-text underline"
      >
        FRED API Terms of Use
      </a>
    </p>
  );
}
