import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function Loading() {
  return (
    <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
