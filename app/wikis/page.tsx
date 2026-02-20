import Link from "next/link";
import { listWikis } from "@/lib/wikiStore";

export default async function WikisPage() {
  const wikis = await listWikis();

  return (
    <div className="bg-background-dark text-slate-200">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Wikis</h1>
            <p className="mt-2 text-sm text-slate-400">Browse wiki communities (`w/name`) and jump into their questions.</p>
          </div>
          <Link
            href="/wiki/new"
            className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
          >
            Create Wiki
          </Link>
        </div>

        <div className="grid gap-3">
          {wikis.map((wiki) => (
            <Link
              key={wiki.id}
              href={`/wiki/${wiki.id}`}
              className="rounded-lg border border-white/10 bg-[#0a0a0a] p-4 transition-colors hover:border-white/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-primary">w/{wiki.id}</p>
                  <p className="text-lg font-medium text-white">{wiki.displayName}</p>
                  <p className="line-clamp-2 text-sm text-slate-400">{wiki.description || "No description yet."}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">by @{wiki.createdBy}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
