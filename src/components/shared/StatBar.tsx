interface Props {
  value: number;
  max?: number;
  color?: string;
  showValue?: boolean;
  label?: string;
  confidence?: number;
}

export function StatBar({ value, max = 100, color = 'var(--red)', showValue = true, label, confidence }: Props) {
  const pct = Math.round((value / max) * 100);
  const opacity = confidence !== undefined ? 0.4 + (confidence / 100) * 0.6 : 1;
  return (
    <div style={{ width: '100%' }}>
      {(label || showValue) && (
        <div className="flex justify-between text-xs" style={{ marginBottom: 3 }}>
          {label && <span className="text-dim uppercase font-head">{label}</span>}
          {showValue && (
            <span className="font-mono" style={{ opacity }}>
              {value}{confidence !== undefined ? <span className="text-dim" style={{ fontSize: 10 }}> ({confidence}%)</span> : ''}
            </span>
          )}
        </div>
      )}
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: color, opacity }}
        />
      </div>
    </div>
  );
}
