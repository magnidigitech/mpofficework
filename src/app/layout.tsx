import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Honourable MP Bhashyam Rama Krishna - Tour Schedule",
    template: "%s | MP Bhashyam Rama Krishna Office"
  },
  description: "Official tour schedule, program updates, and public engagement program of Honourable MP Shri Bhashyam Rama Krishna.",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Honourable MP Shri Bhashyam Rama Krishna - Tour Schedule",
    description: "Official tour schedule, program updates, and public engagement program of Honourable MP Shri Bhashyam Rama Krishna.",
    siteName: "MP Bhashyam Rama Krishna Office",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Honourable MP Bhashyam Rama Krishna Logo",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Honourable MP Shri Bhashyam Rama Krishna - Tour Schedule",
    description: "Official tour schedule, program updates, and public engagement program of Honourable MP Shri Bhashyam Rama Krishna.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
