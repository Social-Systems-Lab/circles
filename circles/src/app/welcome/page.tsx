// main app home aggregate feed
import LandingPage from "@/components/layout/landing-page";

export default async function Welcome() {
    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="flex max-w-[1100px] flex-1 flex-col items-center justify-center md:mb-4 md:mt-16">
                {/* <div className="mb-4 mt-4 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:mt-16"> */}
                <LandingPage />
            </div>
        </div>
    );
}
