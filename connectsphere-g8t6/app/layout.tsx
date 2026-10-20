import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { NavigationGuard } from "@/components/shared/navigation-guard";

const hankenGrotesk = Hanken_Grotesk({ variable: "--font-hanken-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ConnectSphere | Event Requests",
  description: "Event requests and role-based workspaces",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className={`${hankenGrotesk.variable} h-full antialiased`}>
    <body className="min-h-full flex flex-col">
      <NavigationGuard>{children}</NavigationGuard>
    </body>
  </html>;
}
