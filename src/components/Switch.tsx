export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 50,
        height: 30,
        borderRadius: 99,
        padding: 3,
        background: checked ? 'var(--green)' : 'var(--fill)',
        transition: 'background .2s ease',
        flex: 'none',
      }}
    >
      <span
        style={{
          display: 'block',
          width: 24,
          height: 24,
          borderRadius: 99,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform .2s cubic-bezier(.32,.72,0,1)',
        }}
      />
    </button>
  )
}
