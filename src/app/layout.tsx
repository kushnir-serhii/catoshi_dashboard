import './styles/globals.css';
import localFont from 'next/font/local';
import { ThemeProvider } from '@/context/ThemeContext';
import { Open_Sans } from 'next/font/google';

export const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-family',
});
//
const fixelDisplay = localFont({
  src: [
    {
      path: '../../public/fonts/fixelDisplay-semiBold.woff2',
      weight: '600',
    },
    {
      path: '../../public/fonts/fixelDisplay-medium.woff2',
      weight: '500',
    },
  ],
  variable: '--font-secondary',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openSans.variable} ${fixelDisplay.variable} dark`}
      data-theme="dark"
    >
      <body className={`${openSans.className} font-sans antialiased dark:bg-gray-900`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
