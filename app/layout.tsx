import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last Bus Out: Road to Haven",
  description:
    "An immersive 3D survival journey through an abandoned hospital, ruined city streets, and the final road to Haven.",
  openGraph: {
    title: "Last Bus Out: Road to Haven",
    description:
      "Enter a physical 3D world, recover real equipment, rescue a survivor, and cross the city before the route closes.",
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
