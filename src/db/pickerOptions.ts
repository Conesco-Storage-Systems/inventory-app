import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import type { PickerFieldType } from '../models/types'

export async function listPickerOptions(fieldType: PickerFieldType): Promise<string[]> {
  const options = await db.pickerOptions.where('fieldType').equals(fieldType).sortBy('value')
  return options.map((option) => option.value)
}

export async function savePickerOption(fieldType: PickerFieldType, value: string): Promise<void> {
  const trimmed = value.trim()
  if (!trimmed) return

  const existing = await db.pickerOptions
    .where('[fieldType+value]')
    .equals([fieldType, trimmed])
    .first()
  if (existing) return

  await db.pickerOptions.add({
    id: uuidv4(),
    fieldType,
    value: trimmed,
    createdAt: Date.now(),
  })
}
