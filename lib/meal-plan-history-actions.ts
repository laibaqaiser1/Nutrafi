/** Stable action names for MealPlanHistory rows. */
export const MealPlanHistoryAction = {
  planCreated: 'plan_created',
  planEdited: 'plan_edited',
  itemAdded: 'item_added',
  itemUpdated: 'item_updated',
  itemDeleted: 'item_deleted',
  dayRemoved: 'day_removed',
  delivered: 'delivered',
  undelivered: 'undelivered',
  skipped: 'skipped',
  unskipped: 'unskipped',
  wrongDelivery: 'wrong_delivery',
  bulkSaved: 'bulk_saved',
} as const

export type MealPlanHistoryActionName =
  (typeof MealPlanHistoryAction)[keyof typeof MealPlanHistoryAction]
