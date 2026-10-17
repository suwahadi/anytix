import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EVENT_ID = Number(__ENV.EVENT_ID);
const INVENTORY_ID = Number(__ENV.INVENTORY_ID);

const held = new Counter("holds_created");
const soldOut = new Counter("holds_sold_out");

export const options = {
  scenarios: { rush: { executor: "per-vu-iterations", vus: 300, iterations: 1, maxDuration: "2m" } },
  thresholds: { "http_req_duration{name:hold}": ["p(95)<150"], checks: ["rate>0.99"] },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/holds`,
    JSON.stringify({ eventId: EVENT_ID, items: [{ inventoryId: INVENTORY_ID, qty: 1 }], turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }),
    {
      headers: { "content-type": "application/json", "idempotency-key": `k6-${__VU}-${Date.now()}` },
      tags: { name: "hold" },
    },
  );
  if (res.status === 201) held.add(1);
  if (res.status === 409) soldOut.add(1);
  check(res, { "201 or 409": (r) => r.status === 201 || r.status === 409 });
}
