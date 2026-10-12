import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConnectSphere · Event requests",
  description: "Create and track campus event requests.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
