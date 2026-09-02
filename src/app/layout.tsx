import './styles/globals.css';

import { Geist, Geist_Mono } from 'next/font/google';

import { DashboardProvider } from '@/components/dashboard/context';
import { ThemeProvider } from '@/context/ThemeContext';

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
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} dark`}
      data-theme="dark"
    >
      <body className={`${geist.className} antialiased`}>
        <ThemeProvider>
          <DashboardProvider>{children}</DashboardProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
