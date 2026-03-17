"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DONATION_OPTIONS = ["5", "10", "25", "50", "100+"] as const;

type DonationIntentValue = {
  amount: string | null;
  customAmount: string;
  volunteering: boolean;
  later: boolean;
};

type DonationIntentCardProps = {
  value: DonationIntentValue;
  onChange: (value: DonationIntentValue) => void;
  onContinue: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
};

export default function DonationIntentCard({
  value,
  onChange,
  onContinue,
  onBack,
  isSubmitting = false,
}: DonationIntentCardProps) {
  const selectAmount = (amount: string) => {
    onChange({
      ...value,
      amount,
      customAmount: amount === "other" ? value.customAmount : "",
      later: false,
    });
  };

  const toggleVolunteering = () => {
    onChange({
      ...value,
      volunteering: !value.volunteering,
      later: false,
    });
  };

  const chooseLater = () => {
    onChange({
      amount: null,
      customAmount: "",
      volunteering: false,
      later: true,
    });
  };

  const setCustomAmount = (customAmount: string) => {
    onChange({
      ...value,
      amount: "other",
      customAmount,
      later: false,
    });
  };

  const canContinue =
    value.later ||
    value.volunteering ||
    value.amount !== null ||
    value.customAmount.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="rounded-[24px] border border-white/70 bg-white/70 p-6 shadow-[0_10px_35px_rgba(123,81,24,0.08)]">
        <h2 className="font-[family-name:var(--font-noto-serif)] text-2xl text-kam-gray-dark sm:text-3xl">
          One quick question before you enter Kamooni
        </h2>

        <p className="mt-4 text-sm leading-6 text-kam-gray-dark/75 sm:text-base">
          We plan to introduce a feature that allows members to donate directly
          to projects on Kamooni with zero platform fees.
        </p>

        <p className="mt-3 text-sm leading-6 text-kam-gray-dark/75 sm:text-base">
          There is <span className="font-semibold">no commitment</span>. We&rsquo;re
          simply curious what you might consider contributing each month once
          this becomes available.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-kam-gray-dark sm:text-lg">
            How much might you consider donating monthly to projects through Kamooni?
          </h3>

          <p className="mt-2 text-sm text-kam-gray-dark/62">
            You can also choose volunteering, or decide later.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#9d5a21]/80">
            Monthly donation
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DONATION_OPTIONS.map((option) => {
              const selected = value.amount === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectAmount(option)}
                  className={cn(
                    "min-h-[64px] rounded-[20px] border px-4 py-3 text-left text-base font-medium transition-colors",
                    selected
                      ? "border-[#c77733] bg-[#c77733] text-white"
                      : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#c77733]/60"
                  )}
                >
                  €{option}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => selectAmount("other")}
              className={cn(
                "min-h-[64px] rounded-[20px] border px-4 py-3 text-left text-base font-medium transition-colors",
                value.amount === "other"
                  ? "border-[#c77733] bg-[#c77733] text-white"
                  : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#c77733]/60"
              )}
            >
              Other amount
            </button>
          </div>

          {value.amount === "other" && (
            <div className="max-w-xs">
              <Input
                inputMode="decimal"
                placeholder="Enter amount in €"
                value={value.customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                className="h-12 border-[#d9c7a0] bg-white/80"
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#6f7a34]/90">
            Other ways to contribute
          </p>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={toggleVolunteering}
              className={cn(
                "min-h-[64px] rounded-[20px] border px-4 py-3 text-left text-sm font-medium transition-colors sm:text-base",
                value.volunteering
                  ? "border-[#6f7a34] bg-[#6f7a34] text-white"
                  : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#6f7a34]/60"
              )}
            >
              I will contribute through volunteering
            </button>

            <button
              type="button"
              onClick={chooseLater}
              className={cn(
                "min-h-[64px] rounded-[20px] border px-4 py-3 text-left text-sm font-medium transition-colors sm:text-base",
                value.later
                  ? "border-[#8b6f47] bg-[#8b6f47] text-white"
                  : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#8b6f47]/60"
              )}
            >
              I&apos;ll decide later
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          {onBack && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="h-12 flex-1 border-[#d7bf94] bg-white/80 text-kam-gray-dark"
            >
              Back
            </Button>
          )}

          <Button
            type="button"
            onClick={onContinue}
            disabled={!canContinue || isSubmitting}
            className="h-12 flex-1 bg-[#b65d2c] text-white hover:bg-[#9f5227]"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
