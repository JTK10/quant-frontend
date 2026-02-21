"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://ayg0muysdf.execute-api.ap-south-1.amazonaws.com/default/daiyprecalculate?route=smart-radar&date=2026-02-20")
      .then((res) => res.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-10 text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl font-bold mb-6">Smart Radar</h1>

      {data.map((item, index) => (
        <div
          key={index}
          className="bg-gray-900 p-4 mb-4 rounded-lg border border-gray-700"
        >
          <pre className="text-sm">{JSON.stringify(item, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}