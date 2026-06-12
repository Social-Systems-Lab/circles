// layout.tsx - global app layout with the main navigation bar
import { ReactScan } from "../components/utils/react-scan";
import { Wix_Madefor_Display, Libre_Franklin, Bebas_Neue, Yeseva_One } from "next/font/google";
import "@app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Provider } from "jotai";
import { Authenticator } from "@/components/auth/authenticator";
import GlobalNav from "@/components/layout/global-nav";
import { ProfileMenu } from "@/components/layout/profile-menu";
import "mapbox-gl/dist/mapbox-gl.css";
import ImageGallery from "@/components/layout/image-gallery";
import Onboarding from "@/components/onboarding/onboarding";
import Script from "next/script";
import { UnreadCountCalculator } from "@/components/modules/chat/unread-count-calculator";
import { BackgroundMessagePoller } from "@/components/modules/chat/background-message-poller";
import { getServerSettings } from "@/lib/data/server-settings";
import { SidePanel } from "@/components/layout/side-panel";
import { Metadata } from "next";
import { MapboxInitializer } from "@/components/map/map-initializer";
import { FeedPostDialog } from "@/components/global-create/feed-post-dialog"; // Import FeedPostDialog
import { appConfig } from "@/config/app";

// Disable caching for this layout to prevent the "hard refresh bug"
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
const enableReactScan = false;

const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

const bebasNeue = Bebas_Neue({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-bebas-neue",
});
const yesevaOne = Yeseva_One({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-yeseva",
});

type RootLayoutProps = {
    children: React.ReactNode;
};

const RootLayout = async ({ children }: RootLayoutProps) => {
    let serverConfig = await getServerSettings();

    return (
        <html lang="en" className={`${wix.variable} ${libre.variable} ${bebasNeue.variable} ${yesevaOne.variable}`}>
            <head>
                <meta name="app-version" content={process.env.version} />
            </head>
            <body suppressHydrationWarning>
                <Provider>
                    {process.env.NODE_ENV === "development" && enableReactScan && <ReactScan />}
                    <main>
                        <GlobalNav />
                        <div className="relative flex w-full flex-row overflow-hidden">
                            <SidePanel />
                            <div className="relative min-h-[calc(100%-72px)] w-full overflow-x-hidden md:min-h-screen">
                                {children}
                            </div>
                        </div>
                        <div className="fixed right-6 top-4 z-40">
                            <ProfileMenu />
                        </div>
                        <Toaster />
                        <Authenticator />
                        <ImageGallery />
                        <Onboarding />
                        <UnreadCountCalculator />
                        <BackgroundMessagePoller />
                        <MapboxInitializer mapboxKey={serverConfig.mapboxKey} />
                        <FeedPostDialog />
                    </main>
                    <Script id="version-check">
                        {`
                        (function() {
                            try {
                                const currentVersion = "${process.env.version}";
                                const storedVersion = localStorage.getItem('app_version');

                                if (storedVersion && storedVersion !== currentVersion) {
                                    localStorage.setItem('app_version', currentVersion);

                                    if (performance.navigation && performance.navigation.type !== 1) {
                                        window.location.reload(true);
                                    }
                                } else if (!storedVersion) {
                                    localStorage.setItem('app_version', currentVersion);
                                }
                            } catch (e) {
                                console.error('Version check error:', e);
                            }
                        })();
                        `}
                    </Script>
                </Provider>
            </body>
        </html>
    );
};

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: {
            default: `${appConfig.name} — ${appConfig.tagline}`,
            template: `%s | ${appConfig.name}`,
        },
        description: appConfig.description,
        icons: {
            icon: [
                { url: "/peerify/favicon.ico", sizes: "any" },
                { url: "/peerify/favicon.png", type: "image/png" },
            ],
            shortcut: "/peerify/favicon.ico",
            apple: "/peerify/favicon.png",
        },
        openGraph: {
            title: `${appConfig.name} — ${appConfig.tagline}`,
            description: appConfig.description,
            url: appConfig.publicUrl,
            siteName: appConfig.name,
            type: "website",
        },
    };
}

export default RootLayout;
