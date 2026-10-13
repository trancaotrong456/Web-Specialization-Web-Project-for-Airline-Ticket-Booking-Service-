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
  create(data) { return this.repository.create(data); }
  async update(id, data) { const promo = await this.getById(id); return this.repository.update(promo, data); }
  async delete(id) { const promo = await this.getById(id); await this.repository.delete(promo); return { message: 'Promotion deleted' }; }
}
module.exports = PromotionService;
