export default function SectorWorkspace({date}:{date:string}){
 return <iframe key={date} title="Sector Scope — sector, flow and stock review" src={`/sector/workspace?date=${encodeURIComponent(date)}`} className="h-dvh w-full border-0"/>;
}
