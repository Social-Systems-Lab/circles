// page.tsx - Movie Database Demo
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Star } from "lucide-react";
import { AppManifest, vibe } from "../sdk";

interface MovieType {
    id: number;
    title: string;
    year: number;
    image: string;
    description: string;
    director: string;
    rating?: number;
}

const movies: MovieType[] = [
    {
        id: 1,
        title: "The Shawshank Redemption",
        year: 1994,
        image: "/images/demo/movie2.jpg",
        description:
            "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
        director: "Frank Darabont",
    },
    {
        id: 2,
        title: "The Matrix",
        year: 1999,
        image: "/images/demo/movie5.jpg",
        description:
            "A computer programmer discovers that reality as he knows it is a simulation created by machines, and joins a rebellion to break free.",
        director: "The Wachowskis",
    },
    {
        id: 3,
        title: "Pulp Fiction",
        year: 1994,
        image: "/images/demo/movie4.jpg",
        description:
            "The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.",
        director: "Quentin Tarantino",
    },
    {
        id: 4,
        title: "Her",
        year: 2013,
        image: "/images/demo/movie6.jpg",
        description:
            "In a near future, a lonely writer develops an unlikely relationship with an operating system designed to meet his every need.",
        director: "Spike Jonze",
    },
    {
        id: 5,
        title: "The Thing",
        year: 1982,
        image: "/images/demo/movie7.jpg",
        description:
            "A research team in Antarctica is hunted by a shape-shifting alien that assumes the appearance of its victims.",
        director: "John Carpenter",
    },
    {
        id: 6,
        title: "The Dark Knight Rises",
        year: 2012,
        image: "/images/demo/movie3.jpg",
        description:
            "Eight years after the Joker's reign of anarchy, Batman must return to defend Gotham City against the enigmatic jewel thief Catwoman and the ruthless mercenary Bane.",
        director: "Christopher Nolan",
    },
    {
        id: 7,
        title: "Inception",
        year: 2010,
        image: "/images/demo/movie1.jpg",
        description:
            "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
        director: "Christopher Nolan",
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

function FeaturedMovie({ movie }: { movie: MovieType }) {
    return (
        <div className="relative mb-12 h-[70vh] min-h-[600px] w-full overflow-hidden rounded-xl">
            <Image src={movie.image} alt={movie.title} fill className="object-cover brightness-50" priority />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-8">
                <div className="max-w-3xl">
                    <h1 className="mb-2 text-5xl font-bold">{movie.title}</h1>
                    <p className="mb-4 text-xl text-gray-300">
                        {movie.year} • Directed by {movie.director}
                    </p>
                    <p className="mb-6 text-lg text-gray-300">{movie.description}</p>
                    <StarRating movieId={movie.id} initialRating={movie.rating} />
                </div>
            </div>
        </div>
    );
}

function MovieGrid({ movies }: { movies: MovieType[] }) {
    return (
        <div>
            <h2 className="mb-6 text-2xl font-semibold">More Movies</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {movies.map((movie) => (
                    <div key={movie.id} className="group relative overflow-hidden rounded-lg">
                        <div className="aspect-[2/3] w-full">
                            <Image
                                src={movie.image}
                                alt={movie.title}
                                fill
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                            <div className="absolute bottom-0 p-4">
                                <h3 className="mb-1 text-xl font-semibold">{movie.title}</h3>
                                <p className="mb-2 text-sm text-gray-300">{movie.year}</p>
                                <StarRating movieId={movie.id} initialRating={movie.rating} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const appManifest: AppManifest = {
    id: "movie-db",
    name: "Movie Database",
    description: "Access to user profile and write access to ratings",
    permissions: ["Read Name", "Read Ratings", "Write Ratings"],
    pictureUrl: "http://192.168.10.204:3000/images/demo/moviedblogo.jpg",
};

export default function Home() {
    const [response, setResponse] = useState<string>("");

    useEffect(() => {
        setResponse("vibe enabled: " + vibe.enabled());
        if (!vibe.enabled()) return;

        setResponse("Initializing app...");

        let unsubscribe = vibe.init(appManifest, (state) => {
            console.log("App state", state);
            setResponse(JSON.stringify(state));
        });

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    return (
        <div className="min-h-screen bg-black text-white">
            {/* <div className="absolute top-0 z-[100] w-full text-white">
                <pre>{response}</pre>
            </div> */}
            <main className="container mx-auto px-4 py-8">
                <FeaturedMovie movie={movies[0]} />
                <MovieGrid movies={movies.slice(1)} />
            </main>
        </div>
    );
}
