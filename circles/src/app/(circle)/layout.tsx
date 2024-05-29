import type { Metadata } from "next";
import TopBar from "../../components/top-bar/top-bar";
import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import Map from "../../components/map/map";
import { Toaster } from "@/components/ui/toaster";
import { getDefaultCircle, getServerConfig } from "@/lib/server-utils";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    let serverConfig = await getServerConfig(true);
    let circle = await getDefaultCircle(true, serverConfig);

    return (
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="relative flex h-screen flex-col overflow-hidden">
                    <TopBar circle={circle} />
                    <div className="flex flex-1 flex-row">
                        <div className={`relative flex min-w-[400px] flex-1`}>{children}</div>
                        <Map mapboxKey={serverConfig?.mapboxKey ?? ""} />
                    </div>
                    <Toaster />
                </main>
            </body>
        </html>
    );
}

export async function generateMetadata(): Promise<Metadata> {
    // get circle from database
    let circle = await getDefaultCircle(false);
    let title = circle?.name || "Circles";
    let description = circle?.description || "Your Social Platform";
    let icon = circle?.picture ?? "/images/default-picture.png";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}
