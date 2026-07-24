// Persistent bottom navigation. Four destinations plus a raised primary
// action (enter a reading) in the centre — the app's most common task.
import { NavLink, useNavigate } from 'react-router-dom'

type IconProps = { active: boolean }

function IconHome({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <path
        d="M3 10.8 12 4l9 6.8V19a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
    </svg>
  )
}

function IconMeter({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.2"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M12 12 15.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  )
}

function IconProperty({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <path
        d="M5 20V6.5a1 1 0 0 1 .6-.92l6-2.6a1 1 0 0 1 1.4.92V20M13 20V9.8l4.4 1.9a1 1 0 0 1 .6.92V20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.14 : 0}
      />
      <path d="M3.5 20h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function IconMore({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M4.7 4.7l1.7 1.7M17.6 17.6l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.7 19.3l1.7-1.7M17.6 6.4l1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Tab({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: (p: IconProps) => React.ReactNode
}) {
  return (
    <NavLink to={to} end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
      {({ isActive }) => (
        <>
          {icon({ active: isActive })}
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function TabBar() {
  const navigate = useNavigate()
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      <div className="tabbar-inner">
        <Tab to="/" label="Übersicht" icon={IconHome} />
        <Tab to="/meters" label="Zähler" icon={IconMeter} />
        <button
          type="button"
          className="tab-fab"
          onClick={() => navigate('/add')}
          aria-label="Zählerstand eintragen"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <Tab to="/properties" label="Objekte" icon={IconProperty} />
        <Tab to="/settings" label="Mehr" icon={IconMore} />
      </div>
    </nav>
  )
}
