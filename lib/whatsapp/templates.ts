/** Approved Meta template names (create in WhatsApp Manager first). */
export const WHATSAPP_TEMPLATES = {
  /** Utility — prompt customer to add meals for the next day. Variables: name, date */
  daily_meals_reminder: 'daily_meals_reminder',
} as const

export type WhatsAppTemplateName =
  (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES]

/** Default language code used when creating templates in Meta. */
export const WHATSAPP_TEMPLATE_LANGUAGE = 'en'

/**
 * Copy/paste reference for WhatsApp Manager → Create template.
 * Category: UTILITY · Language: English
 */
export const ADD_MEALS_REMINDER_TEMPLATE = {
  name: WHATSAPP_TEMPLATES.daily_meals_reminder,
  category: 'UTILITY' as const,
  language: WHATSAPP_TEMPLATE_LANGUAGE,
  body: `Hello {{1}},

This is a reminder from Nutrafi Kitchen to add your meals for tomorrow, {{2}}.

Reply to this message and our team will help you add your meals.

— Nutrafi Kitchen`,
  /** Sample values for Meta approval form */
  samples: {
    customerName: 'Sarah',
    tomorrowDate: 'Friday, 17 June 2026',
  },
}
