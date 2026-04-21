
const express = require('express');
const router = express.Router();
const addressController = require('../controllers/Addresscontroller');
const { auth } = require('../middleware/auth');
const { attachBranchToRequest, resolveBranchContext } = require('../middleware/branchContext');

const branchCtx = [auth, attachBranchToRequest, resolveBranchContext];

router.get('/', ...branchCtx, addressController.getSavedAddresses);
router.post('/', ...branchCtx, addressController.saveAddress);
router.put('/:addressId', ...branchCtx, addressController.updateAddress);
router.delete('/:addressId', ...branchCtx, addressController.deleteAddress);
router.patch('/:addressId/default', ...branchCtx, addressController.setDefaultAddress);
router.post('/validate', ...branchCtx, addressController.validateAddress);
router.get('/autocomplete', ...branchCtx, addressController.getAddressAutocomplete);
router.get('/place-details', ...branchCtx, addressController.getPlaceDetails);

module.exports = router;
