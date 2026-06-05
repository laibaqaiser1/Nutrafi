export function whatsappConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v25.0'
  const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()

  return {
    accessToken,
    phoneNumberId,
    apiVersion,
    webhookVerifyToken,
    isConfigured: Boolean(accessToken && phoneNumberId),
  }
}

export function whatsappGraphUrl(path: string): string {
  const { apiVersion } = whatsappConfig()
  return `https://graph.facebook.com/${apiVersion}/${path}`
}
