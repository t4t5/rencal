// Identity of a single agenda row: an event keyed by the day section it renders
// in, since a multi-day event appears in several sections and `eventKey` alone
// wouldn't pick out one row. Format `${dateKey}::${eventKey}`, where dateKey is
// YYYY-MM-DD and so never contains "::".

export function makeAgendaItemId(dateKey: string, eventKey: string): string {
  return `${dateKey}::${eventKey}`
}

export function eventKeyFromAgendaItemId(itemId: string): string {
  return itemId.slice(itemId.indexOf("::") + 2)
}
