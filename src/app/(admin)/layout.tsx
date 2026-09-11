import { Header } from '@/components/layout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prowl min-h-screen">
      {/* `.app` is the responsive shell: max-width + the side gutter that
          dashboard.css steps down at 1024 / 768 / 640 / 390px. */}
      <div className="app">
        <Header />
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
