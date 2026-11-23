import baseMembers from '@/app/rusty/sectors.json';
import industryFallback from '@/app/sector/workspace/industryFallback.json';
import sectorOverrides from '@/app/sector/sectorOverrides.json';

const aliases: Record<string, string> = {
  Healthcare: 'PHARMA',
  'Automobile and Auto Components': 'AUTO',
  'Information Technology': 'IT',
  'Financial Services': 'FIN SERVICE',
};

function buildTowerMembers(): Record<string, string[]> {
  const towerMembers: Record<string, string[]> = { ...baseMembers };
  const addMembers = (sector: string, symbols: string[]) => {
    towerMembers[sector] = [...new Set([...(towerMembers[sector] || []), ...symbols])];
  };
  for (const [sector, symbols] of Object.entries(industryFallback)) {
    addMembers(aliases[sector] || sector, symbols as string[]);
  }
  for (const [symbol, sector] of Object.entries(sectorOverrides)) {
    for (const name of Object.keys(towerMembers)) {
      towerMembers[name] = towerMembers[name].filter((member) => member !== symbol);
      if (!towerMembers[name].length) delete towerMembers[name];
    }
    addMembers(sector, [symbol]);
  }
  addMembers('PVT BANK', ['CUB', 'KARURVYSYA', 'UJJIVANSFB']);
  addMembers('PSU BANK', ['MAHABANK']);
  addMembers('BANK', [...(towerMembers['PVT BANK'] || []), ...(towerMembers['PSU BANK'] || [])]);
  addMembers('FIN SERVICE', towerMembers['BANK']);
  return towerMembers;
}

export const SECTOR_MEMBERS: Record<string, string[]> = buildTowerMembers();
