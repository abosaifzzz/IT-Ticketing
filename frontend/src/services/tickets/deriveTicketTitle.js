// The API still requires a title; employees enter only a description.
export function deriveTicketTitle(description) {
  return description.trim().normalize('NFC').replace(/\s+/g, ' ').slice(0, 200).trim()
}
