import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { VaultGate } from './VaultGate'
import { HomeScreen } from './screens/HomeScreen'
import { MeterScreen } from './screens/MeterScreen'
import { PropertyFormScreen } from './screens/PropertyFormScreen'
import { PropertyScreen } from './screens/PropertyScreen'
import { ReadingFormScreen } from './screens/ReadingFormScreen'

// HashRouter avoids 404s on GitHub Pages static hosting.
export default function App() {
  return (
    <AppProvider>
      <VaultGate>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/property/new" element={<PropertyFormScreen />} />
            <Route path="/property/:propertyId" element={<PropertyScreen />} />
            <Route path="/property/:propertyId/edit" element={<PropertyFormScreen />} />
            <Route path="/meter/:meterId" element={<MeterScreen />} />
            <Route path="/meter/:meterId/reading/:readingId" element={<ReadingFormScreen />} />
          </Routes>
        </HashRouter>
      </VaultGate>
    </AppProvider>
  )
}
