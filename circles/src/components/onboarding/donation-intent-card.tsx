"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUPPORTER_OPTIONS = [
  { amount: "1", label: "Seed Supporter" },
  { amount: "2", label: "Community Supporter" },
  { amount: "5", label: "Sustaining Supporter" },
  { amount: "10", label: "Founding Supporter" },
] as const;

type DonationIntentValue = {
  amount: string | null;
  customAmount: string;
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

  const chooseLater = () => {
    onChange({
      amount: null,
      customAmount: "",
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
    value.later || value.amount !== null || value.customAmount.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="rounded-[24px] border border-white/70 bg-white/70 p-6 shadow-[0_10px_35px_rgba(123,81,24,0.08)]">
        <h2 className="font-[family-name:var(--font-noto-serif)] text-2xl text-kam-gray-dark sm:text-3xl">
          You&apos;re ready to start using Peerify.
        </h2>

        <p className="mt-4 text-sm leading-6 text-kam-gray-dark/75 sm:text-base">
          Peerify is community-supported. Would you consider becoming a Founding
          Supporter from <span className="font-semibold">€1/month</span>?
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-kam-gray-dark sm:text-lg">
            Choose the level that feels right for you
          </h3>

          <p className="mt-2 text-sm text-kam-gray-dark/62">
            This is optional. You can support now or continue and decide later.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#9d5a21]/80">
            Monthly support
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORTER_OPTIONS.map((option) => {
              const selected = value.amount === option.amount;

              return (
                <button
                  key={option.amount}
                  type="button"
                  onClick={() => selectAmount(option.amount)}
                  className={cn(
                    "min-h-[72px] rounded-[20px] border px-4 py-3 text-left transition-colors",
                    selected
                      ? "border-[#c77733] bg-[#c77733] text-white"
                      : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#c77733]/60"
                  )}
                >
                  <div className="text-base font-medium">€{option.amount}/month</div>
                  <div className="mt-1 text-sm opacity-90">{option.label}</div>
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
              <div className="text-base font-medium">Own amount</div>
              <div className="mt-1 text-sm opacity-90">Custom Supporter</div>
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

        <button
          type="button"
          onClick={chooseLater}
          className={cn(
            "min-h-[64px] w-full rounded-[20px] border px-4 py-3 text-left text-sm font-medium transition-colors sm:text-base",
            value.later
              ? "border-[#8b6f47] bg-[#8b6f47] text-white"
              : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#8b6f47]/60"
          )}
        >
          Maybe later
        </button>

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
            {value.later ? "Continue" : "Become a Founding Supporter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
