import type {NextConfig} from 'next';
const config:NextConfig={outputFileTracingIncludes:{'/api/pallas':['./data/pallas/*.json'],'/api/aurum':['./data/aurum/*.json']}};
export default config;
