import { redirect } from "next/navigation";

export default function IntegrateAgentRedirectPage() {
  redirect("/agents/new");
}
