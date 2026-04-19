import './globals.css';
import Script from 'next/script';

const TITLE = 'NearMe — guess the streets near you';
const DESCRIPTION = 'A hyper-local geography quiz. See Street View images from around your address — can you name where you are?';
const SITE_URL = 'https://nearme.pegsy.uk';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · NearMe',
  },
  description: DESCRIPTION,
  applicationName: 'NearMe',
  keywords: ['geography game', 'street view quiz', 'local knowledge', 'neighbourhood game', 'guessing game', 'Pegsy Games'],
  authors: [{ name: 'Pegsy Games', url: 'https://pegsy.uk' }],
  creator: 'Pegsy Games',
  publisher: 'Pegsy Games',
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'NearMe',
    locale: 'en_GB',
    type: 'website',
    images: [{ url: '/pegsy.webp', width: 450, height: 450, alt: 'Pegsy Games peg' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/pegsy.webp'],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/pegsy.webp' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_API_KEY}&libraries=places`}
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <a className="brand-link" href="https://pegsy.uk" aria-label="Back to Pegsy Games">
          <img src="/pegsy.webp" alt="" />
          <span>Pegsy Games</span>
        </a>
        {children}
      </body>
    </html>
  );
}
