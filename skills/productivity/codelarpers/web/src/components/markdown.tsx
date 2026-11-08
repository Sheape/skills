import { useMemo } from "react";
import { Marked } from "marked";
import hljs from "highlight.js/lib/common";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Shell transcripts: dim the `$` prompt and colour the command name, like the challenge pages. */
function shell(code: string) {
  return code
    .split("\n")
    .map((line) => {
      const m = /^(\s*)\$ (\S+)(.*)$/.exec(line);
      if (!m) return escapeHtml(line);
      return `${m[1]}<span class="prompt-dollar">$ </span><span class="cmd-name">${escapeHtml(m[2])}</span>${escapeHtml(m[3])}`;
    })
    .join("\n");
}

export function highlight(code: string, lang?: string) {
  const l = (lang || "").toLowerCase();
  if (["bash", "sh", "shell", "console", "zsh"].includes(l) || (!l && /^\s*\$ /m.test(code))) return shell(code);
  if (l && hljs.getLanguage(l)) return hljs.highlight(code, { language: l }).value;
  return escapeHtml(code);
}

function makeMarked(assetBase?: string) {
  return new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) {
        return `<pre><code class="hljs">${highlight(text, lang)}</code></pre>`;
      },
      image({ href, title, text }) {
        const src = assetBase && href && !/^(https?:|\/|data:)/.test(href) ? `${assetBase}/${href.replace(/^\.\//, "")}` : href;
        return `<img src="${src}" alt="${escapeHtml(text || "")}"${title ? ` title="${escapeHtml(title)}"` : ""} />`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:/.test(href);
        return `<a href="${href}"${title ? ` title="${escapeHtml(title)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${inner}</a>`;
      },
    },
  });
}

/** Challenge markdown (agent-authored, local). Relative images resolve against `assetBase`. */
export function Markdown({ source, assetBase, className = "" }: { source: string; assetBase?: string; className?: string }) {
  const html = useMemo(() => makeMarked(assetBase).parse(source || "", { async: false }) as string, [source, assetBase]);
  return <div className={`prose-cl ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
