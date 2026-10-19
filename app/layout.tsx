import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { horizon } from "@/app/fonts";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
export const metadata: Metadata = {
  title: "WTNS — Witness To Nations' Souls",
  description: "Purposeful streetwear by WTNS.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${horizon.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><SiteHeader /><main className="site-main">{children}</main><SiteFooter /></body>
    </html>
  );
}
