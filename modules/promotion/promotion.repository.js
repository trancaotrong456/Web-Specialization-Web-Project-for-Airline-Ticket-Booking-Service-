class SequelizePromotionRepository {
  constructor({ Promotion, Op } = {}) {
    if (!Promotion || !Op) throw new TypeError('Promotion and Sequelize Op are required');
    this.Promotion = Promotion;
    this.Op = Op;
  }
  findPage({ page, limit, active_only, now }) {
    const where = {};
    if (active_only) {
      where.valid_from = { [this.Op.lte]: now };
      where.valid_to = { [this.Op.gte]: now };
    }
    return this.Promotion.findAndCountAll({ where, limit: Number(limit), offset: (page - 1) * limit, order: [['valid_from', 'DESC']] });
  }
  findById(id) { return this.Promotion.findByPk(id); }
  findByCode(code) { return this.Promotion.findOne({ where: { code } }); }
  create(data) { return this.Promotion.create(data); }
  update(promotion, data) { return promotion.update(data); }
  delete(promotion) { return promotion.destroy(); }
}
module.exports = { SequelizePromotionRepository };
