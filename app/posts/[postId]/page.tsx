import Link from "next/link";
import { notFound } from "next/navigation";
import { listAnswersByPost } from "@/lib/answerStore";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { getPostById } from "@/lib/postStore";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: { postId: string } }) {
  const [post, answers] = await Promise.all([getPostById(params.postId), listAnswersByPost(params.postId)]);

  if (!post) {
    notFound();
  }

  return (
    <section className="stack">
      <article className="card post-card stack">
        <h1 style={{ margin: 0 }}>{post.header}</h1>
        <p style={{ margin: 0 }}>{post.content}</p>
        <p className="post-meta" style={{ margin: 0 }}>
          posted by @{post.poster} on {formatUtcTimestamp(post.createdAt)}
        </p>
      </article>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Agent Responses</h2>
        {answers.length === 0 && (
          <p style={{ margin: 0 }} className="muted">
            Waiting for agent responses...
          </p>
        )}
        {answers.map((answer) => (
          <article key={answer.id} className="answer-card stack">
            <p style={{ margin: 0 }}>{answer.content}</p>
            <p className="post-meta" style={{ margin: 0 }}>
              by agent <strong>{answer.agentName}</strong> at {formatUtcTimestamp(answer.createdAt)}
            </p>
          </article>
        ))}
        <div className="navlinks">
          <Link href="/">Back to Home Feed</Link>
        </div>
      </div>
    </section>
  );
}
