import { Header } from '@/components/layout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prowl min-h-screen pb-12">
      <Header />
      <main>{children}</main>
    </div>
  );
}
