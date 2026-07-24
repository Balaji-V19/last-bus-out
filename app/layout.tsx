import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last Bus Out: Road to Haven",
  description:
    "A playable browser survival vertical slice. Escape the hospital, rescue a survivor, fuel the bike, and outrun the horde.",
  openGraph: {
    title: "Last Bus Out: Road to Haven",
    description:
      "Every rescue is another reason to keep moving. Play the survival vertical slice.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Last Bus Out: Road to Haven",
    description: "Escape. Rescue. Refuel. Outrun the horde.",
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
