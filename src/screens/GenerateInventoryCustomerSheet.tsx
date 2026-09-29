import { useLocation } from 'react-router-dom'
import GenerateCustomerSheetFlow, { type CustomerSheetSeed } from '../components/GenerateCustomerSheetFlow'

export default function GenerateInventoryCustomerSheet() {
  const location = useLocation()
  const state = location.state as { seeds?: CustomerSheetSeed[]; backTo?: string } | null
  const seeds = state?.seeds ?? []
  const backTo = state?.backTo ?? '/all-inventory'

  return (
    <GenerateCustomerSheetFlow
      seeds={seeds}
      backTo={backTo}
      backLabel="Back to Inventory"
      heading="Generate Customer Sheet"
      introText="Every item you checked is listed below — check the fields and photos you want the customer to see, or remove an item entirely. Generate a preview, then save it as a PDF — nothing here is saved anywhere in the app."
      emptyMessage="No items were selected."
    />
  )
}
