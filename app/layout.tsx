import type { Metadata } from 'next';
import './globals.css';
import NavSidebar from './components/NavSidebar';

export const metadata: Metadata = {
  title: 'Quant Radar | Pro',
  description: 'Institutional Trading Analytics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex antialiased" style={{ background: 'var(--color-brand-bg)', color: 'var(--color-brand-text)' }}>
        <NavSidebar />
        <main className="flex-1 overflow-y-auto min-h-screen p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
