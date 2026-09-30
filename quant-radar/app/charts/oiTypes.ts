export type OIWall = [strike: number, oi: number, change: number | null];
export type OISnapshot = { date: string; cut: string; time: number; spot: number; expiry: string; support: OIWall[]; resistance: OIWall[]; degraded: boolean };
export type OIData = { symbol: string; date: string; intraday: OISnapshot[]; previous: OISnapshot[]; errors: string[] };
