import ChartsClient from "./ChartsClient";

export const dynamic = "force-dynamic";

export default function ChartsPage() {
  return <ChartsClient streamUrl={process.env.NEXT_PUBLIC_CHART_STREAM_URL ?? ""} />;
}
