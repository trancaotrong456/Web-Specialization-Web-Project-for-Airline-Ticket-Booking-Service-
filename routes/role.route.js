const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  roleIdValidator,
  createRoleValidator,
  updateRoleValidator,
} = require('../validators/role.validator');

router.use(authenticate, authorize('admin'));
router.post('/', createRoleValidator, validate, roleController.createRole);
router.get('/', roleController.getAllRoles);
router.get('/:id', roleIdValidator, validate, roleController.getRoleById);
router.put('/:id', updateRoleValidator, validate, roleController.updateRole);
router.delete('/:id', roleIdValidator, validate, roleController.deleteRole);

module.exports = router;
