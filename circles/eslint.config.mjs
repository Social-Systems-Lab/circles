import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
    {
        ignores: [".next/**", "node_modules/**", "reports/**", "test-results/**", "coverage/**"],
    },
    ...nextVitals,
    {
        rules: {
            "react-hooks/immutability": "off",
            "react-hooks/incompatible-library": "off",
            "react-hooks/preserve-manual-memoization": "off",
            "react-hooks/purity": "off",
            "react-hooks/refs": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/static-components": "off",
            "react-hooks/use-memo": "off",
        },
    },
];

export default config;
