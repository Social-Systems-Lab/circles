import type { Metadata } from "next";
import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import "mapbox-gl/dist/mapbox-gl.css";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });
export const metadata: Metadata = {
    title: "Circles",
    description: "Your Social Platform",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="relative flex h-screen flex-col overflow-hidden">{children}</main>
                <Toaster />
            </body>
        </html>
    );
}
