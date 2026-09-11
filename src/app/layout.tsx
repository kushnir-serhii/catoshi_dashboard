import './styles/globals.css';

import { Geist, Geist_Mono } from 'next/font/google';

import { DashboardProvider } from '@/components/dashboard/context';

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
});

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
      className={`${geist.variable} ${geistMono.variable} dark`}
      data-theme="dark"
    >
      <body className={`${geist.className} antialiased`}>
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
