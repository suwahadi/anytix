import { describe, expect, it } from "vitest";
import { activeFilterCount, eventsHref, parseEventFilters } from "@/lib/public/event-filters";

describe("parseEventFilters", () => {
  it("reads every filter from the URL", () => {
    expect(parseEventFilters({ q: " jazz ", category: "musik", city: "Jakarta Pusat", waktu: "pekan-ini", harga: "di-bawah-100rb", urut: "termurah", page: "2" })).toEqual({
      q: "jazz",
      category: "musik",
      city: "Jakarta Pusat",
      when: "pekan-ini",
      price: "di-bawah-100rb",
      sort: "termurah",
      page: 2,
    });
  });

  it("unknown preset values from a hand-edited URL fall back to no filter", () => {
    expect(parseEventFilters({ waktu: "kemarin", harga: "gratis", urut: "acak", page: "-3" })).toMatchObject({ when: "", price: "", sort: "terdekat", page: 1 });
  });

  it("repeated query keys use the first value", () => {
    expect(parseEventFilters({ city: ["Bandung", "Surabaya"] }).city).toBe("Bandung");
  });
});

describe("eventsHref", () => {
  it("drops empty values, the default sort and page 1", () => {
    expect(eventsHref({ q: "", category: "", city: "", when: "", price: "", sort: "terdekat", page: 1 })).toBe("/events");
  });

  it("keeps active filters and the page", () => {
    expect(eventsHref({ q: "jazz", category: "", city: "Jakarta Pusat", when: "", price: "", sort: "termahal", page: 3 })).toBe("/events?q=jazz&city=Jakarta+Pusat&urut=termahal&page=3");
  });
});

describe("activeFilterCount", () => {
  it("counts panel filters only, not the search text or sort", () => {
    expect(activeFilterCount({ q: "jazz", category: "musik", city: "", when: "hari-ini", price: "", sort: "termurah", page: 1 })).toBe(2);
  });
});
