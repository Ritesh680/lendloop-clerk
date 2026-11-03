import {
  CookingPot,
  Drill,
  Hammer,
  Package,
  ShowerHead,
  Shovel,
  Tent,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/convex/lib/constants";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  power_tools: Drill,
  hand_tools: Hammer,
  garden: Shovel,
  kitchen: CookingPot,
  camping: Tent,
  cleaning: ShowerHead,
  automotive: Wrench,
  other: Package,
};
