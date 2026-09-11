import { useEffect } from 'react'
import { Route, BrowserRouter, Routes } from 'react-router-dom'
import LoginGate from './components/LoginGate'
import { purgeExpiredDeletedSites } from './db/locations'
import AllInventory from './screens/AllInventory'
import InactiveLocations from './screens/InactiveLocations'
import ItemPhotos from './screens/ItemPhotos'
import LocationDetail from './screens/LocationDetail'
import LocationsList from './screens/LocationsList'
import NewItem from './screens/NewItem'
import ProjectImages from './screens/ProjectImages'
import RecentlyDeleted from './screens/RecentlyDeleted'
import './App.css'

function App() {
  useEffect(() => {
    function blockNumberInputWheel(e: WheelEvent) {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', blockNumberInputWheel, { passive: false })
    return () => document.removeEventListener('wheel', blockNumberInputWheel)
  }, [])

  useEffect(() => {
    purgeExpiredDeletedSites()
  }, [])

  return (
    <LoginGate>
      <BrowserRouter>
        <img src="/conesco-logo.png" alt="Conesco" className="app-logo" />
        <Routes>
          <Route path="/" element={<LocationsList />} />
          <Route path="/all-inventory" element={<AllInventory />} />
          <Route path="/inactive-locations" element={<InactiveLocations />} />
          <Route path="/recently-deleted" element={<RecentlyDeleted />} />
          <Route path="/locations/:siteId" element={<LocationDetail />} />
          <Route path="/locations/:siteId/items/new" element={<NewItem />} />
          <Route path="/locations/:siteId/photos" element={<ItemPhotos />} />
          <Route path="/locations/:siteId/project-images" element={<ProjectImages />} />
        </Routes>
      </BrowserRouter>
    </LoginGate>
  )
}

export default App
