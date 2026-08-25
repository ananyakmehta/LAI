import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ViewAsBanner } from "./view-as-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Learning in Action Day Signup",
  description: "Presentation High School Learning in Action Day trip signup",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ViewAsBanner />
        {children}
      </body>
    </html>
  );
}
