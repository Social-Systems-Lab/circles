import type { DetailedHTMLProps, HTMLAttributes } from "react";

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
