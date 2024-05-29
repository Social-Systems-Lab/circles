import type { Metadata } from "next";
import TopBar from "../../components/navigation/top-bar";
import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import type { Circle } from "@/models/models";
import Map from "../../components/map/map";
import { ServerConfigs } from "@/lib/db";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

export const metadata: Metadata = {
    title: "Social Systems Lab",
    description: "Tools for Transformation",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // get server config and circle from database
    let serverConfig = await ServerConfigs.findOne({});
    // TODO uncomment when registration flow is implemented
    // if (!serverConfig) {
    //     await ServerConfigs.insertOne({ status: "setup", setup_status: "config" });
    //     redirect("/setup");
    // }
    // if (serverConfig.status === "setup") {
    //     if (serverConfig.setup_status === "config") {
    //         redirect("/setup");
    //     } else if (serverConfig.setup_status === "account") {
    //         redirect("/login");
    //     } else {
    //         redirect("/setup");
    //     }
    // }

    const circle: Circle = {
        picture: "/images/picture.png",
        cover: "/images/cover.png",
        name: "CircleName",
        handle: "circleHandle",
    };

    return (
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="relative flex h-screen flex-col overflow-hidden">
                    <TopBar circle={circle} />
                    <div className="flex flex-1 flex-row">
                        <div className={`relative min-w-[400px] flex-1`}>{children}</div>
                        <Map mapboxKey={serverConfig?.mapboxKey ?? ""} />
                    </div>
                    <Toaster />
                </main>
            </body>
        </html>
    );
}
