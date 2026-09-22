'use strict';

const { Op, fn, col } = require('sequelize');
const { Payment } = require('../models');

class RevenueService {
  /**
   * Get revenue statistics by date range.
   *
   * Revenue rules:
   * - Only payments with status = success are counted.
   * - Refunded payments are excluded.
   * - paid_at is used as the revenue date.
   */
  async getRevenueStatistics({ from, to }) {
    const where = {
        status: 'success',
        paid_at: {
          [Op.not]: null,
        },
      };
      
      if (from) {
        where.paid_at[Op.gte] = `${from} 00:00:00`;
      }
      
      if (to) {
        const [year, month, day] = to.split('-').map(Number);
      
        const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
      
        const nextDayString = nextDay.toISOString().slice(0, 10);
      
        where.paid_at[Op.lt] = `${nextDayString} 00:00:00`;
      }

    // Total revenue and transaction count
    const summary = await Payment.findOne({
      attributes: [
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'total_revenue'],
        [fn('COUNT', col('id')), 'total_transactions'],
      ],
      where,
      raw: true,
    });

    // Revenue grouped by day
    const daily = await Payment.findAll({
      attributes: [
        [fn('DATE', col('paid_at')), 'date'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'revenue'],
        [fn('COUNT', col('id')), 'transactions'],
      ],
      where,
      group: [fn('DATE', col('paid_at'))],
      order: [[fn('DATE', col('paid_at')), 'ASC']],
      raw: true,
    });

    // Revenue grouped by payment method
    const byPaymentMethod = await Payment.findAll({
      attributes: [
        'payment_method',
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'revenue'],
        [fn('COUNT', col('id')), 'transactions'],
      ],
      where,
      group: ['payment_method'],
      order: [['payment_method', 'ASC']],
      raw: true,
    });

    return {
      total_revenue: Number(summary?.total_revenue || 0),
      total_transactions: Number(summary?.total_transactions || 0),

      daily: daily.map((item) => ({
        date: item.date,
        revenue: Number(item.revenue || 0),
        transactions: Number(item.transactions || 0),
      })),

      by_payment_method: byPaymentMethod.map((item) => ({
        payment_method: item.payment_method,
        revenue: Number(item.revenue || 0),
        transactions: Number(item.transactions || 0),
      })),
    };
  }
}

module.exports = new RevenueService();