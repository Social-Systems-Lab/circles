"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MdOutlineContactSupport } from "react-icons/md";
import Image from "next/image";

export const SupportButton = () => {
    return (
        <div className="fixed bottom-[150px] right-6 z-40 md:bottom-[90px]">
            <Popover>
                <PopoverTrigger asChild>
                    <div className="z-[50] cursor-pointer rounded-full bg-[#2d37c2] p-[2px] hover:bg-[#304678e6]">
                        <MdOutlineContactSupport className="m-[4px] text-white group-hover:text-white" size="30px" />
                    </div>

                    {/* <Button className="h-10 w-10 rounded-full bg-[#66a5ff] shadow-md" aria-label="Support">
                        <MdOutlineContactSupport className="h-6 w-6 text-white" />
                    </Button> */}
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-4">
                        <div className="text-lg font-medium">Need help?</div>
                        <p className="text-sm text-muted-foreground">
                            If you need help or want to give feedback, you can contact us via WhatsApp.
                        </p>
                        <div className="rounded-md border bg-gray-50 p-4">
                            {/* Placeholder for QR code - will be added later */}
                            <div className="mb-2 flex w-full items-center justify-center">
                                <Image
                                    src="/images/whatsapp-support-qr.png"
                                    width={246}
                                    height={243}
                                    alt="WhatsApp QR Code"
                                />
                            </div>
                            <p className="text-center text-xs text-muted-foreground">
                                Scan this code or click the link below
                            </p>
                        </div>
                        <a
                            href="https://chat.whatsapp.com/HxM0bXeFpxA6XsxkzOpoeE"
                            className="block w-full text-center text-sm text-[#66a5ff] hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Join WhatsApp Support Chat
                        </a>
                        <p className="text-xm">MakeCircles v{process.env.version}</p>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export default SupportButton;
