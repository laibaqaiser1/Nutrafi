export type MealAgentIntent =
  | 'ADD_MEALS'
  | 'UPDATE_MEAL'
  | 'CONFIRM'
  | 'CANCEL'
  | 'NOT_MEAL'
  | 'AMBIGUOUS'
  | 'MEAL_PLAN_STATUS'
  | 'SKIP_DAY'

export interface IntentClassification {
  intent: MealAgentIntent
  isMealPlanRelated: boolean
  confidence: number
  reason?: string
}

export interface ParsedMealSlot {
  dateYmd: string
  dateSource: string
  slotIndex: number
  customerPhrase: string
  customNote?: string
}

export interface ParsedReplaceMeal {
  dateYmd: string
  dateSource: string
  removePhrase: string
  addPhrase: string
  customNote?: string
}

export interface MealMessageExtraction {
  kind: 'ADD' | 'UPDATE'
  meals: ParsedMealSlot[]
  replace?: ParsedReplaceMeal
}

export type ExtractionSource = 'openai' | 'rules'

export interface ParseMealResult {
  extraction: MealMessageExtraction
  source: ExtractionSource
  model?: string
  openAiRaw?: unknown
  openAiError?: string
}

export interface IntentClassificationResult {
  classification: IntentClassification
  source: ExtractionSource
  model?: string
  openAiRaw?: unknown
  openAiError?: string
}

export interface DishCandidate {
  dishId: number
  name: string
  score: number
}

export interface DishResolution {
  customerPhrase: string
  status: 'resolved' | 'needs_confirm' | 'no_match'
  confidence: number
  dishId?: number
  dishName?: string
  candidates: DishCandidate[]
}

export type PendingMealSlotStatus =
  | 'waiting_dish'
  | 'resolved'
  | 'applied'
  | 'no_match'

export interface PendingMealSlot {
  dateYmd: string
  slotIndex: number
  timeSlot: string
  customerPhrase: string
  customNote?: string
  status: PendingMealSlotStatus
  candidateDishIds?: number[]
  resolvedDishId?: number
  resolvedDishName?: string
  mealPlanItemId?: number
}

export interface PendingBatchContext {
  intent: 'ADD_MEALS' | 'UPDATE_MEAL'
  meals: PendingMealSlot[]
  currentQuestionIndex: number
  /** Conversation date context (e.g. customer said Monday, then sends dish names). */
  targetDateYmd?: string
  mealsPerDay?: number
  /** Waiting for the next meal slot on a day (e.g. after meal 1 of 2). */
  awaitingNextMeal?: {
    dateYmd: string
    mealsPerDay: number
  }
  replace?: ParsedReplaceMeal & {
    targetItemId?: number
    removeResolved?: boolean
  }
}

export interface AgentProcessResult {
  runId: number
  status: string
  replyBody?: string
}
