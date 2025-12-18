import { Inter } from "next/font/google"
import "./globals.css"
import Navbar from "@/components/Navbar"  // Add this import

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "ResellTracker - Manage Your Reselling Business",
  description: "Track inventory, sales, and profits for your reselling business",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />  {/* Add the Navbar here */}
        {children}
      </body>
    </html>
  )
}