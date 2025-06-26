import type { Config } from "tailwindcss";
const { fontFamily } = require("tailwindcss/defaultTheme");

const config = {
    mode: "jit",
    darkMode: ["class"],
    content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
    prefix: "",
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            fontFamily: {
                sans: ["Montserrat", "sans-serif"],
                serif: ["Noto Serif", "serif"],
                bebas: ["var(--font-bebas-neue)"],
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                primaryLight: "hsl(var(--primary-light))",
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                "kam-yellow": "#f4b740",
                "kam-red": "#e57373", // Original red, keeping for reference
                "kam-green": "#819977", // Original green, keeping for reference
                "kam-beige": "#e0d6b3",
                "kam-gray": {
                    light: "#eeeede",
                    medium: "#d1d5db",
                    dark: "#4b5563",
                    DEFAULT: "#4b5563",
                },
                "kam-hero-yellow": "#fdcc5f",
                "kam-alt-bg": "#f4efb7", // This was changed to kam-hero-yellow in page.tsx
                "kam-postcard-green": "#5c7a52",
                "kam-button-red-orange": "#f47566", // New button color
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "accordion-down": {
                    from: {
                        height: "0",
                    },
                    to: {
                        height: "var(--radix-accordion-content-height)",
                    },
                },
                "accordion-up": {
                    from: {
                        height: "var(--radix-accordion-content-height)",
                    },
                    to: {
                        height: "0",
                    },
                },
                "slide-in": {
                    "0%": {
                        opacity: "0",
                        transform: "translateX(75%)",
                    },
                    "100%": {
                        opacity: "1",
                        transform: "translateX(0)",
                    },
                },
                "slide-up": {
                    "0%": {
                        transform: "translateY(0)",
                    },
                    "100%": {
                        transform: "translateY(-36px)",
                    },
                },
                wiggle: {
                    "0%, 100%": {
                        transform: "rotate(-8deg)",
                    },
                    "50%": {
                        transform: "rotate(8deg)",
                    },
                },
                float: {
                    "0%, 100%": {
                        transform: "translateY(0)",
                    },
                    "50%": {
                        transform: "translateY(-4px)",
                    },
                },
                pulse: {
                    "0%": {
                        transform: "scale(0.85)",
                        boxShadow: "0 0 0 0 rgba(178, 27, 186, 0.7)",
                    },
                    "96%": {
                        transform: "scale(0.9)",
                        boxShadow: "0 0 0 10px rgba(0, 0, 0, 0)",
                    },
                    "100%": {
                        transform: "scale(0.85)",
                        boxShadow: "0 0 0 0 rgba(0, 0, 0, 0)",
                    },
                },
                ripple: {
                    "0%": {
                        opacity: "1",
                        transform: "scale3d(0.75, 0.75, 1)",
                    },
                    "100%": {
                        opacity: "0",
                        transform: "scale3d(1.35, 1.35, 1)",
                    },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "slide-in": "slide-in 0.5s ease-in-out",
                "slide-up": "slide-up 0.5s ease-in-out",
                wiggle: "wiggle 4s ease-in-out infinite",
                float: "float 3s ease-in-out infinite",
                "pulse-slow": "pulse 3s ease-in-out infinite",
                ripple: "ripple 4s cubic-bezier(0.65, 0, 0.34, 1) infinite",
                "ripple-delay": "ripple 4s cubic-bezier(0.65, 0, 0.34, 1) infinite 1.5s",
                "ripple-delay-2": "ripple 4s cubic-bezier(0.65, 0, 0.34, 1) infinite 3s",
            },
        },
    },
    plugins: [
        require("tailwindcss-animate"),
        function ({ addUtilities }: any) {
            addUtilities({
                ".clip-hexagon": {
                    clipPath: "polygon(50% 0%, 90% 25%, 90% 75%, 50% 100%, 10% 75%, 10% 25%)",
                },
                ".clip-pennant": {
                    clipPath: "polygon(10% 10%, 90% 50%, 10% 90%)",
                },
                ".clip-cause-80": {
                    clipPath: "path('M 0,12 q 40,-20 80,0 q 0,40 -40,68 q -40,-24 -40,-68 z')",
                },
                ".clip-cause-90": {
                    clipPath: "path('M 0,13.5 q 45,-22.5 90,0 q 0,45 -45,76.5 q -45,-27 -45,-76.5 z')",
                },
                ".clip-cause-100": {
                    clipPath: "path('M 0,15 q 50,-25 100,0 q 0,50 -50,85 q -50,-30 -50,-85 z')",
                },
                ".clip-flag-80": {
                    clipPath: "path('M 0 8 Q 20 0, 40 8 T 80 8 L 80 72 Q 60 80, 40 72 T 0 72 Z')",
                },
                ".clip-flag-200": {
                    clipPath: "path('M 0 10% Q 25% 0%, 50% 10% T 100% 10% L 100% 90% Q 75% 100%, 50% 90% T 0 90% Z')",
                },
            });
        },
    ],
} satisfies Config;

export default config;
