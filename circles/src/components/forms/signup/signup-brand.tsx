import Image from "next/image";

export function SignupBrand() {
    return (
        <div className="inline-flex max-w-full items-center gap-2.5 rounded-xl bg-kam-gray-dark px-3 py-2">
            <Image
                src="/images/landing/kamooni-emblem-yellow.png"
                alt=""
                width={40}
                height={40}
                priority
                className="h-8 w-8 shrink-0 object-contain"
            />
            <Image
                src="/images/landing/kamooni-wordmark-yellow.png"
                alt="Kamooni"
                width={180}
                height={38}
                priority
                className="h-auto w-32 max-w-[55vw] object-contain"
            />
        </div>
    );
}
