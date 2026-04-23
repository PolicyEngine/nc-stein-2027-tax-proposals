import Script from 'next/script';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const GA_ID = 'G-2YHG89FY0N';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const SITE_URL = 'https://policyengine.org/us/nc-stein-2027-tax-proposals';

export const metadata: Metadata = {
  title: 'North Carolina Stein FY2026-27 Tax Proposals Calculator',
  description:
    "See how Governor Josh Stein's FY2026-27 North Carolina tax proposals (maintaining the 3.99% individual income tax rate, raising the standard deduction, and enacting state Working Families and Child and Dependent Care tax credits) affect your household and the state.",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  keywords: [
    'us',
    'north-carolina',
    'stein',
    'tax',
    'eitc',
    'cdcc',
    'standard-deduction',
  ],
  openGraph: {
    title: 'North Carolina Stein FY2026-27 Tax Proposals Calculator',
    description:
      "See how Governor Josh Stein's FY2026-27 North Carolina tax proposals (maintaining the 3.99% individual income tax rate, raising the standard deduction, and enacting state Working Families and Child and Dependent Care tax credits) affect your household and the state.",
    url: SITE_URL,
    siteName: 'PolicyEngine',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'North Carolina Stein FY2026-27 Tax Proposals Calculator',
    description:
      "See how Governor Josh Stein's FY2026-27 North Carolina tax proposals (maintaining the 3.99% individual income tax rate, raising the standard deduction, and enacting state Working Families and Child and Dependent Care tax credits) affect your household and the state.",
  },
  other: {
    'theme-color': '#2C7A7B', // CSS var not supported in meta tags, matches --theme-color
  },
  icons: {
    icon: '/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
