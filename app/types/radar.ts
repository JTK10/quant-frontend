export type NumericLike = number | string;

export interface RadarStock {
  Name: string;
  Symbol?: string;
  Module?: string;
  ModuleLabel?: string;
  Side?: string;
  Time?: string;
  Fired_At?: string;
  Entry?: NumericLike;
  SL?: NumericLike;
  StopLoss?: NumericLike;
  Target?: NumericLike;
  Target1?: NumericLike;
  Target2?: NumericLike;
  RiskReward?: string;
  RVOL?: NumericLike;
  Body_Pct?: NumericLike;
  Day_Move_Pct?: NumericLike;
  RS_Score?: NumericLike;
  PCR?: NumericLike;
  PCR_At_Open?: NumericLike;
  CallWall?: string;
  PutWall?: string;
  ATM_Strike?: string;
  Notes?: string;
  PE_OI_Surge?: NumericLike;
  Sector_Theme?: boolean;
  Strike_Rec?: string;
  SignalRank?: NumericLike;
  SignalEdge?: NumericLike;
  TV_Symbol?: string;
  SmartRank?: NumericLike;
  Peak_Score?: NumericLike;
  'Latest Score'?: NumericLike;
  Signal_Generated_Score?: NumericLike;
  "Current Price"?: NumericLike;
  Price?: NumericLike;
  SignalPrice?: NumericLike;
  OI?: NumericLike;
  'OI %'?: NumericLike;
  OI_Change?: NumericLike;
  pChangeInOpenInterest?: NumericLike;
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
  count?: number;
  avgEdge?: number;
  bullRatio?: number;
}
