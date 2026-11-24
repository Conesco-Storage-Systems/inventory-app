import { Link } from 'react-router-dom'
import { useRole } from '../state/RoleContext'

export default function CountingTools() {
  const { permissions } = useRole()

  if (!permissions.viewCountingTools) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this.</p>
      </main>
    )
  }

  return (
    <main className="page">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Counting Tools</h1>
      <ul className="location-list">
        <li className="location-list-row">
          <div className="location-list-info">
            <Link to="/counting-tools/customer-count">Customer Count</Link>
          </div>
        </li>
        <li className="location-list-row">
          <div className="location-list-info">
            <Link to="/counting-tools/unloading-trucks">Unloading Trucks</Link>
          </div>
        </li>
        <li className="location-list-row">
          <div className="location-list-info">
            <Link to="/counting-tools/standing-racking">Standing Racking</Link>
          </div>
        </li>
      </ul>
    </main>
  )
}
