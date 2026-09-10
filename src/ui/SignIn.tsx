export function SignIn({
  message,
  actions,
}: {
  message: string
  actions: Array<[string, () => void]>
}) {
  return (
    <div className="signin">
      <h1>Todoom</h1>
      <p>{message}</p>
      {actions.map(([label, onClick]) => (
        <button key={label} onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
  )
}
