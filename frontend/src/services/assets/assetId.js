// Transitional client-generated identifier for the current API contract.
// The future asset API must allocate and return immutable IDs on the server.
export function createAssetDraftId() {
  return `AST-${crypto.randomUUID().toUpperCase()}`
}
