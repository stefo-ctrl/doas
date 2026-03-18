import './globals.css';

export const metadata = {
  title: "DOAS — Department of Australia's Spending",
  description: 'See where Australian tax dollars go. Real-time government procurement contracts from AusTender, sorted by value.',
  metadataBase: new URL('https://doas-six.vercel.app'),
  openGraph: {
    title: "DOAS — Department of Australia's Spending",
    description: 'Australian Government procurement contracts — searchable, sortable, transparent. Powered by AusTender OCDS API.',
    url: 'https://doas-six.vercel.app',
    siteName: 'DOAS',
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "DOAS — Department of Australia's Spending",
    description: 'See where Australian tax dollars go. Real-time government procurement contracts from AusTender.',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
