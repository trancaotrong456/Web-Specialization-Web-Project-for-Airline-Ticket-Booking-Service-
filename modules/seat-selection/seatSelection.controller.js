'use strict';
class SeatSelectionController {
  constructor({ service } = {}) { if (!service) throw new TypeError('Seat selection service is required'); this.service = service; }
  async listTemplates(req, res, next) { try { res.json({ success: true, data: await this.service.listTemplates() }); } catch (e) { next(e); } }
  async createTemplate(req, res, next) { try { res.status(201).json({ success: true, data: await this.service.createTemplate(req.body) }); } catch (e) { next(e); } }
  async updateTemplate(req, res, next) { try { res.json({ success: true, data: await this.service.updateTemplate(req.params.id, req.body) }); } catch (e) { next(e); } }
  async deleteTemplate(req, res, next) { try { res.json({ success: true, data: await this.service.deleteTemplate(req.params.id) }); } catch (e) { next(e); } }
  async assignFlight(req, res, next) { try { res.json({ success: true, data: await this.service.assignTemplateToFlight(req.params.flightId, req.body.template_id, req.body.zone_fare_classes) }); } catch (e) { next(e); } }
  async getFlightMap(req, res, next) { try { res.json({ success: true, data: await this.service.getFlightMap(req.params.flightId) }); } catch (e) { next(e); } }
}
module.exports = SeatSelectionController;
