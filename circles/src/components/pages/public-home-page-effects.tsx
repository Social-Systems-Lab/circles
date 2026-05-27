"use client";

import { useEffect } from "react";

export default function PublicHomePageEffects() {
    useEffect(() => {
        const root = document.querySelector<HTMLElement>(".kam-home");
        if (!root) {
            return;
        }

        const heroBackground = root.querySelector<HTMLElement>(".hero-bg");
        const heroImage = new window.Image();
        const heroImageUrl = "/images/landing/hero-illustration.png";

        const handleHeroImageLoaded = () => {
            heroBackground?.classList.add("is-loaded");
        };

        heroImage.addEventListener("load", handleHeroImageLoaded);
        heroImage.src = heroImageUrl;
        if (heroImage.complete) {
            handleHeroImageLoaded();
        }

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const revealElements = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
        const revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("in");
                        revealObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12 },
        );

        revealElements.forEach((element, index) => {
            element.style.transitionDelay = `${(index % 4) * 70}ms`;
            revealObserver.observe(element);
        });

        const statsElements = Array.from(root.querySelectorAll<HTMLElement>(".stats"));
        const animationFrames = new Set<number>();
        const timeouts = new Set<number>();

        const setFinalStatValues = (statsElement: HTMLElement) => {
            statsElement.querySelectorAll<HTMLElement>("[data-target]").forEach((numElement) => {
                const target = Number.parseInt(numElement.dataset.target || "0", 10);
                numElement.textContent = target.toLocaleString();
            });
        };

        const animateNumber = (element: HTMLElement, target: number, duration: number) => {
            const start = performance.now();
            const startValue = 0;

            const step = (now: number) => {
                const elapsed = now - start;
                const t = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - t, 5);
                const value = Math.round(startValue + (target - startValue) * eased);

                element.textContent = value.toLocaleString();

                if (t < 1) {
                    const frame = window.requestAnimationFrame(step);
                    animationFrames.add(frame);
                }
            };

            const frame = window.requestAnimationFrame(step);
            animationFrames.add(frame);
        };

        const statsObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const statsElement = entry.target as HTMLElement;

                    if (!entry.isIntersecting || statsElement.dataset.animated) {
                        return;
                    }

                    statsElement.dataset.animated = "true";

                    if (prefersReducedMotion) {
                        setFinalStatValues(statsElement);
                    } else {
                        statsElement.querySelectorAll<HTMLElement>("[data-target]").forEach((numElement, index) => {
                            const target = Number.parseInt(numElement.dataset.target || "0", 10);
                            const timeout = window.setTimeout(() => animateNumber(numElement, target, 2100), index * 150);
                            timeouts.add(timeout);
                        });
                    }

                    statsObserver.unobserve(statsElement);
                });
            },
            { threshold: 0.4 },
        );

        statsElements.forEach((element) => {
            if (prefersReducedMotion) {
                setFinalStatValues(element);
            } else {
                statsObserver.observe(element);
            }
        });

        return () => {
            heroImage.removeEventListener("load", handleHeroImageLoaded);
            revealObserver.disconnect();
            statsObserver.disconnect();
            animationFrames.forEach((frame) => window.cancelAnimationFrame(frame));
            timeouts.forEach((timeout) => window.clearTimeout(timeout));
        };
    }, []);

    return null;
}
