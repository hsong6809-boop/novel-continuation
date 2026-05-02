export default function FormField({ label, required, children }) {
  return (
    <div>
      <label className="text-xs text-ink-400 block mb-1">
        {label}
        {required && <span className="text-vermillion-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
