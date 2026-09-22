const { Op } = require('sequelize');
const { Promotion } = require('../models');

class PromotionService {
  async getAll({ page = 1, limit = 20, active_only = false }) {
    const where = {};
    if (active_only) {
      const now = new Date();
      where.valid_from = { [Op.lte]: now };
      where.valid_to = { [Op.gte]: now };
    }
    const { count, rows } = await Promotion.findAndCountAll({
      where,
      limit: Number(limit),
      offset: (page - 1) * limit,
      order: [['valid_from', 'DESC']],
    });
    return { total: count, page, limit, data: rows };
  }

  async getById(id) {
    const promo = await Promotion.findByPk(id);
    if (!promo) { const error = new Error('Promotion not found'); error.statusCode = 404; throw error; }
    return promo;
  }

  async validateCode(code) {
    const promo = await Promotion.findOne({ where: { code } });
    if (!promo) { const error = new Error('Promotion code not found'); error.statusCode = 404; throw error; }
    const now = new Date();
    if (now < new Date(promo.valid_from) || now > new Date(promo.valid_to)) {
      const error = new Error('Promotion code expired or not yet active'); error.statusCode = 400; throw error;
    }
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      const error = new Error('Promotion code usage limit reached'); error.statusCode = 400; throw error;
    }
    return promo;
  }

  async create(data) { return Promotion.create(data); }

  async update(id, data) {
    const promo = await this.getById(id);
    return promo.update(data);
  }

  async delete(id) {
    const promo = await this.getById(id);
    await promo.destroy();
    return { message: 'Promotion deleted' };
  }
}

module.exports = new PromotionService();
