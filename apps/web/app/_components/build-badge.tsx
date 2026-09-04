const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "dev";
const ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "local"; // production | preview | local
const BRANCH = process.env.NEXT_PUBLIC_APP_BRANCH ?? "";
const BUILT_AT = process.env.NEXT_PUBLIC_APP_BUILT_AT ?? "";

const ENV_LABEL: Record<string, string> = {
  production: "prod",
  preview: "staging",
  local: "local"
};

function builtAtLabel(): string {
  if (!BUILT_AT) return "";
  const d = new Date(BUILT_AT);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16).replace("T", " ");
}

/** Small, unobtrusive footer showing which build the page is running. */
export function BuildBadge() {
  const envLabel = ENV_LABEL[ENV] ?? ENV;
  const parts = [
    `v${VERSION}`,
    COMMIT,
    envLabel + (BRANCH && envLabel === "staging" ? `:${BRANCH}` : ""),
    builtAtLabel()
  ].filter(Boolean);

  return (
    <footer
      className={`build-badge build-badge-${envLabel}`}
      title={`Station V2 · v${VERSION} · ${COMMIT}${BRANCH ? ` · ${BRANCH}` : ""} · ${ENV}${
        BUILT_AT ? ` · built ${builtAtLabel()} UTC` : ""
      }`}
    >
      {parts.join(" · ")}
    </footer>
  );
}
