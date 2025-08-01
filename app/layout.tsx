import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import "./globals.css"

const geist = GeistSans

export const metadata: Metadata = {
  title: "Midam - AI Chat Interface",
  description: "Modern AI chat interface with multiple model support",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-[#0f0f0f] overflow-hidden`}>{children}</body>
    </html>
  )
}
