const defaultMaintenanceMessage = "Peerify is being updated. Back online Monday 15 December";

export const metadata = {
    title: "Maintenance | Peerify",
};

export default function HoldingPage() {
    const maintenanceMessage = process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE || defaultMaintenanceMessage;
    return (
        <div className="flex min-h-screen items-center justify-center bg-[#181512] px-6 py-12">
            <div className="w-full max-w-2xl rounded-[28px] border border-[#3b342d] bg-[#f7f2ea] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-10">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#e8720c]">Peerify</p>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#181512] sm:text-4xl">
                    Brief maintenance break
                </h1>
                <p className="mt-5 text-base leading-7 text-[#6b5f52]">{maintenanceMessage}</p>
                <p className="mt-4 text-sm leading-6 text-[#6b5f52]">
                    Peerify is a community-driven music platform for artists, fans, hosts, and supporters. We&apos;ll be back shortly.
                </p>
            </div>
        </div>
    );
}
