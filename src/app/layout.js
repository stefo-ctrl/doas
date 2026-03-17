import './globals.css';

export const metadata = {
  title: "DOAS — Department of Australia's Spending",
  description: 'Australian Government procurement data, sourced from AusTender OCDS API.',
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
