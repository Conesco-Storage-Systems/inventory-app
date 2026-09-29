import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import CreateSalesQuoteDialog from '../components/CreateSalesQuoteDialog'
import { listMySalesQuotes } from '../db/salesQuotes'
import { useRole } from '../state/RoleContext'

export default function SalesDashboard() {
  const { permissions, userId } = useRole()
  const quotes = useLiveQuery(() => (userId ? listMySalesQuotes(userId) : []), [userId]) ?? []

  if (!permissions.viewSalesDashboard) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this page.</p>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Sales Dashboard</h1>

      <nav className="tab-nav">
        <div className="tab-nav-tabs">
          <Link className="tab-nav-link" to="/all-inventory">
            Inventory
          </Link>
          <Link className="tab-nav-link" to="/projects">
            Projects
          </Link>
        </div>
      </nav>

      {permissions.holdItemsForOrder && (
        <p>
          <CreateSalesQuoteDialog />
        </p>
      )}

      <section className="item-section">
        <h2>Sales Quotes ({quotes.length})</h2>
        {quotes.length === 0 ? (
          <p className="placeholder-note">No sales quotes yet.</p>
        ) : (
          <ul className="location-list location-list--compact">
            {quotes.map((quote) => (
              <li key={quote.id} className="location-list-row">
                <div className="location-list-info">
                  <Link to={`/sales-quotes/${quote.id}`}>
                    {new Date(quote.createdAt).toLocaleDateString()} - Quote #{quote.quoteNumber}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
