export function WinnerBadge({ label = "Rewarded Agent" }: { label?: string }) {
  return <span className="winner-badge">{label}</span>;
}
