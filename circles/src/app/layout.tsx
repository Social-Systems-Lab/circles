// global app layout with the main navigation bar
import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Provider } from "jotai";
import { Authenticator } from "@/components/auth/authenticator";
import GlobalNav from "@/components/layout/global-nav";
import { ProfileMenu } from "@/components/layout/profile-menu";
import "mapbox-gl/dist/mapbox-gl.css";
import ImageGallery from "@/components/layout/image-gallery";
import Onboarding from "@/components/onboarding/onboarding";
import Head from "next/head";
import { MatrixSync } from "@/components/modules/chat/matrix-sync";
import MapAndContentWrapper from "@/components/map/map";
import { getServerSettings } from "@/lib/data/server-settings";
import { SidePanel } from "@/components/layout/side-panel";
import { Metadata } from "next";
import { getDefaultCircle } from "@/lib/data/circle";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

type RootLayoutProps = {
    children: React.ReactNode;
};

const RootLayout = async ({ children }: RootLayoutProps) => {
    let serverConfig = await getServerSettings();

    return (
        <Provider>
            <html lang="en" className={`${wix.variable} ${libre.variable}`}>
                <body className={inter.className}>
                    <main className="relative flex flex-col md:flex-row">
                        <GlobalNav />
                        <div className="relative flex w-full flex-row overflow-hidden">
                            <div className="relative min-h-screen w-full overflow-x-hidden bg-[#fbfbfb]">
                                {children}
                            </div>
                            <SidePanel />
                        </div>
                        <div className="fixed right-6 top-4 z-40">
                            <ProfileMenu />
                        </div>

                        <Toaster />
                        <Authenticator />
                        <ImageGallery />
                        <Onboarding />
                        <MatrixSync />
                    </main>
                </body>
            </html>
        </Provider>
    );
};

export async function generateMetadata(): Promise<Metadata> {
    // get circle from database
    let circle = await getDefaultCircle();
    let title = circle.name;
    let description = circle.description;
    let icon = circle.picture?.url ?? "/images/default-picture.png";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}

export default RootLayout;
