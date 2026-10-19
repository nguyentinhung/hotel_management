const homeService = require('../services/homeService');
const { fetchHomeData } = homeService;

// Lấy dữ liệu tổng hợp cho trang chủ: room type, promotion, service, review
async function getHomeData(req, res) {
  try {
    const data = await fetchHomeData();
    res.json(data);
  } catch (error) {
    console.error('getHomeData error:', error);
    res.status(500).json({
      message: 'Không thể tải dữ liệu trang chủ từ SQL Server.',
      error: error.message,
    });
  }
}

// Lấy danh sách loại phòng để hiển thị lên homepage / room listing
async function getRoomTypes(req, res) {
  try {
    const roomTypes = await homeService.getRoomTypes();
    res.json(roomTypes.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      base_price: Number(item.base_price ?? 0),
      max_adults: item.max_adults ?? 0,
      max_children: item.max_children ?? 0,
      amenities: String(item.amenities || '').split(',').map((entry) => entry.trim()).filter(Boolean),
      amenity_ids: String(item.amenity_ids || '').split(',').map(Number).filter(Number.isInteger),
      image_url: item.image_url || null,
      average_rating: Number((item.average_rating ?? 0).toFixed(1)),
      review_count: Number(item.review_count ?? 0),
    })));
  } catch (error) {
    console.error('getRoomTypes error:', error);
    res.status(500).json({ message: 'Không thể tải loại phòng.', error: error.message });
  }
}

async function getRoomTypeDetails(req, res) {
  const roomTypeId = Number(req.params.roomTypeId);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
  }

  try {
    const roomType = await homeService.getRoomTypeDetails(roomTypeId);
    if (!roomType) {
      return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    }
    return res.json(roomType);
  } catch (error) {
    console.error('getRoomTypeDetails error:', error);
    return res.status(500).json({ message: 'Không thể tải chi tiết loại phòng.' });
  }
}

// Lấy thông tin khuyến mãi đang áp dụng để customer xem ở homepage
async function getPromotions(req, res) {
  try {
    const promotions = await homeService.getPromotions();
    res.json(promotions.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      discount_type: item.discount_type,
      discount_value: Number(item.discount_value ?? 0),
      max_discount: item.max_discount == null ? null : Number(item.max_discount),
      valid_from: item.valid_from,
      valid_to: item.valid_to,
      is_active: Boolean(item.is_active),
    })));
  } catch (error) {
    console.error('getPromotions error:', error);
    res.status(500).json({ message: 'Không thể tải ưu đãi.', error: error.message });
  }
}

// Lấy danh sách dịch vụ khách sạn để render lên landing page hoặc booking
async function getServices(req, res) {
  try {
    const activeOnly = req.query.active === 'true' || req.query.active === undefined;
    const services = await homeService.getServices(activeOnly);
    res.json(services.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: Number(item.price ?? 0),
      unit: item.unit,
      is_active: Boolean(item.is_active),
      booking_policy: item.booking_policy,
    })));
  } catch (error) {
    console.error('getServices error:', error);
    res.status(500).json({ message: 'Không thể tải dịch vụ.', error: error.message });
  }
}

async function getActiveServiceById(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Mã dịch vụ không hợp lệ.' });
  try {
    const item = await homeService.getActiveService(id);
    if (!item) return res.status(404).json({ message: 'Không tìm thấy dịch vụ đang hoạt động.' });
    return res.json({ ...item, price: Number(item.price ?? 0), is_active: Boolean(item.is_active) });
  } catch (error) {
    console.error('getActiveServiceById error:', error);
    return res.status(500).json({ message: 'Không thể tải chi tiết dịch vụ.' });
  }
}

// Lấy review từ khách hàng để hiện lên homepage hoặc trang chi tiết phòng
async function getReviews(req, res) {
  try {
    const reviews = await homeService.getReviews();
    res.json(reviews.map((item) => ({
      id: item.id,
      room_type_id: item.room_type_id,
      customer_name: item.customer_name,
      rating: Number(item.rating ?? 0),
      comment: item.comment,
      is_hidden: Boolean(item.is_hidden),
      room_type_name: item.room_type_name,
    })));
  } catch (error) {
    console.error('getReviews error:', error);
    res.status(500).json({ message: 'Không thể tải đánh giá.', error: error.message });
  }
}

module.exports = {
  getHomeData,
  getRoomTypes,
  getRoomTypeDetails,
  getPromotions,
  getServices,
  getActiveServiceById,
  getReviews,
};
