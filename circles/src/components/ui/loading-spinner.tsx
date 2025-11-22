"use client";

import { motion } from "framer-motion";

export const LoadingSpinner = () => {
  // Golden yellow palette matching the logo
  const colorPrimary = "#FBBF24"; // Amber-400
  const colorSecondary = "#F59E0B"; // Amber-500
  const colorTertiary = "#D97706"; // Amber-600

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative flex items-center justify-center">
        {/* Outer Ring */}
        <motion.div
          className="absolute h-16 w-16 rounded-full border-4 border-t-transparent border-r-transparent border-b-transparent border-l-transparent"
          style={{ 
            borderTopColor: colorPrimary,
            borderBottomColor: colorPrimary,
            opacity: 0.4
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 2,
            ease: "linear",
            repeat: Infinity,
          }}
        />
        
        {/* Middle Ring */}
        <motion.div
          className="absolute h-12 w-12 rounded-full border-4 border-t-transparent border-r-transparent border-b-transparent border-l-transparent"
          style={{ 
            borderTopColor: colorSecondary,
            borderBottomColor: colorSecondary,
            opacity: 0.6
          }}
          animate={{ rotate: -360 }}
          transition={{
            duration: 3,
            ease: "linear",
            repeat: Infinity,
          }}
        />

        {/* Inner Circle (Pulsing) */}
        <motion.div
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: colorTertiary }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.5,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      </div>
    </div>
  );
};
