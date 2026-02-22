export type NumericLike = number | string;

export interface RadarStock {
  Name: string;
  SmartRank?: NumericLike;
  Peak_Score?: NumericLike;
  "Latest Score"?: NumericLike;
  Signal_Generated_Score?: NumericLike;
  OI?: NumericLike;
  "OI %"?: NumericLike;
  Break?: string;
  Confidence?: NumericLike;
  Chart: string;
  Sector?: string;
  sector?: string;
  Industry?: string;
  industry?: string;
  [key: string]: unknown;
}

export interface SectorStrength {
  name: string;
  strength: number;
  stocks: RadarStock[];
}
