import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { OfflineStorageBootstrap } from "@/components/core/OfflineStorageBootstrap";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "iAssetsPro - Enterprise Asset Management",
  description: "Intelligent Enterprise Asset Management System",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Cache-busting: force browsers to never cache _next/ assets.
            This inline script runs BEFORE any React code loads, so it catches
            stale bundles immediately on page load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Version marker — changes on every build, busting any cache
                var BUILD_VERSION = "20250620-v1";
                var stored = sessionStorage.getItem('_eam_bv');
                if (stored && stored !== BUILD_VERSION) {
                  // Build version changed — clear all caches to force fresh load
                  if ('caches' in window) {
                    caches.keys().then(function(names) {
                      names.forEach(function(n) { caches.delete(n); });
                    });
                  }
                  sessionStorage.setItem('_eam_bv', BUILD_VERSION);
                } else if (!stored) {
                  sessionStorage.setItem('_eam_bv', BUILD_VERSION);
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <OfflineStorageBootstrap />
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
