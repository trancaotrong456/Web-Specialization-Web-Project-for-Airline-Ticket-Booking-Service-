'use strict';

const PROMOTION_SPECS = Object.freeze([
  { code: 'WELCOME10', discount_type: 'percent', discount_value: 10 },
  { code: 'HANSGN15', discount_type: 'percent', discount_value: 15 },
  { code: 'TRIP20', discount_type: 'percent', discount_value: 20 },
  { code: 'SKY25', discount_type: 'percent', discount_value: 25 },
  { code: 'WEEKDAY30', discount_type: 'percent', discount_value: 30 },
  { code: 'FLY50K', discount_type: 'amount', discount_value: 50000 },
  { code: 'ROUTE100K', discount_type: 'amount', discount_value: 100000 },
  { code: 'CABIN150K', discount_type: 'amount', discount_value: 150000 },
  { code: 'TRAVEL200K', discount_type: 'amount', discount_value: 200000 },
  { code: 'SKY250K', discount_type: 'amount', discount_value: 250000 },
]);

function buildPromotions(now) {
  const validFrom = new Date(now.getTime() - 60_000);
  const validTo = new Date(now.getTime() + 90 * 86_400_000);
  return PROMOTION_SPECS.map((promotion) => ({
    ...promotion, valid_from: validFrom, valid_to: validTo, max_uses: 100, used_count: 0,
  }));
}

async function plan({ models, transaction, promotions }) {
  const missing = [];
  const existingByCode = {};
  let existing = 0;
  for (const promotion of promotions) {
    const current = await models.Promotion.findOne({ where: { code: promotion.code }, ...(transaction ? { transaction } : {}) });
    if (current) {
      existing += 1;
      existingByCode[promotion.code] = current;
    }
    else missing.push(promotion);
  }
  return { existing, existingByCode, missing };
}

async function seed({ models, transaction, promotions }) {
  for (const promotion of promotions) {
    const { code, discount_type, discount_value, valid_from, valid_to, max_uses } = promotion;
    await models.Promotion.create({ code, discount_type, discount_value, valid_from, valid_to, max_uses, used_count: 0 }, { ...(transaction ? { transaction } : {}) });
  }
  return promotions.length;
}

module.exports = { PROMOTION_SPECS, buildPromotions, plan, seed };
