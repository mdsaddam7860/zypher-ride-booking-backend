import { config } from "../config";

/**
 * Refund policy, based on time between cancellation and the ride's
 * scheduled departure:
 *  - >= 24h before departure: 100% refund
 *  - 12-24h before departure: 75% refund
 *  - < 12h before departure:  50% refund
 *  - after departure:         0% refund
 */
export function refundPercentFor(now: Date, scheduledStartAt: Date): number {
  const hoursUntilDeparture = (scheduledStartAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilDeparture < 0) return 0;
  if (hoursUntilDeparture >= config.cancellation.fullRefundHours) return 100;
  if (hoursUntilDeparture >= config.cancellation.partialRefundHours) {
    return config.cancellation.partialRefundPercent;
  }
  return config.cancellation.lateRefundPercent;
}

export function calculateRefundAmount(
  paidAmount: number,
  now: Date,
  scheduledStartAt: Date
): { percent: number; amount: number } {
  const percent = refundPercentFor(now, scheduledStartAt);
  const amount = Math.round(paidAmount * (percent / 100) * 100) / 100;
  return { percent, amount };
}
