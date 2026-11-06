import { IcsImportDialog } from "./IcsImportDialog"
import { closeImport, importingPath, onImported } from "./ics-import"

/** Offers to import .ics files, one at a time. */
export function PendingIcsImport() {
  const paths = () => {
    const path = importingPath()
    return path ? [path] : []
  }
  return (
    <Each of={paths()}>
      {(path) => <IcsImportDialog path={path()} onClose={closeImport} onImported={onImported} />}
    </Each>
  )
}
