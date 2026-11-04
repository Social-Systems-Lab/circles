export default function ChatLoading() {
    return (
        <div
            className="flex h-screen items-center justify-center text-sm text-gray-500"
            role="status"
            aria-live="polite"
        >
            Loading messages…
        </div>
    );
}
