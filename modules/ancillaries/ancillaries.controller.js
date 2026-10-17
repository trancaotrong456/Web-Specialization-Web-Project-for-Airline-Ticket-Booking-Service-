'use strict';

class AncillariesController {
  constructor({ service } = {}) { if (!service) throw new TypeError('Ancillaries service is required'); this.service = service; }
  async listOffers(req, res, next) { try { res.json({ success: true, data: await this.service.listOffers(req.query) }); } catch (error) { next(error); } }
  async listServices(_req, res, next) { try { res.json({ success: true, data: await this.service.listServices() }); } catch (error) { next(error); } }
  async createService(req, res, next) { try { res.status(201).json({ success: true, data: await this.service.saveService(null, req.body) }); } catch (error) { next(error); } }
  async updateService(req, res, next) { try { res.json({ success: true, data: await this.service.saveService(req.params.id, req.body) }); } catch (error) { next(error); } }
  async deactivateService(req, res, next) { try { res.json({ success: true, data: await this.service.deactivateService(req.params.id) }); } catch (error) { next(error); } }
  async listOffersAdmin(_req, res, next) { try { res.json({ success: true, data: await this.service.repository.listOffers({ includeInactive: true }) }); } catch (error) { next(error); } }
  async createOffer(req, res, next) { try { res.status(201).json({ success: true, data: await this.service.saveOffer(null, req.body) }); } catch (error) { next(error); } }
  async updateOffer(req, res, next) { try { res.json({ success: true, data: await this.service.saveOffer(req.params.id, req.body) }); } catch (error) { next(error); } }
  async deactivateOffer(req, res, next) { try { res.json({ success: true, data: await this.service.deactivateOffer(req.params.id) }); } catch (error) { next(error); } }
}

module.exports = AncillariesController;
