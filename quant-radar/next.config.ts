import type {NextConfig} from 'next';
const config:NextConfig={outputFileTracingIncludes:{'/api/pallas':['./data/pallas/*.json'],'/api/aurum':['./data/aurum/*.json'],'/api/panther-signals':['./data/sol-rvol/*.json.gz']}};
export default config;
