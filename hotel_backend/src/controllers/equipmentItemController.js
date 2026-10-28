const equipmentItemService = require('../services/equipmentItemService');

async function getEquipmentItems(_req, res) {
  try {
    res.json(await equipmentItemService.getEquipmentItems());
  } catch (error) {
    console.error('Get equipment items failed:', error);
    res.status(500).json({ message: 'Unable to load equipment list. Please try again.' });
  }
}

async function getEquipmentItemById(req, res) {
  try {
    const item = await equipmentItemService.getEquipmentItemById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json(item);
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Get equipment item failed:', error);
    return res.status(500).json({ message: 'Unable to load equipment details. Please try again.' });
  }
}

async function createEquipmentItem(req, res) {
  try {
    const equipmentItem = await equipmentItemService.createEquipmentItem(req.body);
    res.status(201).json(equipmentItem);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create equipment item failed:', error);
    return res.status(500).json({ message: 'Unable to add equipment. Please try again.' });
  }
}

async function updateEquipmentItem(req, res) {
  try {
    const equipmentItem = await equipmentItemService.updateEquipmentItem(req.params.id, req.body);
    if (!equipmentItem) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json({ message: 'Equipment updated successfully.', equipmentItem });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Update equipment item failed:', error);
    return res.status(500).json({ message: 'Unable to update equipment. Please try again.' });
  }
}

function getForeignKeyMessage(error) {
  const messages = [
    error.message,
    error.originalError?.info?.message,
    error.originalError?.message,
    ...(Array.isArray(error.precedingErrors) ? error.precedingErrors.map((item) => item.message) : []),
  ].filter(Boolean).join(' ');
  if (/fk_rpr_equipment/i.test(messages)) {
    return 'This equipment cannot be deleted because it is referenced by room problem reports.';
  }
  return 'This equipment cannot be deleted because it is referenced by other records.';
}

async function deleteEquipmentItem(req, res) {
  try {
    const deletedId = await equipmentItemService.deleteEquipmentItem(req.params.id);
    if (deletedId == null) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json({ message: 'Equipment deleted successfully.', id: deletedId });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    if (error.number === 547 || error.originalError?.info?.number === 547) {
      return res.status(409).json({ message: getForeignKeyMessage(error) });
    }
    console.error('Delete equipment item failed:', error);
    return res.status(500).json({ message: 'Unable to delete equipment. Please try again.' });
  }
}

async function getEquipmentRooms(req, res) {
  try {
    const rooms = await equipmentItemService.getEquipmentRooms(req.params.id);
    if (!rooms) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json({ rooms });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Get equipment room assignments failed:', error);
    return res.status(500).json({ message: 'Unable to load room assignments.' });
  }
}

async function assignEquipmentToRooms(req, res) {
  try {
    const rooms = await equipmentItemService.assignEquipmentToRooms(req.params.id, req.body);
    if (!rooms) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json({ message: 'Equipment room assignments updated successfully.', rooms });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Assign equipment to rooms failed:', error);
    return res.status(500).json({ message: 'Unable to assign equipment to rooms.' });
  }
}

module.exports = { getEquipmentItems, getEquipmentItemById, createEquipmentItem, updateEquipmentItem, deleteEquipmentItem, getEquipmentRooms, assignEquipmentToRooms };
