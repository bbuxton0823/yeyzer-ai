import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css'; // Import global styles

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Yeyzer AI Match-Assistant',
  description: 'Revolutionizing professional networking with AI-powered in-person meetups.',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  // Add Open Graph / Social Media metadata
  openGraph: {
    title: 'Yeyzer AI Match-Assistant',
    description: 'Revolutionizing professional networking with AI-powered in-person meetups.',
    url: 'https://yeyzer.ai', // Replace with actual URL
    siteName: 'Yeyzer AI',
    images: [
      {
        url: 'https://yeyzer.ai/og-image.jpg', // Replace with actual OG image
        width: 1200,
        height: 630,
        alt: 'Yeyzer AI Match-Assistant',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  // Add Twitter Card metadata
  twitter: {
    card: 'summary_large_image',
    title: 'Yeyzer AI Match-Assistant',
    description: 'Revolutionizing professional networking with AI-powered in-person meetups.',
    creator: '@YeyzerAI', // Replace with actual Twitter handle
    images: ['https://yeyzer.ai/twitter-image.jpg'], // Replace with actual Twitter image
  },
  // Add Apple / Mobile specific metadata
  appleWebApp: {
    capable: true,
    title: 'Yeyzer AI',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.json', // PWA manifest
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
