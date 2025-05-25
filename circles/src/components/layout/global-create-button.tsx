"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GlobalCreateDialogContent } from "@/components/global-create/global-create-dialog-content";
import { motion } from "framer-motion";

export function GlobalCreateButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <motion.div
                    className="flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8]"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 * 0.1 }} // Adjusted delay
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full md:h-12 md:w-12"
                        aria-label="Create new"
                    >
                        <Plus className="h-6 w-6 text-[#696969]" />
                    </Button>
                    <motion.span
                        className="mt-[4px] text-[11px] text-[#696969]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.2 + 0.4 * 0.1 }}
                    >
                        Create
                    </motion.span>
                </motion.div>
            </DialogTrigger>
            <DialogContent
                className="z-[110] max-h-[90vh] overflow-y-auto rounded-[15px] bg-white p-0 sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    // Allow closing by clicking outside for now, can be changed if needed
                    // e.preventDefault();
                }}
            >
                <GlobalCreateDialogContent />
            </DialogContent>
        </Dialog>
    );
}

export default GlobalCreateButton;
