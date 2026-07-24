import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { SyncProvider } from './SyncContext'
import { ThemeProvider } from './theme'
import { VaultGate } from './VaultGate'
import { TabBar } from './components/TabBar'
import { ConflictScreen } from './screens/ConflictScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MetersScreen } from './screens/MetersScreen'
import { AddReadingScreen } from './screens/AddReadingScreen'
import { PropertiesScreen } from './screens/PropertiesScreen'
import { PropertyFormScreen } from './screens/PropertyFormScreen'
import { PropertyScreen } from './screens/PropertyScreen'
import { MeterScreen } from './screens/MeterScreen'
import { MeterSetupScreen } from './screens/MeterSetupScreen'
import { ReadingFormScreen } from './screens/ReadingFormScreen'
import { SettingsScreen } from './screens/SettingsScreen'

/** The four top-level destinations share the persistent bottom tab bar. */
function TabLayout() {
  return (
    <div className="has-tabbar">
      <Outlet />
      <TabBar />
    </div>
  )
}

// HashRouter avoids 404s on GitHub Pages static hosting.
export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <VaultGate>
          <HashRouter>
            <SyncProvider>
              <Routes>
                <Route element={<TabLayout />}>
                  <Route path="/" element={<HomeScreen />} />
                  <Route path="/meters" element={<MetersScreen />} />
                  <Route path="/properties" element={<PropertiesScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                </Route>

                {/* Pushed screens: full-width, back navigation, no tab bar. */}
                <Route path="/add" element={<AddReadingScreen />} />
                <Route path="/property/new" element={<PropertyFormScreen />} />
                <Route path="/property/:propertyId" element={<PropertyScreen />} />
                <Route path="/property/:propertyId/edit" element={<PropertyFormScreen />} />
                <Route path="/meter/:meterId" element={<MeterScreen />} />
                <Route path="/meter/:meterId/setup" element={<MeterSetupScreen />} />
                <Route
                  path="/meter/:meterId/reading/:readingId"
                  element={<ReadingFormScreen />}
                />
                <Route path="/conflicts" element={<ConflictScreen />} />

                {/* A consumed pairing link, or any stale bookmark, lands home. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </SyncProvider>
          </HashRouter>
        </VaultGate>
      </AppProvider>
    </ThemeProvider>
  )
}
