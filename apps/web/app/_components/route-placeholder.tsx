import { AppShell } from "./app-shell";

type RoutePlaceholderProps = {
  title: string;
  purpose: string;
};

export function RoutePlaceholder({ title, purpose }: RoutePlaceholderProps) {
  return (
    <AppShell title={title} subtitle="V2 placeholder page">
      <div className="card">
        <p>{purpose}</p>
        <p className="muted">Implementation next step.</p>
      </div>
    </AppShell>
  );
}
