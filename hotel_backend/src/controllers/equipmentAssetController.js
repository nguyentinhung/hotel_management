const equipmentAssetService = require('../services/equipmentAssetService');

function isUniqueConflict(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 2601 || number === 2627);
}

function isForeignKeyConflict(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 547);
}

async function getEquipmentAssets(req, res) {
  try {
    const assets = await equipmentAssetService.getEquipmentAssets(req.params.equipmentItemId);
    if (!assets) return res.status(404).json({ message: 'Equipment type not found.' });
    return res.json(assets);
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Get equipment assets failed:', error);
    return res.status(500).json({ message: 'Unable to load physical equipment. Please try again.' });
  }
}

async function getEquipmentAsset(req, res) {
  try {
    const asset = await equipmentAssetService.getEquipmentAsset(req.params.equipmentItemId, req.params.assetId);
    if (!asset) return res.status(404).json({ message: 'Equipment asset not found for this equipment type.' });
    return res.json(asset);
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Get equipment asset failed:', error);
    return res.status(500).json({ message: 'Unable to load equipment asset details. Please try again.' });
  }
}

async function createEquipmentAsset(req, res) {
  try {
    const asset = await equipmentAssetService.createEquipmentAsset(req.params.equipmentItemId, req.body);
    if (!asset) return res.status(404).json({ message: 'Equipment type not found.' });
    return res.status(201).json(asset);
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    if (isUniqueConflict(error)) return res.status(409).json({ message: 'Asset code or serial number is already in use.' });
    console.error('Create equipment asset failed:', error);
    return res.status(500).json({ message: 'Unable to add physical equipment. Please try again.' });
  }
}

async function updateEquipmentAsset(req, res) {
  try {
    const asset = await equipmentAssetService.updateEquipmentAsset(req.params.equipmentItemId, req.params.assetId, req.body);
    if (!asset) return res.status(404).json({ message: 'Equipment asset not found for this equipment type.' });
    return res.json({ message: 'Equipment asset updated successfully.', equipmentAsset: asset });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    if (isUniqueConflict(error)) return res.status(409).json({ message: 'Asset code or serial number is already in use.' });
    console.error('Update equipment asset failed:', error);
    return res.status(500).json({ message: 'Unable to update physical equipment. Please try again.' });
  }
}

async function deleteEquipmentAsset(req, res) {
  try {
    const deletedId = await equipmentAssetService.deleteEquipmentAsset(req.params.equipmentItemId, req.params.assetId);
    if (deletedId == null) return res.status(404).json({ message: 'Equipment asset not found for this equipment type.' });
    return res.json({ message: 'Equipment asset deleted successfully.', id: deletedId });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    if (error.statusCode === 409) return res.status(409).json({ message: error.message });
    if (error.statusCode === 503) return res.status(503).json({ message: error.message });
    if (isForeignKeyConflict(error)) {
      return res.status(409).json({ message: 'Thiết bị đang được dữ liệu khác tham chiếu nên không thể xóa.' });
    }
    console.error('Delete equipment asset failed:', error);
    return res.status(500).json({ message: 'Không thể xóa thiết bị lúc này. Vui lòng thử lại.' });
  }
}

module.exports = { getEquipmentAssets, getEquipmentAsset, createEquipmentAsset, updateEquipmentAsset, deleteEquipmentAsset };
