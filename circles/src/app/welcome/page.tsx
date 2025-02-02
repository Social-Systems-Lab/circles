// main app home aggregate feed
import LandingPage from "@/components/layout/landing-page";

export default async function Welcome() {
    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 mt-16 flex max-w-[1100px] flex-1 flex-col items-center justify-center">
                <LandingPage />
            </div>
        </div>
    );
}
