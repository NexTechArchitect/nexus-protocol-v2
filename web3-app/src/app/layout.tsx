import "./globals.css";
import { Web3Provider } from "@/components/providers/Web3Provider";
import { Navbar } from "@/components/layout/Navbar";

export const metadata = {
  title: "Nexus Perps | Premium Trading",
  description: "Institutional Grade Decentralized Trading",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Web3Provider>
          {/* Top Navigation globally applied */}
          <Navbar />
          
          {/* Main content area with padding to avoid navbar overlap */}
          <div className="pt-24 min-h-screen">
            {children}
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}