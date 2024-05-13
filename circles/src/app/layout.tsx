import type { Metadata } from "next";
import TopBar from "./TopBar";
import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "./globals.css";
import picture from "@images/picture.png";
import cover from "@images/cover.png";
import type { Circle } from "../types/models";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });
export const metadata: Metadata = {
    title: "Circles",
    description: "A world connected",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const circle: Circle = {
        picture: picture,
        cover: cover,
        name: "Social Systems Lab",
    };

    return (
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="flex flex-col h-screen relative overflow-hidden">
                    <TopBar circle={circle} />
                    {children}
                </main>
            </body>
        </html>
    );
}
