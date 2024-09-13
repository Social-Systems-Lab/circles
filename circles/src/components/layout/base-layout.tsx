import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import MapAndContentWrapper from "../map/map";
import { Toaster } from "@/components/ui/toaster";
import { Provider } from "jotai";
import { Authenticator } from "@/components/auth/authenticator";
import { Circle, ServerSettings } from "@/models/models";
import NavBar from "./nav-bar";
import { ProfileMenu } from "./profile-menu";
import "mapbox-gl/dist/mapbox-gl.css";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

type BaseLayoutProps = {
    children: React.ReactNode;
    circle: Circle;
    serverConfig: ServerSettings;
    isDefaultCircle: boolean;
};

const BaseLayout = ({ children, circle, serverConfig, isDefaultCircle }: BaseLayoutProps) => (
    <Provider>
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="relative flex flex-col md:flex-row">
                    <NavBar circle={circle} isDefaultCircle={isDefaultCircle} />
                    <MapAndContentWrapper mapboxKey={serverConfig?.mapboxKey ?? ""}>{children}</MapAndContentWrapper>
                    <div className="fixed right-6 top-4 z-40">
                        <ProfileMenu />
                    </div>

                    <Toaster />
                    <Authenticator />
                </main>
            </body>
        </html>
    </Provider>
);

export default BaseLayout;
