import type {NextConfig} from 'next';
const config:NextConfig={outputFileTracingIncludes:{'/api/pallas':['./data/pallas/*.json']}};
export default config;
