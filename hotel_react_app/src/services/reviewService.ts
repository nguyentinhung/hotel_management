import api from './api';
import type { Review, ReviewBooking } from '../types';

const token = () => localStorage.getItem('accessToken') || undefined;

export const getDashboardReviews = () =>
  api.get<{ reviews: Review[] }>('/api/reviews/dashboard', token()).then((result) => result.reviews);

export const getMyReviewBookings = () =>
  api.get<{ bookings: ReviewBooking[] }>('/api/reviews/my-bookings', token()).then((result) => result.bookings);

export const getMyReview = (reviewId: number) =>
  api.get<Review>(`/api/reviews/mine/${reviewId}`, token());

export const createReview = (bookingId: number, rating: number, comment: string) =>
  api.post<Review>('/api/reviews', { booking_id: bookingId, rating, comment }, token());

export const updateReview = (reviewId: number, rating: number, comment: string) =>
  api.putWithAuth<Review>(`/api/reviews/mine/${reviewId}`, { rating, comment }, token());

export const deleteReview = (reviewId: number) =>
  api.deleteWithAuth<{ message: string }>(`/api/reviews/${reviewId}`, token());

export const deleteMyReview = (reviewId: number) =>
  api.deleteWithAuth<{ message: string }>(`/api/reviews/mine/${reviewId}`, token());
