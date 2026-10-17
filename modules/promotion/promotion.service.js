const WRITABLE_FIELDS = ['code', 'discount_type', 'discount_value', 'valid_from', 'valid_to', 'max_uses'];

const pickWritableFields = (data = {}) => Object.fromEntries(
  WRITABLE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(data, field))
    .map((field) => [field, data[field]])
);

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
};

const validatePromotionValues = (values) => {
  if (typeof values.code !== 'string' || !values.code.trim() || values.code.trim().length > 30) {
    throw createValidationError('Promotion code is required and must not exceed 30 characters');
  }
  if (!['percent', 'amount'].includes(values.discount_type)) {
    throw createValidationError('discount_type must be percent or amount');
  }

  const discountValue = Number(values.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw createValidationError('discount_value must be greater than 0');
  }
  if (values.discount_type === 'percent' && discountValue > 100) {
    throw createValidationError('Percent discount_value must not exceed 100');
  }

  const validFrom = new Date(values.valid_from);
  const validTo = new Date(values.valid_to);
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
    throw createValidationError('Promotion validity dates are invalid');
  }
  if (validTo.getTime() <= validFrom.getTime()) {
    throw createValidationError('valid_to must be after valid_from');
  }
  if (values.max_uses !== null && values.max_uses !== undefined
    && (!Number.isInteger(Number(values.max_uses)) || Number(values.max_uses) < 1)) {
    throw createValidationError('max_uses must be a positive integer or null');
  }

  return {
    ...values,
    code: values.code.trim(),
    discount_value: discountValue,
    max_uses: values.max_uses === null || values.max_uses === undefined
      ? values.max_uses
      : Number(values.max_uses),
  };
};

class PromotionService {
  constructor({ repository, now = () => new Date() } = {}) {
    if (!repository) throw new TypeError('A Promotion repository is required');
    this.repository = repository;
    this.now = now;
  }
  async getAll({ page = 1, limit = 20, active_only = false }) {
    const { count, rows } = await this.repository.findPage({ page, limit, active_only, now: active_only ? this.now() : undefined });
    return { total: count, page, limit, data: rows };
  }
  async getById(id) {
    const promo = await this.repository.findById(id);
    if (!promo) { const error = new Error('Promotion not found'); error.statusCode = 404; throw error; }
    return promo;
  }
  async validateCode(code) {
    const promo = await this.repository.findByCode(code);
    if (!promo) { const error = new Error('Promotion code not found'); error.statusCode = 404; throw error; }
    const now = this.now();
    if (now < new Date(promo.valid_from) || now > new Date(promo.valid_to)) {
      const error = new Error('Promotion code expired or not yet active'); error.statusCode = 400; throw error;
    }
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      const error = new Error('Promotion code usage limit reached'); error.statusCode = 400; throw error;
    }
    return promo;
  }
  async create(data) {
    return this.repository.create(validatePromotionValues(pickWritableFields(data)));
  }
  async update(id, data) {
    const promo = await this.getById(id);
    const updates = pickWritableFields(data);
    if (Object.keys(updates).length === 0) {
      throw createValidationError('At least one promotion field is required');
    }
    const current = typeof promo.get === 'function' ? promo.get({ plain: true }) : promo;
    const validated = validatePromotionValues({ ...current, ...updates });
    const normalizedUpdates = Object.fromEntries(
      Object.keys(updates).map((field) => [field, validated[field]])
    );
    return this.repository.update(promo, normalizedUpdates);
  }
  async delete(id) { const promo = await this.getById(id); await this.repository.delete(promo); return { message: 'Promotion deleted' }; }
}
module.exports = PromotionService;
