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

const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || "local";

export const metadata: Metadata = {
  title: "iAssetsPro - Enterprise Asset Management",
  description: "Intelligent Enterprise Asset Management System",
  manifest: "/manifest.webmanifest",
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
        {/* Cache-busting: clear prior Cache Storage after a deployed build changes.
            IndexedDB business snapshots are intentionally preserved separately. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var BUILD_VERSION = ${JSON.stringify(buildVersion)};
                var stored = sessionStorage.getItem('_eam_bv');
                if (stored && stored !== BUILD_VERSION) {
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
