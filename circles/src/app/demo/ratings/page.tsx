"use client";

import { useState, useMemo, useEffect } from "react";
import { Star, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface RatedItem {
    id: number;
    name: string;
    category: "Movie" | "TV Show" | "Book" | "Product";
    rating: number;
    image: string;
}

const ratedItems: RatedItem[] = [
    { id: 1, name: "The Shawshank Redemption", category: "Movie", rating: 5, image: "/images/demo/movie2.jpg" },
    { id: 2, name: "Inception", category: "TV Show", rating: 5, image: "/images/demo/movie1.jpg" },
    { id: 3, name: "Pulp Fiction", category: "Book", rating: 4, image: "/images/demo/movie4.jpg" },
    { id: 4, name: "iPhone 13 Pro", category: "Product", rating: 4, image: "/images/demo/phone2.png" },
    { id: 5, name: "The Matrix", category: "Movie", rating: 4, image: "/images/demo/movie5.png" },
    { id: 6, name: "Game of Thrones", category: "TV Show", rating: 4, image: "/images/demo/movie1.jpg" },
    { id: 7, name: "1984", category: "Book", rating: 5, image: "/images/demo/movie7.jpg" },
    { id: 8, name: "Sony WH-1000XM4", category: "Product", rating: 5, image: "/images/demo/phone3.png" },
    { id: 9, name: "Her", category: "Movie", rating: 5, image: "/images/demo/movie6.jpg" },
    { id: 10, name: "Stranger Things", category: "TV Show", rating: 4, image: "/images/demo/movie1.jpg" },
    { id: 11, name: "The Catcher in the Rye", category: "Book", rating: 3, image: "/images/demo/movie3.jpg" },
    { id: 12, name: "MacBook Pro", category: "Product", rating: 5, image: "/images/demo/phone4.png" },
];

function Header() {
    return (
        <header className="border-b">
            <div className="container mx-auto flex items-center justify-between p-4">
                <p className="text-2xl font-bold">My Ratings</p>
                <nav>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                Top Lists <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuLabel>Categories</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Top Movies</DropdownMenuItem>
                            <DropdownMenuItem>Top TV Shows</DropdownMenuItem>
                            <DropdownMenuItem>Top Books</DropdownMenuItem>
                            <DropdownMenuItem>Top Products</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </nav>
            </div>
        </header>
    );
}

function StarRating({ rating }: { rating: number }) {
    return (
        <div className="flex">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={`h-5 w-5 ${
                        rating >= star ? "fill-yellow-400 text-yellow-400" : "fill-transparent text-gray-300"
                    }`}
                />
            ))}
        </div>
    );
}

function RatingsList({ items, sortBy }: { items: RatedItem[]; sortBy: string }) {
    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            if (sortBy === "rating") return b.rating - a.rating;
            if (sortBy === "name") return a.name.localeCompare(b.name);
            return 0;
        });
    }, [items, sortBy]);

    return (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedItems.map((item) => (
                <Card key={item.id}>
                    <CardContent className="flex items-center p-4">
                        <img src={item.image} alt={item.name} className="mr-4 h-16 w-16 rounded object-cover" />
                        <div>
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-sm text-gray-500">{item.category}</p>
                            <StarRating rating={item.rating} />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function CustomBarChart({
    data,
    dataKey,
    nameKey,
    color,
}: {
    data: any[];
    dataKey: string;
    nameKey: string;
    color: string;
}) {
    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey={nameKey} type="category" width={100} />
                <Tooltip />
                <Bar dataKey={dataKey} fill={color} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function RatingsDistribution({ items }: { items: RatedItem[] }) {
    const distribution = useMemo(() => {
        const dist = [0, 0, 0, 0, 0];
        items.forEach((item) => dist[item.rating - 1]++);
        return [
            { name: "5 Stars", value: dist[4] },
            { name: "4 Stars", value: dist[3] },
            { name: "3 Stars", value: dist[2] },
            { name: "2 Stars", value: dist[1] },
            { name: "1 Star", value: dist[0] },
        ];
    }, [items]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Ratings Distribution</CardTitle>
            </CardHeader>
            <CardContent>
                <CustomBarChart data={distribution} dataKey="value" nameKey="name" color="#facc15" />
            </CardContent>
        </Card>
    );
}

function CategoryBreakdown({ items }: { items: RatedItem[] }) {
    const breakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach((item) => {
            counts[item.category] = (counts[item.category] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [items]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
                <CustomBarChart data={breakdown} dataKey="value" nameKey="name" color="#3b82f6" />
            </CardContent>
        </Card>
    );
}

export default function Home() {
    const [sortBy, setSortBy] = useState("rating");

    useEffect(() => {
        if (window._SSI_ACCOUNT) {
            // request access to the user's name and write access to ratings
            window.requestAccess({
                id: "ratings",
                name: "Ratings",
                description: "Access to user profile and write access to ratings",
                permissions: ["Read Name", "Read Ratings", "Write Ratings"],
                pictureUrl: "http://192.168.10.204:3000/images/demo/ratings.png",
            });
        }
    }, []);

    return (
        <div className="min-h-screen bg-gray-100">
            <Header />
            <main className="container mx-auto p-4">
                <div className="mb-6 flex items-center justify-between">
                    <p className="text-xl font-semibold">Your Rated Items</p>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="rating">Sort by Rating</SelectItem>
                            <SelectItem value="name">Sort by Name</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Tabs defaultValue="all" className="mb-6">
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="movies">Movies</TabsTrigger>
                        <TabsTrigger value="tvshows">TV Shows</TabsTrigger>
                        <TabsTrigger value="books">Books</TabsTrigger>
                        <TabsTrigger value="products">Products</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                        <RatingsList items={ratedItems} sortBy={sortBy} />
                    </TabsContent>
                    <TabsContent value="movies">
                        <RatingsList items={ratedItems.filter((item) => item.category === "Movie")} sortBy={sortBy} />
                    </TabsContent>
                    <TabsContent value="tvshows">
                        <RatingsList items={ratedItems.filter((item) => item.category === "TV Show")} sortBy={sortBy} />
                    </TabsContent>
                    <TabsContent value="books">
                        <RatingsList items={ratedItems.filter((item) => item.category === "Book")} sortBy={sortBy} />
                    </TabsContent>
                    <TabsContent value="products">
                        <RatingsList items={ratedItems.filter((item) => item.category === "Product")} sortBy={sortBy} />
                    </TabsContent>
                </Tabs>
                <div className="grid gap-6 md:grid-cols-2">
                    <RatingsDistribution items={ratedItems} />
                    <CategoryBreakdown items={ratedItems} />
                </div>
            </main>
        </div>
    );
}
