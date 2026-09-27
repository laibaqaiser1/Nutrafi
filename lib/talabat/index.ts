/**
 * Talabat integration (placeholder).
 *
 * Decide later: Partner API historic pull vs webhook ingest vs POS Order Report.
 * Keep all Talabat client/auth/mappers under `lib/talabat/` and routes under `app/api/talabat/`.
 */

export type TalabatIntegrationStatus = 'not_configured'

export function getTalabatIntegrationStatus(): TalabatIntegrationStatus {
  return 'not_configured'
}
