import { HashRouter, Route, Routes } from 'react-router-dom'
import { HomeScreen } from './screens/HomeScreen'

// HashRouter avoids 404s on GitHub Pages static hosting.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
      </Routes>
    </HashRouter>
  )
}
