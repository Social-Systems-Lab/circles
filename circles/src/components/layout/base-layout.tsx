import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import Map from "../map/map";
import { Toaster } from "@/components/ui/toaster";
import { Provider } from "jotai";
import { Authenticator } from "@/components/auth/authenticator";
import { Circle, ServerConfig } from "@/models/models";
import TopBar from "../top-bar/top-bar";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

type BaseLayoutProps = {
    children: React.ReactNode;
    circle: Circle;
    serverConfig: ServerConfig;
    isDefaultCircle: boolean;
};

const BaseLayout = ({ children, circle, serverConfig, isDefaultCircle }: BaseLayoutProps) => (
    <Provider>
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="relative flex h-screen flex-col overflow-hidden">
                    <TopBar circle={circle} isDefaultCircle={isDefaultCircle} />
                    <div className="flex flex-1 flex-row">
                        <div className={`relative flex min-w-[400px] flex-1`}>{children}</div>
                        <Map mapboxKey={serverConfig?.mapboxKey ?? ""} />
                    </div>
                    <Toaster />
                    <Authenticator />
                </main>
            </body>
        </html>
    </Provider>
);

export default BaseLayout;