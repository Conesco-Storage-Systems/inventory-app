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
      <p className="existing-photos-note">More tools coming soon.</p>
    </main>
  )
}
