import './styles/globals.css';

// Self-hosted Geist (next/font/local under the hood): no Google Fonts fetch at
// build time, so builds don't fail when fonts.gstatic.com is unreachable.
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { DashboardProvider } from '@/components/dashboard/context';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The app is dark only. `dark` / data-theme are static here so Tailwind's
  // `dark:` variant stays valid; there is no theme provider and no toggle.
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      data-theme="dark"
    >
      <body className={`${GeistSans.className} antialiased`}>
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
