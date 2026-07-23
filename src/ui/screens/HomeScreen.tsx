export function HomeScreen() {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ margin: 0 }}>Zählerstand</h1>
      <p style={{ color: 'var(--text-dim)', margin: 0 }}>
        Home Utility Calculator — Phase 0 shell
      </p>
    </main>
  )
}
