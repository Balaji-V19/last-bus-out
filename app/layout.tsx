import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackout at St. Orison",
  description:
    "A connected 3D hospital-horror game about rescuing survivors, suppressing an infection, and containing mutated patients across St. Orison's sealed floors.",
  openGraph: {
    title: "Blackout at St. Orison",
    description:
      "Search a sealed hospital for survivors, food, medicine, and a safe room while the containment failure evolves around you.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blackout at St. Orison",
    description: "Search. Rescue. Suppress the infection. Survive the hospital.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
