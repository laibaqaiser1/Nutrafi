export function whatsappAgentConfig() {
  const enabled = process.env.WHATSAPP_AGENT_ENABLED?.trim() !== 'false'
  const supportPhone =
    process.env.WHATSAPP_SUPPORT_PHONE?.trim() || '971000000000'
  const dishAutoConfidence = parseFloat(
    process.env.WHATSAPP_AGENT_DISH_CONFIDENCE_AUTO ?? '0.8'
  )
  const dishMinConfidence = parseFloat(
    process.env.WHATSAPP_AGENT_DISH_CONFIDENCE_MIN ?? '0.5'
  )
  const openAiKey = process.env.OPENAI_API_KEY?.trim()
  const openAiModel = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const pendingExpiryHours = parseInt(
    process.env.WHATSAPP_AGENT_PENDING_EXPIRY_HOURS ?? '24',
    10
  )
  const timezone = process.env.WHATSAPP_AGENT_TIMEZONE?.trim() || 'Asia/Dubai'
  const cronSecret = process.env.WHATSAPP_AGENT_CRON_SECRET?.trim()

  const requireOpenAiExplicit = process.env.WHATSAPP_AGENT_REQUIRE_OPENAI?.trim()
  const requireOpenAi =
    requireOpenAiExplicit === 'true' ||
    (requireOpenAiExplicit !== 'false' &&
      process.env.NODE_ENV === 'production')

  return {
    enabled,
    supportPhone,
    dishAutoConfidence: Number.isFinite(dishAutoConfidence)
      ? dishAutoConfidence
      : 0.8,
    dishMinConfidence: Number.isFinite(dishMinConfidence)
      ? dishMinConfidence
      : 0.5,
    openAiKey,
    openAiModel,
    requireOpenAi,
    pendingExpiryHours: Number.isFinite(pendingExpiryHours)
      ? pendingExpiryHours
      : 24,
    timezone,
    cronSecret,
  }
}
