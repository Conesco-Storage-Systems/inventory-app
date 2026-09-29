import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import GenerateCustomerSheetFlow, { type CustomerSheetSeed } from '../components/GenerateCustomerSheetFlow'
import { getSalesQuote, listLineItemsByQuote } from '../db/salesQuotes'

export default function GenerateQuoteCustomerSheet() {
  const { quoteId } = useParams<{ quoteId: string }>()
  const quote = useLiveQuery(() => (quoteId ? getSalesQuote(quoteId) : undefined), [quoteId])
  const lineItems = useLiveQuery(() => (quoteId ? listLineItemsByQuote(quoteId) : []), [quoteId]) ?? []

  if (quote === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!quote) {
    return (
      <main className="page">
        <p>Sales Quote not found.</p>
        <Link to="/sales-dashboard">Back to Sales Dashboard</Link>
      </main>
    )
  }

  const seeds: CustomerSheetSeed[] = lineItems.map((li) => ({
    key: li.id,
    itemType: li.itemType,
    siteId: li.siteId,
    siteName: li.siteName,
    itemIds: li.itemIds,
    quantity: li.quantityHeld,
    description: li.description,
  }))

  return (
    <GenerateCustomerSheetFlow
      seeds={seeds}
      backTo={`/sales-quotes/${quote.id}`}
      backLabel="Back to Quote"
      heading={`Generate Customer Sheet — Quote #${quote.quoteNumber}`}
      introText="Every item held on this quote is listed below — check the fields and photos you want the customer to see, or remove an item entirely. Generate a preview, then save it as a PDF — nothing here is saved anywhere in the app."
      emptyMessage="No items are being held on this quote."
      initialCustomerName={quote.customerName}
      initialCustomerAddress={quote.customerAddress}
    />
  )
}
