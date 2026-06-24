import type { DetailedHTMLProps, HTMLAttributes } from "react";

// declare global {
//     interface Window {
//         CIRCLES_USER_DATA?: string; // Specify type as string or any appropriate type
//         onUserDataReceived?: (data: string) => void;
//     }
// }

type AltchaWidgetProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
    auto?: string;
    challenge?: string;
    configuration?: string;
    display?: string;
    language?: string;
    name?: string;
    type?: string;
};

declare global {
    namespace React {
        namespace JSX {
            interface IntrinsicElements {
                "altcha-widget": AltchaWidgetProps;
            }
        }
    }

    namespace JSX {
        interface IntrinsicElements {
            "altcha-widget": AltchaWidgetProps;
        }
    }
}

export {};
// import React from "react";

// declare module "framer-motion" {
//     type PrimitiveMotionValue = number | string | number[] | string[];
//     type NestedMotionValue = {
//         [key: string]: PrimitiveMotionValue | NestedMotionValue;
//     };
//     type MotionValue = PrimitiveMotionValue | NestedMotionValue;

//     interface TransitionProps {
//         duration?: number;
//         delay?: number;
//         ease?: string | number[];
//         repeat?: number;
//         repeatType?: string;
//         repeatDelay?: number;
//         type?: string;
//         stiffness?: number;
//         damping?: number;
//         mass?: number;
//         velocity?: number;
//         times?: number[];
//         delayChildren?: number;
//         staggerChildren?: number;
//         when?: string | boolean;
//     }

//     interface MotionProps {
//         className?: string;
//         style?: React.CSSProperties;
//         children?: React.ReactNode;
//         initial?: string | Record<string, MotionValue>;
//         animate?: string | Record<string, MotionValue>;
//         exit?: string | Record<string, MotionValue>;
//         transition?: TransitionProps;
//         onClick?: () => void;
//         variants?: {
//             [key: string]: {
//                 [key: string]: MotionValue | TransitionProps;
//             };
//         };
//     }
// }
