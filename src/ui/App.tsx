import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { SyncProvider } from './SyncContext'
import { VaultGate } from './VaultGate'
import { ConflictScreen } from './screens/ConflictScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MeterScreen } from './screens/MeterScreen'
import { PropertyFormScreen } from './screens/PropertyFormScreen'
import { PropertyScreen } from './screens/PropertyScreen'
import { ReadingFormScreen } from './screens/ReadingFormScreen'
import { SyncScreen } from './screens/SyncScreen'

// HashRouter avoids 404s on GitHub Pages static hosting.
export default function App() {
  return (
    <AppProvider>
      <VaultGate>
        <HashRouter>
          <SyncProvider>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/property/new" element={<PropertyFormScreen />} />
              <Route path="/property/:propertyId" element={<PropertyScreen />} />
              <Route path="/property/:propertyId/edit" element={<PropertyFormScreen />} />
              <Route path="/meter/:meterId" element={<MeterScreen />} />
              <Route path="/meter/:meterId/reading/:readingId" element={<ReadingFormScreen />} />
              <Route path="/sync" element={<SyncScreen />} />
              <Route path="/conflicts" element={<ConflictScreen />} />
              {/* A consumed pairing link, or any stale bookmark, lands home
                  rather than on a blank screen. */}
              <Route path="*" element={<HomeScreen />} />
            </Routes>
          </SyncProvider>
        </HashRouter>
      </VaultGate>
    </AppProvider>
  )
}
