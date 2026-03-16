"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export default function OnboardingCompleteAnimation() {
  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-10">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{
          scale: [0.4, 1.05, 1],
          opacity: 1,
        }}
        transition={{
          duration: 1.2,
          ease: "easeOut",
        }}
      >
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 2.4,
            ease: "easeInOut",
          }}
        >
          <Image
            src="/images/kamooni-logo.png"
            alt="Kamooni"
            width={140}
            height={140}
            priority
          />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.9,
          duration: 0.6,
        }}
        className="text-center"
      >
        <h2 className="text-xl font-semibold">Welcome to Kamooni</h2>
        <p className="mt-2 text-muted-foreground">Your profile is ready.</p>
      </motion.div>
    </div>
  );
}
