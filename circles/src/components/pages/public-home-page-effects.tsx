"use client";

import { useEffect } from "react";

export default function PublicHomePageEffects() {
    useEffect(() => {
        const root = document.querySelector<HTMLElement>(".kam-home");
        if (!root) {
            return;
        }

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

        return () => {
            revealObserver.disconnect();
        };
    }, []);

    return null;
}
