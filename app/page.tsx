import { requireChatGPTUser } from "./chatgpt-auth";
import { FreshKeepApp } from "./FreshKeepApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <FreshKeepApp signedInUser={user} />;
}
