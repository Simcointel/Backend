// Building definitions — NEVER change without game update
export interface BuildingDefinition {
  id: string;                    // "2", "A", "C", "G", "H", "I", "d", "t", "u", "z"
  name: string;                  // "Car dealership", "Gas station", ...
  baseWage: number;              // Hourly base wage
  retailAdjustment: number;      // Price multiplier (H=0.9, others=1.0)
  products: number[];            // Resource IDs sold in this building
}

export const BUILDINGS: Record<string, BuildingDefinition> = {
  "2": { id: "2", name: "Car dealership", baseWage: 379.5, retailAdjustment: 1.0, products: [54, 56, 53, 55, 57] },
  "A": { id: "A", name: "Gas station", baseWage: 345, retailAdjustment: 1.0, products: [11, 12] },
  "C": { id: "C", name: "Electronics store", baseWage: 172.5, retailAdjustment: 1.0, products: [24, 25, 26, 27, 28, 98] },
  "G": { id: "G", name: "Grocery store", baseWage: 138, retailAdjustment: 1.0, products: [3, 4, 5, 7, 8, 9, 119, 122, 123, 124, 125, 126, 127, 140, 152] },
  "H": { id: "H", name: "Fashion store", baseWage: 310.5, retailAdjustment: 0.9, products: [60, 61, 62, 63, 64, 65, 70, 71] },
  "I": { id: "I", name: "Spring market", baseWage: 241, retailAdjustment: 1.0, products: [151, 155] },
  "d": { id: "d", name: "Hardware store", baseWage: 172.5, retailAdjustment: 1.0, products: [102, 103, 108, 109, 110] },
  "t": { id: "t", name: "Halloween market", baseWage: 207, retailAdjustment: 1.0, products: [146, 147, 148] },
  "u": { id: "u", name: "Xmas market", baseWage: 241.5, retailAdjustment: 1.0, products: [67, 144, 150] },
  "z": { id: "z", name: "Beach market", baseWage: 241.5, retailAdjustment: 1.0, products: [153, 154] },
};

export const CORE_CONSTANTS = {
  AB: 0.3,           // Base demand constant
  AC: 320,           // Base demand constant
  AD_Map: { "B": 2.3, "H": 0.9 } as const,  // Building-specific demand multipliers
} as const;

export const RESOURCE_NAMES: Record<number, string> = {
  1: "Power", 2: "Water", 3: "Apples", 4: "Grain", 5: "Wood", 6: "Cotton", 7: "Cattle",
  8: "Iron Ore", 9: "Coal", 10: "Sand", 11: "Crude Oil", 12: "Gasoline", 13: "Natural Gas",
  14: "Plastic", 15: "Chemicals", 16: "Fabric", 17: "Leather", 18: "Paper", 19: "Glass",
  20: "Rubber", 21: "Cement", 22: "Steel", 23: "Aluminum", 24: "Smartphones", 25: "Laptops",
  26: "Tablets", 27: "TVs", 28: "Game Consoles", 29: "Microchips", 30: "Batteries",
  31: "Electric Motors", 32: "Robotics", 33: "AI Chips", 34: "Quantum Chips", 35: "Superconductors",
  36: "Wheat", 37: "Corn", 38: "Rice", 39: "Soybeans", 40: "Sugar", 41: "Coffee", 42: "Cocoa",
  43: "Tea", 44: "Fruit", 45: "Vegetables", 46: "Meat", 47: "Fish", 48: "Dairy", 49: "Eggs",
  50: "Chicken", 51: "Pork", 52: "Beef", 53: "Sedan", 54: "SUV", 55: "Sports Car", 56: "Truck",
  57: "Motorcycle", 58: "Bicycle", 59: "E-Bike", 60: "T-Shirt", 61: "Jeans", 62: "Dress",
  63: "Suit", 64: "Sneakers", 65: "Boots", 66: "Jacket", 67: "Christmas Tree", 68: "Ornaments",
  69: "Gift Wrap", 70: "Handbag", 71: "Watch", 72: "Jewelry", 73: "Perfume", 74: "Cosmetics",
  75: "Soap", 76: "Detergent", 77: "Shampoo", 78: "Toothpaste", 79: "Toilet Paper",
  80: "Tissues", 81: "Diapers", 82: "Baby Formula", 83: "Baby Food", 84: "Pet Food",
  85: "Cat Litter", 86: "Dog Treats", 87: "Bird Seed", 88: "Fish Food", 89: "Aquarium Supplies",
  90: "Furniture", 91: "Mattress", 92: "Sofa", 93: "Dining Table", 94: "Chair", 95: "Desk",
  96: "Lamp", 97: "Carpet", 98: "Smartwatch", 99: "Headphones", 100: "Speaker", 101: "Router",
  102: "Hammer", 103: "Screwdriver", 104: "Wrench", 105: "Drill", 106: "Saw", 107: "Sander",
  108: "Nails", 109: "Screws", 110: "Paint", 111: "Brush", 112: "Tape", 113: "Glue",
  114: "Insulation", 115: "Drywall", 116: "Tile", 117: "Lumber", 118: "Plywood", 119: "Bananas",
  120: "Oranges", 121: "Berries", 122: "Milk", 123: "Cheese", 124: "Butter", 125: "Yogurt",
  126: "Ice Cream", 127: "Bread", 128: "Pasta", 129: "Flour", 130: "Oil", 131: "Vinegar",
  132: "Salt", 133: "Pepper", 134: "Spices", 135: "Honey", 136: "Jam", 137: "Sauce",
  138: "Soda", 139: "Juice", 140: "Water Bottle", 141: "Energy Drink", 142: "Beer",
  143: "Wine", 144: "Gingerbread", 145: "Candy Cane", 146: "Pumpkin", 147: "Costume",
  148: "Candy", 149: "Chocolate", 150: "Eggnog", 151: "Flowers", 152: "Herbs",
  153: "Sunscreen", 154: "Beach Towel", 155: "Surfboard",
};

// Utility to get building by ID
export function getBuilding(id: string): BuildingDefinition | undefined {
  return BUILDINGS[id];
}

// Utility to get resource name
export function getResourceName(id: number): string {
  return RESOURCE_NAMES[id] ?? `Resource ${id}`;
}

// Utility to get buildings selling a product
export function getBuildingsForProduct(productId: number): BuildingDefinition[] {
  return Object.values(BUILDINGS).filter(b => b.products.includes(productId));
}