import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SLUG = __ENV.SLUG;

export const options = {
  stages: [
    { duration: "30s", target: 1000 },
    { duration: "2m", target: 1000 },
    { duration: "15s", target: 0 },
  ],
  thresholds: { http_req_duration: ["p(95)<500"], http_req_failed: ["rate<0.01"] },
};

export default function eventPage() {
  const res = http.get(`${BASE_URL}/events/${SLUG}`);
  check(res, { "200": (r) => r.status === 200 });
  sleep(1);
}
