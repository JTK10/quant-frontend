import SectorSentiment from '../components/SectorSentiment';

export const dynamic = 'force-dynamic';

export default function SectorPage() {
  return (
    <div className="p-5 md:p-6">
      <SectorSentiment />
    </div>
  );
}
