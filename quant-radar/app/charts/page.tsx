import ChartsClient from "./ChartsClient";

export const dynamic = "force-dynamic";

type ChartSearchParams = Promise<{ symbol?: string | string[] }>;

export default async function ChartsPage({ searchParams }: { searchParams: ChartSearchParams }) {
  const params = await searchParams;
  const initialSymbol = typeof params.symbol === "string" ? params.symbol : undefined;
  return <ChartsClient initialSymbol={initialSymbol} streamUrl={process.env.NEXT_PUBLIC_CHART_STREAM_URL ?? "wss://140.238.241.210.sslip.io"} />;
}