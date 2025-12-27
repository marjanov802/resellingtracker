// app/program/layout.js
import { Inter } from "next/font/google"
import ProgramNavbar from "@/components/ProgramNavbar"

const inter = Inter({ subsets: ["latin"] })

export default function ProgramLayout({ children }) {
    return (
        <div className={`${inter.className} min-h-screen bg-black`}>
            <ProgramNavbar />
            <main className="pt-16">{children}</main>
        </div>
    )
}
