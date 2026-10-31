import { HomeClient } from "./home-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <HomeClient
    now={new Date().toISOString()}
  />;
}
