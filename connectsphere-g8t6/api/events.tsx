export async function getData() {
  console.log(`${process.env.BACKEND_URL}/api/healthcheck`);
  const res = await fetch(`${process.env.BACKEND_URL}/api/healthcheck`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch data");
  }

  return res.json();
}
