export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prowl" style={{ minHeight: '100vh' }}>
      {children}
    </div>
  );
}
