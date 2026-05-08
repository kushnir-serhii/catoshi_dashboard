import { Sidebar, Header } from '@/layout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar and Backdrop */}
      <Sidebar />

      <div className="mx-auto flex w-full flex-1 flex-col">
        <Header />

        {/* Main Content */}
        {children}
      </div>
    </div>
  );
}
