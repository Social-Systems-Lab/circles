import type { Metadata } from "next";
import TopBar from "./TopBar";
import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import type { Circle } from "@/types/models";
import Map from "./Map";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });
export const metadata: Metadata = {
    title: "Social Systems Lab",
    description: "Tools for Transformation",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const circle: Circle = {
        picture: "/images/picture.png",
        cover: "/images/cover.png",
        name: "CircleName",
    };

    return (
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="flex flex-col h-screen relative overflow-hidden">
                    <TopBar circle={circle} />
                    <div className="flex-1 flex flex-row">
                        <div className={`flex-1 min-w-[400px]`}>{children}</div>
                        <Map />
                    </div>
                </main>
            </body>
        </html>
    );
}
