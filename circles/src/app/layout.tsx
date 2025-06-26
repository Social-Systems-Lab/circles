// layout.tsx - global app layout with the main navigation bar
import { ReactScan } from "../components/utils/react-scan";
import { Wix_Madefor_Display, Libre_Franklin, Inter, Bebas_Neue } from "next/font/google";
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
import { MatrixSync } from "@/components/modules/chat/matrix-sync";
import { getServerSettings } from "@/lib/data/server-settings";
import { SidePanel } from "@/components/layout/side-panel";
import { Metadata } from "next";
import { getDefaultCircle } from "@/lib/data/circle";
import { MapboxInitializer } from "@/components/map/map-initializer";
import { SupportButton } from "@/components/layout/support-button";
import { FeedPostDialog } from "@/components/global-create/feed-post-dialog"; // Import FeedPostDialog

// Disable caching for this layout to prevent the "hard refresh bug"
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
const enableReactScan = false;

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

const bebasNeue = Bebas_Neue({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-bebas-neue",
});

type RootLayoutProps = {
    children: React.ReactNode;
};

const RootLayout = async ({ children }: RootLayoutProps) => {
    let serverConfig = await getServerSettings();

    return (
        <Provider>
            <html lang="en" className={`${wix.variable} ${libre.variable} ${bebasNeue.variable}`}>
                {process.env.NODE_ENV === "development" && enableReactScan && <ReactScan />}
                <head>
                    <meta name="app-version" content={process.env.version} />
                </head>
                <body className={inter.className}>
                    <main className="relative flex flex-col md:flex-row">
                        <GlobalNav />
                        <div className="relative flex w-full flex-row overflow-hidden">
                            <div className="relative min-h-[calc(100%-72px)] w-full overflow-x-hidden bg-[#fbfbfb] md:min-h-screen">
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
                        <MapboxInitializer mapboxKey={serverConfig.mapboxKey} />
                        <SupportButton />
                        <FeedPostDialog /> {/* Add FeedPostDialog here */}
                    </main>
                    <Script id="version-check">
                        {`
                        (function() {
                            try {
                                const currentVersion = "${process.env.version}";
                                const storedVersion = localStorage.getItem('app_version');
                                
                                if (storedVersion && storedVersion !== currentVersion) {
                                    // Version changed - clear caches
                                    localStorage.setItem('app_version', currentVersion);
                                    
                                    // Only reload if not a fresh page load (prevents infinite reloads)
                                    if (performance.navigation && performance.navigation.type !== 1) {
                                        window.location.reload(true);
                                    }
                                } else if (!storedVersion) {
                                    // First time - set version
                                    localStorage.setItem('app_version', currentVersion);
                                }
                            } catch (e) {
                                console.error('Version check error:', e);
                            }
                        })();
                        `}
                    </Script>
                </body>
            </html>
        </Provider>
    );
};

export async function generateMetadata(): Promise<Metadata> {
    // get circle from database
    let circle = await getDefaultCircle();
    let title = circle.name;
    let description = circle.description ?? "Connect. Collaborate. Create Change.";
    let icon = circle.picture?.url ?? "/images/circles-picture.svg";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}

export default RootLayout;
