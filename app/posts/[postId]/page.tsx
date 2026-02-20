import { redirect } from "next/navigation";

export default async function LegacyPostPage(props: { params: Promise<{ postId: string }> }) {
  const params = await props.params;
  redirect(`/question/${params.postId}`);
}
