import { randomUUID } from "crypto";
import { Knex } from "knex";
import { db } from "../db/connection";
import { PaymentRow, RideRow } from "../types";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

/**
 * Thin wrapper around a payment gateway for "pay in advance" long-distance
 * rides. Swap `mockCharge`/`mockRefund` for a real provider (Razorpay/Stripe)
 * call — the rest of the flow (order creation, status bookkeeping, refunds
 * tied to the cancellation policy) stays the same.
 */
function mockCharge(): { success: boolean; providerRef: string } {
  return { success: true, providerRef: `mock_txn_${randomUUID()}` };
}

function mockRefund(providerRef: string, amount: number): { success: boolean; refundRef: string } {
  return { success: true, refundRef: `mock_refund_${providerRef}_${amount}` };
}

export const paymentService = {
  async createOrder(
    ride: RideRow,
    riderId: string,
    amount: number,
    currency: string,
    trx: Knex.Transaction
  ): Promise<PaymentRow> {
    const [payment] = await trx<PaymentRow>("payments")
      .insert({
        ride_id: ride.id,
        rider_id: riderId,
        amount,
        currency,
        status: "created",
        provider_ref: `pending_${randomUUID()}`,
      })
      .returning("*");
    return payment;
  },

  async confirmPayment(rideId: string, riderId: string): Promise<PaymentRow> {
    return db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.rider_id !== riderId) throw new BadRequestError("This is not your ride");
      if (ride.payment_method !== "advance") {
        throw new ConflictError("This ride does not require advance payment");
      }
      if (ride.payment_status === "paid") {
        throw new ConflictError("Ride is already paid for");
      }

      const payment = await trx<PaymentRow>("payments")
        .where({ ride_id: rideId })
        .orderBy("created_at", "desc")
        .first();
      if (!payment) throw new NotFoundError("No payment order found for this ride");

      const result = mockCharge();
      const [updatedPayment] = await trx<PaymentRow>("payments")
        .where({ id: payment.id })
        .update({
          status: result.success ? "paid" : "failed",
          provider_ref: result.providerRef,
          updated_at: new Date(),
        })
        .returning("*");

      await trx<RideRow>("rides")
        .where({ id: rideId })
        .update({ payment_status: result.success ? "paid" : "failed" });

      return updatedPayment;
    });
  },

  async refund(
    rideId: string,
    percent: number,
    amount: number,
    trx: Knex.Transaction
  ): Promise<PaymentRow | null> {
    const payment = await trx<PaymentRow>("payments")
      .where({ ride_id: rideId, status: "paid" })
      .orderBy("created_at", "desc")
      .first();
    if (!payment) return null;

    mockRefund(payment.provider_ref, amount);

    const [updated] = await trx<PaymentRow>("payments")
      .where({ id: payment.id })
      .update({
        status: percent >= 100 ? "refunded" : percent > 0 ? "partially_refunded" : payment.status,
        refund_amount: amount,
        updated_at: new Date(),
      })
      .returning("*");

    return updated;
  },
};
