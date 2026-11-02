import { promotions, reviews, roomTypes, services } from './mockData';
import type { Promotion, Review, RoomType, ServiceItem, Role } from '../types';
import { getHotelDate } from '../utils/checkInCountdown';

export const USE_MOCK = false;

export async function getRoomTypes(): Promise<RoomType[]> {
  if (USE_MOCK) {
    return roomTypes;
  }

  const response = await fetch('/api/room-types');
  if (!response.ok) {
    throw new Error('Không thể tải loại phòng.');
  }
  return response.json();
}

export async function getActivePromotions(): Promise<Promotion[]> {
  if (USE_MOCK) {
    const today = getHotelDate(new Date());
    return promotions.filter((promotion) => promotion.is_active
      && promotion.valid_from.slice(0, 10) <= today
      && promotion.valid_to.slice(0, 10) >= today);
  }

  const response = await fetch('/api/promotions/active');
  if (!response.ok) {
    throw new Error('Không thể tải khuyến mãi.');
  }
  return response.json();
}

export async function getServices(): Promise<ServiceItem[]> {
  if (USE_MOCK) {
    return services.filter((service) => service.is_active);
  }

  const response = await fetch('/api/services?active=true');
  if (!response.ok) {
    throw new Error('Không thể tải dịch vụ.');
  }
  return response.json();
}

export async function getReviews(): Promise<Review[]> {
  if (USE_MOCK) {
    return reviews.filter((review) => !review.is_hidden);
  }

  const response = await fetch('/api/reviews?hidden=false');
  if (!response.ok) {
    throw new Error('Không thể tải đánh giá.');
  }
  return response.json();
}

export function getCurrentRoleFromQuery(): Role | null {
  const params = new URLSearchParams(window.location.search);
  const as = params.get('as');
  const validRoles: Role[] = ['CUSTOMER', 'RECEPTIONIST', 'HOUSEKEEPER', 'ADMIN'];
  return as && validRoles.includes(as as Role) ? (as as Role) : null;
}
