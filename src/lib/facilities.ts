export const FACILITIES = [
  { key: "parking", label: "Area parkir" },
  { key: "toilet", label: "Toilet" },
  { key: "medical", label: "Pos medis" },
  { key: "prayer_room", label: "Musholla" },
  { key: "food_court", label: "Food court" },
  { key: "photo_booth", label: "Photo booth" },
  { key: "smoking_area", label: "Area merokok" },
  { key: "water_station", label: "Water station" },
  { key: "storage", label: "Penitipan barang" },
  { key: "information_center", label: "Pusat informasi" },
  { key: "merchandise", label: "Merchandise" },
  { key: "charging_station", label: "Charging station" },
  { key: "disability_access", label: "Akses disabilitas" },
  { key: "kids_area", label: "Area anak" },
] as const;

export type FacilityKey = (typeof FACILITIES)[number]["key"];

export const FACILITY_KEYS = FACILITIES.map((f) => f.key) as [FacilityKey, ...FacilityKey[]];
