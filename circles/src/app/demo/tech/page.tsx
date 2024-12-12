"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, ShoppingCart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProductType {
    id: number;
    name: string;
    brand: string;
    image: string;
    description: string;
    price: number;
    rating?: number;
}

const products: ProductType[] = [
    {
        id: 1,
        name: "iPhone 13 Pro",
        brand: "Apple",
        image: "/images/demo/phone1.jpg",
        description: "A15 Bionic chip, Pro camera system, Super Retina XDR display with ProMotion, and 5G capability.",
        price: 999,
    },
    {
        id: 2,
        name: "Galaxy S21 Ultra",
        brand: "Samsung",
        image: "/images/demo/phone2.png",
        description: "Exynos 2100 processor, 108MP camera, Dynamic AMOLED 2X display, and 5G support.",
        price: 1199,
    },
    {
        id: 3,
        name: "Pixel 6 Pro",
        brand: "Google",
        image: "/images/demo/phone3.png",
        description: "Google Tensor chip, 50MP main camera, 120Hz LTPO OLED display, and 5G connectivity.",
        price: 899,
    },
    {
        id: 4,
        name: "OnePlus 9 Pro",
        brand: "OnePlus",
        image: "/images/demo/phone4.png",
        description: "Snapdragon 888, Hasselblad camera, Fluid AMOLED display with 120Hz, and 5G capability.",
        price: 969,
    },
    {
        id: 5,
        name: "Xperia 1 III",
        brand: "Sony",
        image: "/images/demo/phone5.png",
        description: "Snapdragon 888, Triple lens camera, 4K HDR OLED 120Hz display, and 5G support.",
        price: 1299,
    },
    {
        id: 6,
        name: "Mi 11",
        brand: "Xiaomi",
        image: "/images/demo/phone2.png",
        description: "Snapdragon 888, 108MP camera, 120Hz AMOLED display, and 5G connectivity.",
        price: 749,
    },
    {
        id: 7,
        name: "ROG Phone 5",
        brand: "Asus",
        image: "/images/demo/phone3.png",
        description: "Snapdragon 888, 144Hz AMOLED display, 6000mAh battery, and 5G capability.",
        price: 999,
    },
];

function StarRating({ movieId, initialRating }: { movieId: number; initialRating?: number }) {
    const [rating, setRating] = useState<number | undefined>(initialRating);
    const [hover, setHover] = useState<number | undefined>(undefined);

    const handleRate = (star: number) => {
        setRating(star);

        // Send a request to the SSI app to write the rating
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(
                JSON.stringify({
                    type: "WriteRequest",
                    data: {
                        action: "Write",
                        object: {
                            type: "Rating",
                            movieId,
                            rating: star,
                        },
                    },
                }),
            );
        }
    };

    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    className="transition-colors"
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(undefined)}
                    onClick={() => handleRate(star)}
                >
                    <Star
                        className={`h-6 w-6 ${
                            (hover || rating || 0) >= star
                                ? "fill-yellow-400 text-yellow-400"
                                : "fill-transparent text-gray-400"
                        }`}
                    />
                </button>
            ))}
        </div>
    );
}

function Header() {
    return (
        <header className="border-b">
            <div className="container mx-auto flex items-center justify-between p-4">
                <Link href="/" className="text-2xl font-bold text-gray-900">
                    TechStore
                </Link>
                <nav className="hidden space-x-4 md:flex">
                    <Link href="#" className="text-gray-600 hover:text-gray-900">
                        Phones
                    </Link>
                    <Link href="#" className="text-gray-600 hover:text-gray-900">
                        Tablets
                    </Link>
                    <Link href="#" className="text-gray-600 hover:text-gray-900">
                        Laptops
                    </Link>
                    <Link href="#" className="text-gray-600 hover:text-gray-900">
                        Accessories
                    </Link>
                </nav>
                <div className="flex items-center space-x-4">
                    <div className="hidden md:block">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                            <Input type="search" placeholder="Search products" className="pl-8" />
                        </div>
                    </div>
                    <Button variant="outline">
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Cart (0)
                    </Button>
                </div>
            </div>
        </header>
    );
}

function Footer() {
    return (
        <footer className="border-t bg-gray-50">
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
                    <div>
                        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-900">Company</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    About Us
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Careers
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Press
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-900">Support</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Help Center
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Contact Us
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Returns
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-900">Legal</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-600 hover:text-gray-900">
                                    Cookie Policy
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-900">Newsletter</h3>
                        <p className="mb-4 text-sm text-gray-600">
                            Subscribe to our newsletter for the latest updates and offers.
                        </p>
                        <form className="flex">
                            <Input type="email" placeholder="Your email" className="rounded-r-none" />
                            <Button type="submit" className="rounded-l-none">
                                Subscribe
                            </Button>
                        </form>
                    </div>
                </div>
                <div className="mt-8 border-t pt-8 text-center text-sm text-gray-600">
                    © 2023 TechStore. All rights reserved.
                </div>
            </div>
        </footer>
    );
}

function FeaturedProduct({ product }: { product: ProductType }) {
    return (
        <div className="relative mb-12 overflow-hidden rounded-xl bg-gray-100">
            <div className="container mx-auto flex flex-col items-center justify-between gap-8 px-4 py-12 lg:flex-row">
                <div className="max-w-2xl">
                    <h1 className="mb-2 text-4xl font-bold text-gray-900">{product.name}</h1>
                    <p className="mb-4 text-xl text-gray-600">
                        {product.brand} • ${product.price}
                    </p>
                    <p className="mb-6 text-lg text-gray-700">{product.description}</p>
                    <div className="flex items-center gap-4">
                        <StarRating productId={product.id} initialRating={product.rating} />
                        <Button>
                            <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                        </Button>
                    </div>
                </div>
                <div className="w-full max-w-md">
                    <Image
                        src={product.image}
                        alt={product.name}
                        width={400}
                        height={533}
                        className="mx-auto object-cover"
                        priority
                    />
                </div>
            </div>
        </div>
    );
}

function ProductGrid({ products }: { products: ProductType[] }) {
    return (
        <div className="container mx-auto px-4">
            <h2 className="mb-6 text-2xl font-semibold text-gray-900">More Products</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                    <div
                        key={product.id}
                        className="group relative overflow-hidden rounded-lg bg-white shadow-md transition-shadow hover:shadow-lg"
                    >
                        <div className="aspect-[3/4] w-full">
                            <Image
                                src={product.image}
                                alt={product.name}
                                fill
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                        </div>
                        <div className="p-4">
                            <h3 className="mb-1 text-lg font-semibold text-gray-900">{product.name}</h3>
                            <p className="mb-2 text-sm text-gray-600">{product.brand}</p>
                            <p className="mb-2 text-lg font-bold text-gray-900">${product.price}</p>
                            <StarRating productId={product.id} initialRating={product.rating} />
                            <Button className="mt-4 w-full">
                                <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Home() {
    useEffect(() => {
        if (window._SSI_ACCOUNT) {
            // request access to the user's name and write access to ratings
            window.requestAccess({
                id: "tech-store",
                name: "TechStore",
                description: "Access to user profile and write access to ratings",
                permissions: ["Read Name", "Read Ratings", "Write Ratings"],
                pictureUrl: "http://192.168.10.204:3000/images/demo/techstorelogo.png",
            });
        }
    }, []);

    return (
        <div className="flex min-h-screen flex-col bg-white text-gray-900">
            <Header />
            <main className="flex-grow">
                <FeaturedProduct product={products[0]} />
                <ProductGrid products={products.slice(1)} />
            </main>
            <Footer />
        </div>
    );
}
