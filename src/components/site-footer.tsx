import Link from "next/link";
import { siteConfig, navLinks } from "@/lib/config";
import { GithubMark } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-snow">{siteConfig.name}</p>
          <p className="mt-2 text-xs leading-relaxed text-fog">
            Deterministic credibility signals computed from public YouTube metadata. Scores are
            heuristics, not fact-checks — verify important claims independently.
          </p>
        </div>
        <nav className="flex flex-col gap-2" aria-label="Footer">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-xs text-fog hover:text-snow">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2">
          <a
            href={siteConfig.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-fog hover:text-snow"
          >
            <GithubMark className="h-4 w-4" />
            View source on GitHub
          </a>
          <span className="text-xs text-fog">MIT License</span>
        </div>
      </div>
    </footer>
  );
}
