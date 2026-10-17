import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EVENT_ID = Number(__ENV.EVENT_ID);
const tokens = new SharedArray("tokens", () => open(__ENV.TOKENS_FILE).split(/\r?\n/).filter(Boolean));

export const options = {
  scenarios: { gates: { executor: "shared-iterations", vus: 20, iterations: tokens.length, maxDuration: "5m" } },
  thresholds: { http_req_duration: ["p(95)<300"], checks: ["rate>0.99"] },
};

export default function checkIn() {
  const token = tokens[exec.scenario.iterationInTest];
  const res = http.post(`${BASE_URL}/api/admin/check-ins`, JSON.stringify({ token, eventId: EVENT_ID, gate: `K6-${__VU % 4}` }), {
    headers: { "content-type": "application/json", cookie: __ENV.ADMIN_COOKIE },
  });
  check(res, { "valid": (r) => r.status === 200 && r.json("result") === "valid" });
}
