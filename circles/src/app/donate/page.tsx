"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";

const DONATION_AMOUNTS = [5, 10, 25, 50, 100] as const;
const MIN_DONATION_AMOUNT = 1;
const MAX_DONATION_AMOUNT = 10000;

function DonateContent() {
    const searchParams = useSearchParams();
    const [selectedAmount, setSelectedAmount] = useState<number | null>(DONATION_AMOUNTS[2]);
    const [customAmount, setCustomAmount] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wasCanceled = searchParams.get("canceled") === "1";
    const customAmountValue = customAmount === "" ? null : Number(customAmount);
    const hasCustomAmount = customAmount.trim() !== "";
    const donationAmount = hasCustomAmount ? customAmountValue : selectedAmount;

    function getValidationError() {
        if (donationAmount === null || donationAmount === undefined || Number.isNaN(donationAmount)) {
            return "Please choose a donation amount in whole euros.";
        }

        if (!Number.isInteger(donationAmount)) {
            return "Please enter a whole number of euros.";
        }

        if (donationAmount < MIN_DONATION_AMOUNT || donationAmount > MAX_DONATION_AMOUNT) {
            return `Please enter an amount between EUR ${MIN_DONATION_AMOUNT} and EUR ${MAX_DONATION_AMOUNT}.`;
        }

        return null;
    }

    async function startDonation() {
        if (isLoading) {
            return;
        }

        const validationError = getValidationError();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/stripe/create-donation-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ amount: donationAmount }),
            });

            const data = await response.json();

            if (!response.ok || !data?.url) {
                throw new Error(data?.error || "Failed to start donation checkout");
            }

            window.location.href = data.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start donation checkout");
            setIsLoading(false);
        }
    }

    return (
        <div className="relative overflow-hidden bg-kam-hero-yellow">
            <div
                className="pointer-events-none absolute -left-[80px] -top-[60px] h-[300px] w-[300px] rotate-12 transform opacity-45
                  sm:-left-[90px] sm:-top-[70px] sm:h-[350px] sm:w-[350px]
                  md:-left-[100px] md:-top-[80px] md:h-[400px] md:w-[400px]"
            >
                <Image src="/images/flower-bg.png" alt="" fill className="object-contain" aria-hidden="true" />
            </div>
            <div
                className="pointer-events-none absolute -bottom-[60px] -right-[80px] h-[300px] w-[300px] -rotate-12 transform opacity-45
                  sm:-bottom-[70px] sm:-right-[90px] sm:h-[350px] sm:w-[350px]
                  md:-bottom-[80px] md:-right-[100px] md:h-[400px] md:w-[400px]"
            >
                <Image src="/images/flower-bg.png" alt="" fill className="object-contain" aria-hidden="true" />
            </div>
            <div className="container relative z-10 py-16 sm:py-20">
                <div className="mx-auto max-w-3xl rounded-[32px] border border-white/40 bg-white p-8 shadow-[0_30px_90px_rgba(123,74,0,0.18)] sm:p-10">
                    <div className="max-w-2xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-kam-orange">Support Kamooni</p>
                        <h1 className="mt-4 text-4xl font-bold tracking-tight text-kam-gray-dark sm:text-5xl">
                            Make a one-off donation
                        </h1>
                        <p className="mt-5 text-lg leading-8 text-kam-gray-dark/80">
                            This page is for public one-off donations to support Kamooni&apos;s shared community
                            infrastructure. It is separate from the monthly and yearly supporter membership flow.
                        </p>
                    </div>

                    <div className="mt-10 rounded-3xl border border-black/10 bg-white p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <h2 className="text-xl font-semibold text-kam-gray-dark">Choose an amount</h2>
                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                            {DONATION_AMOUNTS.map((amount) => {
                                const isSelected = !hasCustomAmount && selectedAmount === amount;

                                return (
                                    <button
                                        key={amount}
                                        type="button"
                                        className={`rounded-2xl border px-4 py-5 text-lg font-semibold transition-colors ${
                                            isSelected
                                                ? "border-[hsl(var(--button-primary-hover))] bg-[hsl(var(--button-primary))] text-white shadow-[0_10px_24px_rgba(27,94,62,0.22)]"
                                                : "border-black/10 bg-white text-kam-gray-dark hover:border-kam-orange/50 hover:bg-kam-hero-yellow/15"
                                        }`}
                                        onClick={() => {
                                            setSelectedAmount(amount);
                                            setCustomAmount("");
                                            setError(null);
                                        }}
                                        disabled={isLoading}
                                    >
                                        EUR {amount}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-5 max-w-sm">
                            <label htmlFor="own-amount" className="mb-2 block text-sm font-medium text-kam-gray-dark">
                                Own amount
                            </label>
                            <input
                                id="own-amount"
                                type="number"
                                inputMode="numeric"
                                min={MIN_DONATION_AMOUNT}
                                max={MAX_DONATION_AMOUNT}
                                step={1}
                                placeholder="Enter whole euros"
                                value={customAmount}
                                onChange={(event) => {
                                    setCustomAmount(event.target.value);
                                    if (event.target.value.trim() !== "") {
                                        setSelectedAmount(null);
                                    }
                                    setError(null);
                                }}
                                disabled={isLoading}
                                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base text-kam-gray-dark outline-none transition-colors focus:border-kam-orange"
                            />
                            <p className="mt-2 text-sm text-kam-gray-dark/70">
                                Enter a whole euro amount between EUR {MIN_DONATION_AMOUNT} and EUR {MAX_DONATION_AMOUNT}.
                            </p>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Button size="lg" className="sm:min-w-[220px]" onClick={startDonation} disabled={isLoading}>
                                {isLoading
                                    ? "Redirecting to Stripe..."
                                    : `Donate EUR ${donationAmount ?? DONATION_AMOUNTS[2]}`}
                            </Button>
                            <p className="text-sm text-kam-gray-dark/70">
                                Secure checkout is handled by Stripe. No Kamooni account is required.
                            </p>
                        </div>

                        {wasCanceled && !error && (
                            <p className="mt-4 text-sm font-medium text-kam-gray-dark/80">
                                Donation checkout was canceled. You can choose an amount and try again.
                            </p>
                        )}

                        {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
                    </div>

                    <div className="mt-8 space-y-4 text-sm leading-7 text-kam-gray-dark/80">
                        <p>
                            Donations help fund hosting, maintenance, and the ongoing development of a community-run,
                            open-source platform without ads or corporate surveillance.
                        </p>
                        <p>
                            Looking for the support overview instead? Visit{" "}
                            <Link href="/donations" className="font-semibold text-kam-orange underline-offset-4 hover:underline">
                                the Kamooni donations page
                            </Link>
                            .
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DonatePage() {
    return (
        <Suspense
            fallback={
                <div className="relative overflow-hidden bg-kam-hero-yellow">
                    <div
                        className="pointer-events-none absolute -left-[80px] -top-[60px] h-[300px] w-[300px] rotate-12 transform opacity-45
                          sm:-left-[90px] sm:-top-[70px] sm:h-[350px] sm:w-[350px]
                          md:-left-[100px] md:-top-[80px] md:h-[400px] md:w-[400px]"
                    >
                        <Image src="/images/flower-bg.png" alt="" fill className="object-contain" aria-hidden="true" />
                    </div>
                    <div
                        className="pointer-events-none absolute -bottom-[60px] -right-[80px] h-[300px] w-[300px] -rotate-12 transform opacity-45
                          sm:-bottom-[70px] sm:-right-[90px] sm:h-[350px] sm:w-[350px]
                          md:-bottom-[80px] md:-right-[100px] md:h-[400px] md:w-[400px]"
                    >
                        <Image src="/images/flower-bg.png" alt="" fill className="object-contain" aria-hidden="true" />
                    </div>
                    <div className="container relative z-10 py-16 sm:py-20">
                        <div className="mx-auto max-w-3xl rounded-[32px] border border-white/40 bg-white p-8 shadow-[0_30px_90px_rgba(123,74,0,0.18)] sm:p-10">
                            <div className="max-w-2xl">
                                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-kam-orange">Support Kamooni</p>
                                <h1 className="mt-4 text-4xl font-bold tracking-tight text-kam-gray-dark sm:text-5xl">
                                    Make a one-off donation
                                </h1>
                                <p className="mt-5 text-lg leading-8 text-kam-gray-dark/80">
                                    Loading donation options...
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            }
        >
            <DonateContent />
        </Suspense>
    );
}
