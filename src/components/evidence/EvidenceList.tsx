/**
 * Evidence viewer (Phase 7, section 8/23) — the ONE place a submission's
 * evidence URLs are rendered as actual links anywhere in the app.
 *
 * Security posture, deliberately: every submitted URL is treated as
 * untrusted external content, exactly like GenLayer's own evaluator does
 * (see docs/evaluation.md "Prompt Injection Defense"). This component never
 * fetches, previews, or embeds the target — no `<iframe>`, no
 * `dangerouslySetInnerHTML`, nothing that would let a submitted page
 * execute with WorkResolve's origin privileges. It renders a plain,
 * labeled `<a>` with `target="_blank" rel="noreferrer noopener"` (so the
 * opened page gets no `window.opener` back into this app and no referrer
 * leak) and lets the browser's own tab sandboxing do the rest — the same
 * safe pattern already used by ExplorerLink.
 *
 * Phase 8 hardening: `submitForm.ts`'s URL check is frontend UX only, and
 * the contract's `submit_work` never validates URL *scheme* either (only
 * emptiness/length) — so a submission reaching this component isn't
 * guaranteed to be an http(s) URL. It could in principle be constructed by
 * a direct contract call that bypasses this app's form entirely. This
 * component is the single rendering choke point for evidence URLs, so it
 * is also the last line of defense: `isSafeHttpUrl` allowlists only
 * `http:`/`https:` and anything else — `javascript:`, `data:`, `file:`,
 * a malformed string that isn't a URL at all — is rendered as inert plain
 * text instead of a clickable `href`, so it can never execute or navigate.
 */
import type { Submission } from "@/types";

interface EvidenceItem {
  label: string;
  url: string;
}

/** Only http/https may become a clickable link. Anything else (including a
 * string that fails to parse as a URL at all) is treated as unsafe. */
function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildEvidenceItems(submission: Pick<Submission, "deployedUrl" | "repositoryUrl" | "evidenceUrls">): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (submission.deployedUrl) items.push({ label: "Live Website", url: submission.deployedUrl });
  if (submission.repositoryUrl) items.push({ label: "Repository", url: submission.repositoryUrl });
  submission.evidenceUrls.forEach((url, i) => {
    if (url) items.push({ label: `Evidence ${i + 1}`, url });
  });
  return items;
}

export function EvidenceList({
  submission,
}: {
  submission: Pick<Submission, "deployedUrl" | "repositoryUrl" | "evidenceUrls">;
}) {
  const items = buildEvidenceItems(submission);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No evidence URLs were provided with this submission.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.label}-${item.url}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium text-slate-800">{item.label}</p>
            <p className="truncate text-xs text-slate-500" title={item.url}>
              {item.url}
            </p>
          </div>
          {isSafeHttpUrl(item.url) ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-xs font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
            >
              Open ↗
            </a>
          ) : (
            <span
              className="shrink-0 text-xs font-medium text-red-700"
              title="This value isn't a valid http(s) URL, so it can't be safely opened."
            >
              Not a safe link
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
