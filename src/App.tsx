import { useEffect } from 'react'
import { Route, BrowserRouter, Routes } from 'react-router-dom'
import LoginGate from './components/LoginGate'
import { purgeExpiredDeletedSites } from './db/locations'
import { purgeExpiredDeletedProjects } from './db/projects'
import AllInventory from './screens/AllInventory'
import InactiveLocations from './screens/InactiveLocations'
import InactiveProjects from './screens/InactiveProjects'
import ItemPhotos from './screens/ItemPhotos'
import LocationDetail from './screens/LocationDetail'
import LocationsList from './screens/LocationsList'
import NewBillOfLading from './screens/NewBillOfLading'
import NewCustomerSheet from './screens/NewCustomerSheet'
import NewItem from './screens/NewItem'
import ProjectDetail from './screens/ProjectDetail'
import ProjectImages from './screens/ProjectImages'
import RecentlyDeleted from './screens/RecentlyDeleted'
import RecentlyDeletedProjects from './screens/RecentlyDeletedProjects'
import ViewBillOfLading from './screens/ViewBillOfLading'
import ViewCustomerSheet from './screens/ViewCustomerSheet'
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
    purgeExpiredDeletedProjects()
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
          <Route path="/inactive-projects" element={<InactiveProjects />} />
          <Route path="/recently-deleted-projects" element={<RecentlyDeletedProjects />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/projects/:projectId/inventory" element={<AllInventory />} />
          <Route path="/locations/:siteId" element={<LocationDetail />} />
          <Route path="/locations/:siteId/items/new" element={<NewItem />} />
          <Route path="/locations/:siteId/bol/new" element={<NewBillOfLading />} />
          <Route path="/locations/:siteId/bol/:bolId" element={<ViewBillOfLading />} />
          <Route path="/locations/:siteId/customer-sheet/new" element={<NewCustomerSheet />} />
          <Route path="/locations/:siteId/customer-sheet/:sheetId" element={<ViewCustomerSheet />} />
          <Route path="/locations/:siteId/photos" element={<ItemPhotos />} />
          <Route path="/locations/:siteId/project-images" element={<ProjectImages />} />
        </Routes>
      </BrowserRouter>
    </LoginGate>
  )
}

export default App
