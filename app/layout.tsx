import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "freshkeep.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "FreshKeep — Know what to use next",
    description: "A shared household tracker for perishables, expiry dates, and timely reminders.",
    openGraph: {
      title: "FreshKeep",
      description: "Know what to use next.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1736, height: 907, alt: "FreshKeep — Know what to use next" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "FreshKeep",
      description: "Know what to use next.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
