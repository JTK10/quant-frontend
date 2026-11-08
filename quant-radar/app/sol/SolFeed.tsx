"use client";
import RustyFeed from '../rusty/RustyFeed';
import SolClient from './SolClient';
export default function SolFeed({dateStr,followToday}:{dateStr:string;followToday:boolean}) {
  return <RustyFeed dateStr={dateStr} followToday={followToday} Board={SolClient} pagePath="/sol"/>;
}
