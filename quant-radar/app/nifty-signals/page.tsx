import NiftySignalsChart from "./NiftySignalsChart";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}) {
  return <NiftySignalsChart initialDate={(await searchParams).date} streamUrl={process.env.NEXT_PUBLIC_CHART_STREAM_URL ?? "wss://140.238.241.210.sslip.io"}/>;
}
