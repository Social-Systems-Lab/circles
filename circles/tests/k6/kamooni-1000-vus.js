import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "https://kamooni.org").replace(/\/$/, "");
const VUS = Number(__ENV.VUS || "1000");
const DURATION = __ENV.DURATION || "5m";
const THINK_TIME_SECONDS = Number(__ENV.THINK_TIME_SECONDS || "1");

const endpointTrend = new Trend("kamooni_endpoint_duration", true);

export const options = {
    scenarios: {
        public_read_traffic: {
            executor: "constant-vus",
            vus: VUS,
            duration: DURATION,
            gracefulStop: "30s",
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.05"],
        http_req_duration: ["p(95)<1500"],
        kamooni_endpoint_duration: ["p(95)<1500"],
    },
};

const endpoints = [
    { name: "version", path: "/api/version" },
    { name: "home", path: "/" },
    { name: "explore", path: "/explore" },
    { name: "circles", path: "/circles" },
];

export default function () {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const response = http.get(`${BASE_URL}${endpoint.path}`, {
        tags: { endpoint: endpoint.name },
    });

    endpointTrend.add(response.timings.duration, { endpoint: endpoint.name });
    check(response, {
        "status is below 500": (res) => res.status < 500,
        "version endpoint returns json": (res) =>
            endpoint.name !== "version" || String(res.headers["Content-Type"] || "").includes("application/json"),
    });

    sleep(THINK_TIME_SECONDS);
}
