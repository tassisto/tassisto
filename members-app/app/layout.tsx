import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tassisto No-Gi Training Camp | Taroudant",
  description: "Periodic no-gi Brazilian Jiu-Jitsu training camps and member session booking in Taroudant, Morocco.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
