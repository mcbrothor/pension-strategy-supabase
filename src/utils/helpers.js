import { ZONES, STRATEGIES } from "../constants";

export const getZone = v => ZONES.find(z => v < z.max) || ZONES[3];
export const getStrat = id => STRATEGIES.find(s => s.id === id) || STRATEGIES[3];
export const irpLimit = acc => acc === "연금저축" ? 100 : 70;
