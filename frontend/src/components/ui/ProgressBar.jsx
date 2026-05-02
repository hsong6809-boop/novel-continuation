export default function ProgressBar({ value, max = 100, className = '' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`w-full bg-surface-3 rounded-full h-1.5 overflow-hidden ${className}`}>
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--color-vermillion-500), var(--color-gold-500))',
        }}
      />
    </div>
  );
}
