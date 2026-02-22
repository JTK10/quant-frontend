import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Radar, LineChart, Cpu, BarChart3, Activity, PieChart, UserCircle } from 'lucide-react';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Quant Radar | Pro",
  description: "Institutional Trading Analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-brand-bg text-white antialiased min-h-screen flex`}>
        
        {/* SaaS Sidebar */}
        <nav className="w-64 h-screen sticky top-0 bg-brand-surface border-r border-brand-border flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-brand-border mb-4">
              <div className="text-xl font-black text-white flex items-center gap-2 tracking-wide">
                <Radar className="text-brand-accent" size={24} />
                QUANT RADAR
              </div>
            </div>
            
            <div className="px-4 space-y-1">
              <div className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 px-3 mt-4">Dashboards</div>
              
              <a href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-brand-accent/10 text-brand-accent font-medium transition-colors">
                <Activity size={18} /> Smart Radar
              </a>
              <a href="/velocity" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-gray-300 font-medium transition-colors">
                <BarChart3 size={18} /> Market Velocity
              </a>
              
              <div className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 px-3 mt-8">Swing & AI</div>
              
              <a href="/swing" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-gray-300 font-medium transition-colors">
                <LineChart size={18} /> Swing Trading
              </a>
              <a href="/analytics" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-gray-300 font-medium transition-colors">
                <PieChart size={18} /> Swing Analytics
              </a>
              <a href="/ai-signals" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-gray-300 font-medium transition-colors">
                <Cpu size={18} /> AI Signal
              </a>
              <a href="/sector" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-gray-300 font-medium transition-colors">
                <Radar size={18} /> Sector Heatmap
              </a>
            </div>
          </div>

          {/* User Profile / SaaS Account Area */}
          <div className="p-4 border-t border-brand-border">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <UserCircle size={24} className="text-brand-muted" />
              <div>
                <div className="text-sm font-medium text-white">Pro Subscriber</div>
                <div className="text-xs text-brand-muted">Manage Account</div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>

      </body>
    </html>
  );
}
