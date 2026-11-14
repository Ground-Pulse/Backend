/**
 * Default checklist templates per property type (C-020 Custom Checklist
 * Templates). Admins can edit these; the backend copies the template into
 * checklist_items rows when an inspection is scheduled.
 */
export const PROPERTY_TYPES = [
  "Apartment",
  "Villa",
  "Independent House",
  "Vacation Home",
  "Commercial",
  "Plot",
] as const;

type TemplateItem = { roomArea: string; itemName: string };

const residentialCore: TemplateItem[] = [
  { roomArea: "Entrance", itemName: "Main door & lock" },
  { roomArea: "Entrance", itemName: "Doorbell & intercom" },
  { roomArea: "Living Room", itemName: "Walls & ceiling (seepage, cracks)" },
  { roomArea: "Living Room", itemName: "Windows, grills & latches" },
  { roomArea: "Living Room", itemName: "Lights, fans & switches" },
  { roomArea: "Kitchen", itemName: "Sink & plumbing" },
  { roomArea: "Kitchen", itemName: "Gas line & regulator" },
  { roomArea: "Kitchen", itemName: "Electrical points" },
  { roomArea: "Bedroom 1", itemName: "Walls & ceiling (seepage, cracks)" },
  { roomArea: "Bedroom 1", itemName: "Window locks" },
  { roomArea: "Bathroom", itemName: "Taps, flush & drainage" },
  { roomArea: "Bathroom", itemName: "Geyser & exhaust" },
  { roomArea: "Utility", itemName: "Electricity meter reading" },
  { roomArea: "Utility", itemName: "MCB / distribution board" },
];

export const DEFAULT_TEMPLATES: Record<string, TemplateItem[]> = {
  Apartment: [
    ...residentialCore,
    { roomArea: "Balcony", itemName: "Drainage & railing" },
  ],
  Villa: [
    ...residentialCore,
    { roomArea: "Bedroom 2", itemName: "Walls & ceiling (seepage, cracks)" },
    { roomArea: "Terrace", itemName: "Waterproofing & drains" },
    { roomArea: "Terrace", itemName: "Overhead water tank" },
    { roomArea: "Exterior", itemName: "Compound wall & gate" },
    { roomArea: "Exterior", itemName: "Garden & landscaping" },
  ],
  "Independent House": [
    ...residentialCore,
    { roomArea: "Terrace", itemName: "Waterproofing & drains" },
    { roomArea: "Exterior", itemName: "Compound wall & gate" },
    { roomArea: "Exterior", itemName: "Sump & motor" },
  ],
  "Vacation Home": [
    ...residentialCore,
    { roomArea: "Exterior", itemName: "Pest & termite signs" },
    { roomArea: "Exterior", itemName: "Pool / garden condition" },
    { roomArea: "Security", itemName: "CCTV & alarm" },
  ],
  Commercial: [
    { roomArea: "Entrance", itemName: "Shutter / main door & lock" },
    { roomArea: "Floor", itemName: "Walls & ceiling" },
    { roomArea: "Floor", itemName: "Lighting & switches" },
    { roomArea: "Floor", itemName: "Air conditioning units" },
    { roomArea: "Washroom", itemName: "Plumbing & drainage" },
    { roomArea: "Utility", itemName: "Electricity meter reading" },
    { roomArea: "Utility", itemName: "Fire extinguisher validity" },
    { roomArea: "Security", itemName: "CCTV & access control" },
  ],
  Plot: [
    { roomArea: "Boundary", itemName: "Fencing / compound wall intact" },
    { roomArea: "Boundary", itemName: "Encroachment check" },
    { roomArea: "Boundary", itemName: "Boundary stones & signage" },
    { roomArea: "Land", itemName: "Vegetation & debris" },
    { roomArea: "Land", itemName: "Waterlogging / drainage" },
    { roomArea: "Land", itemName: "Dumping or illegal use" },
  ],
};

/** Issue category → provider service type used for matching. */
export const CATEGORY_SERVICE: Record<string, string> = {
  LEAK: "Plumbing",
  ELECTRICAL: "Electrical",
  SECURITY: "Security",
  CLEANLINESS: "Cleaning",
  OTHER: "General Repairs",
};

export const SERVICE_TYPES = ["Plumbing", "Electrical", "Security", "Cleaning", "General Repairs", "Pest Control"];

export const CITIES = ["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi NCR", "Goa"];
