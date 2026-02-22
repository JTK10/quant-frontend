"use client";

import { useEffect, useState } from "react";

export default function Page() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/radar")
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch(console.error);
  }, []);

  return (
    <div>
      <h1>Smart Radar</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
