import type {NextConfig} from 'next';
const config:NextConfig={outputFileTracingIncludes:{'/api/pallas':['./data/pallas/*.json'],'/api/aurum':['./data/aurum/*.json'],'/api/oi-line-breaks':['./data/oi-line-breaks/*.json.gz']}};
export default config;
