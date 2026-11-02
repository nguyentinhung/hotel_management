const equipmentItemService = require('../services/equipmentItemService');

async function getEquipmentItems(_req, res) {
  try {
    res.json(toEquipmentListResponse(await equipmentItemService.getEquipmentItems()));
  } catch (error) {
    console.error('Get equipment items failed:', error);
    res.status(500).json({ message: 'Unable to load equipment list. Please try again.' });
  }
}

async function getEquipmentItemById(req, res) {
  try {
    const item = await equipmentItemService.getEquipmentItemById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json(toEquipmentDetailsResponse(item));
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Get equipment item failed:', error);
    return res.status(500).json({ message: 'Unable to load equipment details. Please try again.' });
  }
}

const { toAddEquipmentRequest } = require('../dto/equipment/add-equipment/add-equipment-request.dto');
const { toUpdateEquipmentRequest } = require('../dto/equipment/update-equipment/update-equipment-request.dto');
const { toAssignEquipmentRoomsRequest } = require('../dto/equipment/assign-equipment-rooms/assign-equipment-rooms-request.dto');
const { toEquipmentListResponse } = require('../dto/equipment/view-equipment-list/equipment-list-response.dto');
const { toEquipmentDetailsResponse } = require('../dto/equipment/view-equipment-details/equipment-details-response.dto');
const { toAddEquipmentResponse } = require('../dto/equipment/add-equipment/add-equipment-response.dto');
const { toUpdateEquipmentResponse } = require('../dto/equipment/update-equipment/update-equipment-response.dto');
const { toDeleteEquipmentResponse } = require('../dto/equipment/delete-equipment/delete-equipment-response.dto');
const { toAssignEquipmentRoomsResponse } = require('../dto/equipment/assign-equipment-rooms/assign-equipment-rooms-response.dto');

async function createEquipmentItem(req, res) {
  try {
    const equipmentItem = await equipmentItemService.createEquipmentItem(toAddEquipmentRequest(req.body));
    res.status(201).json(toAddEquipmentResponse(equipmentItem));
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    if (error.number === 2601 || error.number === 2627
      || error.originalError?.info?.number === 2601 || error.originalError?.info?.number === 2627) {
      return res.status(409).json({ message: 'Tên thiết bị này đã tồn tại. Vui lòng chọn tên khác.' });
    }
    console.error('Create equipment item failed:', error);
    return res.status(500).json({ message: 'Unable to add equipment. Please try again.' });
  }
}

async function updateEquipmentItem(req, res) {
  try {
    const equipmentItem = await equipmentItemService.updateEquipmentItem(req.params.id, toUpdateEquipmentRequest(req.body));
    if (!equipmentItem) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json(toUpdateEquipmentResponse(equipmentItem));
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
    return res.json(toDeleteEquipmentResponse(deletedId));
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
    const rooms = await equipmentItemService.assignEquipmentToRooms(req.params.id, toAssignEquipmentRoomsRequest(req.body));
    if (!rooms) return res.status(404).json({ message: 'Equipment not found.' });
    return res.json(toAssignEquipmentRoomsResponse(rooms));
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Assign equipment to rooms failed:', error);
    return res.status(500).json({ message: 'Unable to assign equipment to rooms.' });
  }
}

module.exports = { getEquipmentItems, getEquipmentItemById, createEquipmentItem, updateEquipmentItem, deleteEquipmentItem, getEquipmentRooms, assignEquipmentToRooms };
