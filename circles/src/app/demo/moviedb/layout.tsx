import { Wix_Madefor_Display, Libre_Franklin, Inter } from "next/font/google";
import "@app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Provider } from "jotai";

const inter = Inter({ subsets: ["latin"] });
const wix = Wix_Madefor_Display({ subsets: ["latin"], variable: "--font-wix-display" });
const libre = Libre_Franklin({ subsets: ["latin"], variable: "--font-libre-franklin" });

type BaseLayoutProps = {
    children: React.ReactNode;
};

const BaseLayout = ({ children }: BaseLayoutProps) => (
    <Provider>
        <html lang="en" className={`${wix.variable} ${libre.variable}`}>
            <body className={inter.className}>
                <main className="relative flex flex-col md:flex-row">{children}</main>
            </body>
        </html>
    </Provider>
);

export default BaseLayout;
