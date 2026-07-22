import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { AppSidebar } from "@/components/app-sidebar"
import { HeaderBackButton } from "@/components/header-back-button"
import { ThemeProvider } from "@/components/theme-provider"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const geistMonoHeading = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-heading",
})

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Retrace — Record browser flows, replay as Playwright tests",
    template: "%s | Retrace",
  },
  description:
    "Retrace records your clicks, typing and navigation in Chrome and turns them into Playwright TypeScript tests. Save scripts to your library, replay them with one click, and get failure reports with console errors, network failures, screenshots and traces.",
  keywords: [
    "Playwright",
    "test recorder",
    "browser automation",
    "E2E testing",
    "test generation",
    "Chrome extension",
    "QA automation",
    "record and replay",
    "Playwright codegen",
  ],
  applicationName: "Retrace",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
        geistMonoHeading.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
                  <SidebarTrigger className="-ml-1" />
                  <HeaderBackButton />
                  <span className="text-xs text-muted-foreground">
                    Playwright recorder & runner
                  </span>
                </header>
                <main className="w-full flex-1 p-6">{children}</main>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
