import { Inter } from "next/font/google"
import "./globals.css"
import Navbar from "@/components/Navbar"
import { ClerkProvider } from "@clerk/nextjs"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "ResellTracker - Manage Your Reselling Business",
  description: "Track inventory, sales, and profits for your reselling business",
}

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className} suppressHydrationWarning>
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
