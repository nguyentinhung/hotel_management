import React, { useEffect, useMemo, useState } from 'react';
import {
  checkRoomAvailability,
  checkInBooking,
  getAssignableRooms,
  assignRoomToBooking,
  getActiveBookings,
  getBookingHistory,
  cancelBooking,
  createWalkInBooking,
  updateBooking,
} from '../services/roomService';
import type {
  AvailableRoom,
  RecentBooking,
  RoomAvailabilityItem,
  ServiceItem,
  WalkInBookingPayload,
} from '../types';
import BookingServicePanel from './BookingServicePanel';
import BookingRoomSelectionEditor, { type BookingRoomSelection } from './BookingRoomSelectionEditor';
import { createReceptionCheckout, createReceptionInvoice, getInvoiceDetails } from '../services/paymentService';
import type { InvoiceDetail } from '../services/paymentService';
import CheckoutPaymentSuccessModal, { type CheckoutPaymentSuccess } from './CheckoutPaymentSuccessModal';
import { getActivePromotions, getServices } from '../services/homeService';
import { validatePromotion } from '../services/promotionValidationService';
import type { Promotion } from '../types/Promotion';
import { useToast } from './ToastProvider';
import DataTable from './DataTable';

/**
 * ============================================================================
 * COMPONENT: QUẢN LÝ PHÒNG TRỐNG & ĐẶT PHÒNG TẠI QUẦY (RECEPTION ROOM BOOKING)
 * ============================================================================
 * Dành riêng cho tài khoản Lễ tân (Receptionist) trên Dashboard để:
 * 1. Kiểm tra danh sách loại phòng nào còn trống theo ngày khách yêu cầu (Check Room Availability).
 * 2. Xem các số phòng vật lý cụ thể đang sẵn sàng đón khách (VD: Phòng 101, Phòng 202).
 * 3. Mở form/modal đặt phòng trực tiếp cho khách vãng lai (walk-in guest) tới tại quầy lễ tân.
 * 4. Hỗ trợ lễ tân chọn số phòng, nhập CCCD/CMND, thu tiền cọc, và check-in ngay lập tức.
 * 5. Xem danh sách các đơn đặt phòng vừa tạo để đối soát tức thì.
 */

// Định dạng ngày thành chuỗi YYYY-MM-DD
const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

// Cộng thêm ngày
const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateInput(d);
};

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

// Tính số đêm giữa 2 ngày
const calculateNights = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const overdueDecisionStorageKey = 'hotelManagement.reception.overdueBookingDecisions';
const vietnamUtcOffsetMs = 7 * 60 * 60 * 1000;

function loadHandledOverdueBookingIds() {
  try {
    const saved = localStorage.getItem(overdueDecisionStorageKey);
    const ids: unknown = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      throw new Error('Saved overdue-booking decisions have an invalid format.');
    }
    return new Set<string>(ids);
  } catch (error) {
    console.error('Could not load handled overdue-booking decisions:', error);
    return new Set<string>();
  }
}

function getVietnamToday(date: Date) {
  return new Date(date.getTime() + vietnamUtcOffsetMs).toISOString().slice(0, 10);
}

function getVietnamCheckInCutoffUtc(date: Date) {
  const today = getVietnamToday(date);
  return Date.parse(`${today}T11:00:00.000Z`);
}

function getVietnamCheckoutCutoffUtc(date: string) {
  return Date.parse(`${date}T05:00:00.000Z`);
}

function formatVietnamDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function getDepositPaymentStatus(booking: RecentBooking) {
  const statusLabels = {
    NOT_REQUIRED: 'Không yêu cầu đặt cọc',
    PAID: 'Đã thanh toán đủ cọc',
    PENDING: 'Thanh toán cọc đang chờ',
    PARTIAL: 'Đã thanh toán một phần',
    FAILED: 'Thanh toán cọc thất bại',
    UNPAID: 'Chưa thanh toán cọc',
  };
  return booking.deposit_payment_status
    ? statusLabels[booking.deposit_payment_status]
    : Number(booking.deposit_amount) >= Number(booking.required_deposit_amount || 0)
      ? 'Đã thanh toán đủ cọc'
      : 'Chưa thanh toán đủ cọc';
}

function getBookingRoomSelections(booking: RecentBooking): BookingRoomSelection[] {
  return booking.room_selections?.map(({ room_type_id, quantity }) => ({ room_type_id, quantity }))
    || (booking.room_type_id ? [{ room_type_id: booking.room_type_id, quantity: 1 }] : []);
}

type ReceptionBookingMode = 'management' | 'checkin' | 'checkout';

export default function ReceptionRoomBooking({
  mode = 'management',
  onViewBookingHistory,
}: {
  mode?: ReceptionBookingMode;
  onViewBookingHistory?: () => void;
}) {
  const { showToast } = useToast();
  const today = useMemo(() => formatDateInput(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  // --- STATE TÌM KIẾM & KIỂM TRA PHÒNG TRỐNG ---
  const [checkInDate, setCheckInDate] = useState<string>(today);
  const [checkOutDate, setCheckOutDate] = useState<string>(tomorrow);
  const [adults, setAdults] = useState<number>(2);
  const [children, setChildren] = useState<number>(0);

  // Danh sách loại phòng kèm tình trạng phòng trống lấy từ SQL Server
  const [availabilityList, setAvailabilityList] = useState<RoomAvailabilityItem[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // Bộ lọc phụ: Chỉ hiển thị các loại phòng còn trống
  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState<boolean>(false);

  // --- STATE MODAL ĐẶT PHÒNG TẠI QUẦY (WALK-IN) ---
  const [selectedRoomType, setSelectedRoomType] = useState<RoomAvailabilityItem | null>(null);
  const [additionalWalkInTypes, setAdditionalWalkInTypes] = useState<RoomAvailabilityItem[]>([]);
  const [additionalWalkInRoomIds, setAdditionalWalkInRoomIds] = useState<Record<number, string>>({});
  const [serviceOptions, setServiceOptions] = useState<ServiceItem[]>([]);
  const [walkInPromotions, setWalkInPromotions] = useState<Promotion[]>([]);
  const [walkInPromotionId, setWalkInPromotionId] = useState('');
  const [walkInPromotionCode, setWalkInPromotionCode] = useState('');
  const [walkInAppliedPromotion, setWalkInAppliedPromotion] = useState<{ code: string; discount_amount: number; subtotal: number } | null>(null);
  const [walkInPromotionMessage, setWalkInPromotionMessage] = useState('Chọn promotion hoặc nhập mã để áp dụng.');
  const [isWalkInPromotionModalOpen, setIsWalkInPromotionModalOpen] = useState(false);
  const [isApplyingWalkInPromotion, setIsApplyingWalkInPromotion] = useState(false);
  const [walkInPromotionLoadError, setWalkInPromotionLoadError] = useState('');
  const [selectedServiceQuantities, setSelectedServiceQuantities] = useState<Record<number, number>>({});
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isRoomPickerOpen, setIsRoomPickerOpen] = useState(false);
  const [pickerRoomQuantities, setPickerRoomQuantities] = useState<Record<number, number>>({});
  const [walkInForm, setWalkInForm] = useState<{
    guest_full_name: string;
    guest_phone: string;
    guest_email: string;
    guest_id_card: string;
    room_id: string; // ID phòng vật lý được chọn (chuỗi rỗng = auto)
    deposit_amount: number;
    check_in_now: boolean;
    special_request: string;
  }>({
    guest_full_name: '',
    guest_phone: '',
    guest_email: '',
    guest_id_card: '',
    room_id: '',
    deposit_amount: 0,
    check_in_now: true,
    special_request: '',
  });
  const [isSubmittingBooking, setIsSubmittingBooking] = useState<boolean>(false);

  // --- STATE DANH SÁCH ĐẶT PHÒNG GẦN ĐÂY ---
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [recentBookingsError, setRecentBookingsError] = useState<string | null>(null);
  const [checkInFilterDate, setCheckInFilterDate] = useState('');
  const [checkInFilterQuery, setCheckInFilterQuery] = useState('');
  const [appliedCheckInFilters, setAppliedCheckInFilters] = useState({ date: '', query: '' });
  const [managementBookings, setManagementBookings] = useState<RecentBooking[]>([]);
  const [managementQuery, setManagementQuery] = useState('');
  const [managementDateFrom, setManagementDateFrom] = useState('');
  const [managementDateTo, setManagementDateTo] = useState('');
  const [managementStatus, setManagementStatus] = useState('ALL');
  const [managementPaymentStatus, setManagementPaymentStatus] = useState('ALL');
  const [managementPage, setManagementPage] = useState(1);
  const [isCreateBookingOpen, setIsCreateBookingOpen] = useState(false);
  const [bookingHistory, setBookingHistory] = useState<RecentBooking[]>([]);
  const [handledOverdueBookingIds, setHandledOverdueBookingIds] = useState<Set<string>>(loadHandledOverdueBookingIds);
  const [attentionNow, setAttentionNow] = useState(() => new Date());
  const [isLoadingAttentionBookings, setIsLoadingAttentionBookings] = useState(false);
  const [attentionBookingsError, setAttentionBookingsError] = useState<string | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<RecentBooking | null>(null);
  const [isCancellingBooking, setIsCancellingBooking] = useState(false);
  const [attentionCancellationError, setAttentionCancellationError] = useState<string | null>(null);
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<RecentBooking | null>(null);
  const [isEditingSelectedBooking, setIsEditingSelectedBooking] = useState(false);
  const [isUpdatingSelectedBooking, setIsUpdatingSelectedBooking] = useState(false);
  const [isCancellingSelectedBooking, setIsCancellingSelectedBooking] = useState(false);
  const [selectedBookingDraft, setSelectedBookingDraft] = useState({
    check_in_date: '',
    check_out_date: '',
    guest_full_name: '',
    guest_phone: '',
    guest_email: '',
    adults: 1,
    children: 0,
    special_request: '',
    room_selections: [] as BookingRoomSelection[],
  });
  const [selectedBookingRoomOptions, setSelectedBookingRoomOptions] = useState<RoomAvailabilityItem[]>([]);
  const [isCheckingSelectedBookingRooms, setIsCheckingSelectedBookingRooms] = useState(false);
  const [selectedBookingRoomError, setSelectedBookingRoomError] = useState<string | null>(null);
  const selectedBookingAdultsCapacity = selectedBookingDraft.room_selections.reduce((sum, selection) =>
    sum + (selectedBookingRoomOptions.find((option) => option.id === selection.room_type_id)?.max_adults || 0) * selection.quantity, 0);
  const selectedBookingChildrenCapacity = selectedBookingDraft.room_selections.reduce((sum, selection) =>
    sum + (selectedBookingRoomOptions.find((option) => option.id === selection.room_type_id)?.max_children || 0) * selection.quantity, 0);
  const selectedBookingReservedSelections = selectedBookingDetail
    && Number(selectedBookingDetail.deposit_amount) >= Number(selectedBookingDetail.required_deposit_amount || 0)
    ? getBookingRoomSelections(selectedBookingDetail)
    : [];
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(false);
  const [selectedCheckInBooking, setSelectedCheckInBooking] = useState<RecentBooking | null>(null);
  const [checkInRoomSlots, setCheckInRoomSlots] = useState<Awaited<ReturnType<typeof getAssignableRooms>>['room_slots']>([]);
  const [checkInRoomIds, setCheckInRoomIds] = useState<Record<number, string>>({});
  const [isLoadingCheckInRooms, setIsLoadingCheckInRooms] = useState(false);
  const [checkInIdCard, setCheckInIdCard] = useState('');
  const [hasVerifiedOriginalId, setHasVerifiedOriginalId] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState<string | number | null>(null);
  const [selectedCheckOutBooking, setSelectedCheckOutBooking] = useState<RecentBooking | null>(null);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{ detail: InvoiceDetail; created: boolean } | null>(null);
  const [checkOutPaymentMethod, setCheckOutPaymentMethod] = useState<'CASH' | 'VNPAY'>('CASH');
  const [checkOutPaymentNote, setCheckOutPaymentNote] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [cashTenderError, setCashTenderError] = useState('');
  const vnpayEnabled = import.meta.env.VITE_VNPAY_ENABLED === 'true';
  const [checkoutSuccess, setCheckoutSuccess] = useState<CheckoutPaymentSuccess | null>(null);

  const vietnamToday = getVietnamToday(attentionNow);
  const overdueCheckInCutoffUtc = getVietnamCheckInCutoffUtc(attentionNow);
  const overdueBookings = bookingHistory.filter((booking) => {
    return booking.status === 'CONFIRMED'
      && String(booking.check_in_date).slice(0, 10) === vietnamToday
      && attentionNow.getTime() >= overdueCheckInCutoffUtc
      && !handledOverdueBookingIds.has(String(booking.id));
  });
  const overdueCheckoutBookings = managementBookings.filter((booking) => {
    const checkOutDate = String(booking.check_out_date).slice(0, 10);
    const checkoutCutoff = getVietnamCheckoutCutoffUtc(checkOutDate);
    return booking.status === 'CHECKED_IN'
      && Number.isFinite(checkoutCutoff)
      && attentionNow.getTime() >= checkoutCutoff;
  });

  // Tính số đêm lưu trú hiện tại theo form
  const nights = useMemo(() => calculateNights(checkInDate, checkOutDate), [checkInDate, checkOutDate]);
  const walkInRoomTotal = selectedRoomType
    ? [selectedRoomType, ...additionalWalkInTypes].reduce((sum, type) => sum + type.base_price, 0) * nights
    : 0;
  const walkInServiceTotal = selectedRoomType
    ? serviceOptions.reduce((sum, service) => sum + Number(service.price) * (selectedServiceQuantities[service.id] || 0), 0) * (1 + additionalWalkInTypes.length)
    : 0;
  const walkInSubtotal = walkInRoomTotal + walkInServiceTotal;
  const selectedWalkInPromotion = walkInPromotions.find((promotion) => promotion.code === walkInPromotionId) || null;
  const isWalkInPromotionApplied = walkInAppliedPromotion?.subtotal === walkInSubtotal;
  const walkInDiscount = isWalkInPromotionApplied ? Number(walkInAppliedPromotion.discount_amount) : 0;
  const walkInTotal = Math.max(0, walkInSubtotal - walkInDiscount);

  /**
   * 1. HÀM GỌI API KIỂM TRA PHÒNG TRỐNG (CHECK AVAILABILITY)
   * Gửi ngày nhận, ngày trả và số khách để tính toán chính xác phòng nào còn trống
   */
  const fetchAvailability = async () => {
    try {
      setIsLoadingAvailability(true);
      setAvailabilityError(null);

      const res = await checkRoomAvailability({
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults,
        children,
      });

      setAvailabilityList(res.data || []);
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra phòng trống.');
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  /**
   * 2. HÀM TẢI DANH SÁCH ĐẶT PHÒNG GẦN ĐÂY
   */
  const fetchRecent = async () => {
    try {
      setIsLoadingBookings(true);
      setRecentBookingsError(null);
      const accessToken = localStorage.getItem('accessToken') || undefined;
      const res = await getActiveBookings(accessToken || '');
      setRecentBookings(res.bookings || []);
      if (mode === 'management' && accessToken) {
        const history = await getBookingHistory(accessToken);
        setManagementBookings(history.bookings || []);
      }
    } catch (error) {
      console.error('Could not load bookings:', error);
      setRecentBookingsError(error instanceof Error ? error.message : 'Unable to load bookings.');
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const fetchAttentionBookings = async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      setAttentionBookingsError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    try {
      setIsLoadingAttentionBookings(true);
      setAttentionBookingsError(null);
      const result = await getBookingHistory(accessToken);
      setBookingHistory(result.bookings || []);
      setAttentionNow(new Date());
    } catch (error) {
      setAttentionBookingsError(error instanceof Error ? error.message : 'Không thể tải danh sách booking cần xử lý.');
    } finally {
      setIsLoadingAttentionBookings(false);
    }
  };

  const rememberOverdueBookingDecision = (bookingId: string | number) => {
    const updatedIds = new Set(handledOverdueBookingIds);
    updatedIds.add(String(bookingId));
    try {
      localStorage.setItem(overdueDecisionStorageKey, JSON.stringify([...updatedIds]));
    } catch (error) {
      console.error('Could not save handled overdue-booking decision:', error);
      showToast('Không lưu được lựa chọn trên thiết bị này; booking sẽ chỉ được ẩn đến khi tải lại trang.', 'error');
    }
    setHandledOverdueBookingIds(updatedIds);
  };

  const handleKeepOverdueBooking = (booking: RecentBooking) => {
    rememberOverdueBookingDecision(booking.id);
    showToast(`Đã giữ booking ${booking.booking_code}.`, 'success');
  };

  const handleCancelOverdueBooking = async () => {
    if (!bookingToCancel) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      setAttentionCancellationError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    try {
      setIsCancellingBooking(true);
      setAttentionCancellationError(null);
      const result = await cancelBooking(bookingToCancel.id, accessToken);
      rememberOverdueBookingDecision(bookingToCancel.id);
      setBookingToCancel(null);
      showToast(result.message || `Đã hủy booking ${bookingToCancel.booking_code}.`, 'success');
      await Promise.all([fetchRecent(), fetchAttentionBookings(), fetchAvailability()]);
    } catch (error) {
      setAttentionCancellationError(error instanceof Error ? error.message : 'Không thể hủy booking lúc này.');
    } finally {
      setIsCancellingBooking(false);
    }
  };

  const startEditingSelectedBooking = () => {
    if (!selectedBookingDetail || selectedBookingDetail.status !== 'CONFIRMED') return;
    const roomSelections = getBookingRoomSelections(selectedBookingDetail);
    setSelectedBookingDraft({
      check_in_date: String(selectedBookingDetail.check_in_date).slice(0, 10),
      check_out_date: String(selectedBookingDetail.check_out_date).slice(0, 10),
      guest_full_name: selectedBookingDetail.guest_full_name,
      guest_phone: selectedBookingDetail.guest_phone,
      guest_email: selectedBookingDetail.guest_email || '',
      adults: selectedBookingDetail.adults,
      children: selectedBookingDetail.children,
      special_request: selectedBookingDetail.special_request || '',
      room_selections: roomSelections,
    });
    setSelectedBookingRoomError(null);
    setIsEditingSelectedBooking(true);
  };

  const handleUpdateSelectedBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookingDetail || selectedBookingDetail.status !== 'CONFIRMED') return;
    const originalRoomSelections = getBookingRoomSelections(selectedBookingDetail);
    const originalRoomCount = originalRoomSelections.reduce((sum, selection) => sum + selection.quantity, 0);
    if (selectedBookingDraft.room_selections.reduce((sum, selection) => sum + selection.quantity, 0) < originalRoomCount) {
      showToast(`Booking cần có ít nhất ${originalRoomCount} phòng.`, 'error');
      return;
    }
    if (selectedBookingDraft.check_out_date <= selectedBookingDraft.check_in_date) {
      showToast('Ngày trả phòng phải sau ngày nhận phòng.', 'error');
      return;
    }
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }
    try {
      setIsUpdatingSelectedBooking(true);
      const result = await updateBooking(selectedBookingDetail.id, {
        ...selectedBookingDraft,
        guest_email: selectedBookingDraft.guest_email || undefined,
      }, accessToken);
      const { room_selections, ...updatedDetails } = selectedBookingDraft;
      const updatedRoomSelections = room_selections.map((selection) => {
        const previous = selectedBookingDetail.room_selections?.find((item) => item.room_type_id === selection.room_type_id);
        const option = selectedBookingRoomOptions.find((item) => item.id === selection.room_type_id);
        return {
          ...selection,
          room_type_name: option?.name || previous?.room_type_name || '',
          price_per_night: previous?.price_per_night ?? option?.base_price ?? 0,
        };
      });
      const updatedBooking = {
        ...selectedBookingDetail,
        ...updatedDetails,
        room_selections: updatedRoomSelections,
        check_in_date: result.booking.check_in_date,
        check_out_date: result.booking.check_out_date,
        total_amount: result.booking.total_amount,
        deposit_amount: result.booking.deposit_amount,
      };
      setSelectedBookingDetail(updatedBooking);
      setRecentBookings((current) => current.map((booking) =>
        String(booking.id) === String(updatedBooking.id) ? { ...booking, ...updatedBooking } : booking));
      setManagementBookings((current) => current.map((booking) =>
        String(booking.id) === String(updatedBooking.id) ? { ...booking, ...updatedBooking } : booking));
      setIsEditingSelectedBooking(false);
      showToast('Đã cập nhật booking.', 'success');
      await fetchRecent();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể cập nhật booking.', 'error');
    } finally {
      setIsUpdatingSelectedBooking(false);
    }
  };

  const handleCancelSelectedBooking = async () => {
    if (!selectedBookingDetail || selectedBookingDetail.status !== 'CONFIRMED') return;
    if (!window.confirm(`Bạn có chắc muốn hủy booking ${selectedBookingDetail.booking_code}?`)) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }
    try {
      setIsCancellingSelectedBooking(true);
      const result = await cancelBooking(selectedBookingDetail.id, accessToken);
      setSelectedBookingDetail(null);
      setIsEditingSelectedBooking(false);
      showToast(result.message || `Đã hủy booking ${selectedBookingDetail.booking_code}.`, 'success');
      await Promise.all([fetchRecent(), fetchAvailability()]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể hủy booking.', 'error');
    } finally {
      setIsCancellingSelectedBooking(false);
    }
  };

  useEffect(() => {
    if (!isEditingSelectedBooking || !selectedBookingDetail) return;
    let cancelled = false;
    setIsCheckingSelectedBookingRooms(true);
    setSelectedBookingRoomError(null);
    void checkRoomAvailability({
      check_in_date: selectedBookingDraft.check_in_date,
      check_out_date: selectedBookingDraft.check_out_date,
      adults: selectedBookingDraft.adults,
      children: selectedBookingDraft.children,
      exclude_booking_id: selectedBookingDetail.id,
    }).then((result) => {
      if (!cancelled) setSelectedBookingRoomOptions(result.data);
    }).catch((error: unknown) => {
      if (!cancelled) setSelectedBookingRoomError(error instanceof Error ? error.message : 'Không thể kiểm tra phòng trống.');
    }).finally(() => {
      if (!cancelled) setIsCheckingSelectedBookingRooms(false);
    });
    return () => { cancelled = true; };
  }, [
    isEditingSelectedBooking,
    selectedBookingDetail,
    selectedBookingDraft.check_in_date,
    selectedBookingDraft.check_out_date,
    selectedBookingDraft.adults,
    selectedBookingDraft.children,
  ]);

  const handleSubmitCheckIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCheckInBooking) return;
    if (!checkInRoomSlots.length || checkInRoomSlots.some((slot) => !checkInRoomIds[slot.booking_room_id])) {
      showToast('Vui lòng chọn số phòng cho tất cả phòng trong booking.', 'error');
      return;
    }
    if (!hasVerifiedOriginalId) {
      showToast('Vui lòng đối chiếu giấy tờ tùy thân bản gốc trước khi check-in.', 'error');
      return;
    }
    if (!selectedCheckInBooking.has_guest_id_card && !/^\d{12}$/.test(checkInIdCard.trim())) {
      showToast('Vui lòng nhập CCCD gồm đúng 12 chữ số để check-in booking online.', 'error');
      return;
    }
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }

    try {
      setIsCheckingIn(true);
      await assignRoomToBooking(
        selectedCheckInBooking.id,
        checkInRoomSlots.map((slot) => ({
          booking_room_id: slot.booking_room_id,
          room_id: Number(checkInRoomIds[slot.booking_room_id]),
        })),
        accessToken,
      );
      const result = await checkInBooking(
        selectedCheckInBooking.id,
        accessToken,
        selectedCheckInBooking.has_guest_id_card ? undefined : checkInIdCard.trim(),
      );
      showToast(result.message, 'success');
      setSelectedCheckInBooking(null);
      setCheckInRoomSlots([]);
      setCheckInRoomIds({});
      setCheckInIdCard('');
      setHasVerifiedOriginalId(false);
      await Promise.all([
        fetchRecent(),
        ...(mode === 'checkin' ? [fetchAttentionBookings()] : []),
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xác nhận check-in.', 'error');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const openCheckInPage = async (booking: RecentBooking) => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }
    setSelectedCheckInBooking(booking);
    setCheckInIdCard('');
    setHasVerifiedOriginalId(false);
    setCheckInRoomSlots([]);
    setCheckInRoomIds({});
    setIsLoadingCheckInRooms(true);
    try {
      const result = await getAssignableRooms(booking.id, accessToken);
      setCheckInRoomSlots(result.room_slots);
      setCheckInRoomIds(Object.fromEntries(result.room_slots
        .filter((slot) => slot.assigned_room_id != null
          && slot.rooms.some((room) => room.id === slot.assigned_room_id && room.status === 'AVAILABLE'))
        .map((slot) => [slot.booking_room_id, String(slot.assigned_room_id)])));
    } catch (error) {
      setSelectedCheckInBooking(null);
      showToast(error instanceof Error ? error.message : 'Không tải được danh sách phòng để check-in.', 'error');
    } finally {
      setIsLoadingCheckInRooms(false);
    }
  };

  const handleCheckOut = (booking: RecentBooking) => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }
    setCreatedInvoice(null);
    setCheckoutSuccess(null);
    setCheckOutPaymentMethod('CASH');
    setCheckOutPaymentNote('');
    setCashTendered('');
    setSelectedCheckOutBooking(booking);
  };

  const confirmCheckOut = async () => {
    if (!selectedCheckOutBooking) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      setSelectedCheckOutBooking(null);
      return;
    }
    const booking = selectedCheckOutBooking;
    const method = checkOutPaymentMethod;
    const confirmedAt = new Date().toISOString();
    if (method === 'VNPAY' && !vnpayEnabled) {
      showToast('VNPay hiện chỉ hiển thị minh họa. Hãy bật cấu hình VNPay để thanh toán qua cổng.', 'error');
      return;
    }
    try {
      setIsCheckingOut(booking.id);
      const result = await createReceptionCheckout(booking.id, method);
      if (method === 'VNPAY') {
        if (!result.payment_url) throw new Error('Không nhận được đường dẫn thanh toán VNPay.');
        if (createdInvoice?.detail.id) sessionStorage.setItem('hotelManagement.checkoutInvoiceId', String(createdInvoice.detail.id));
        sessionStorage.setItem('hotelManagement.checkoutPaymentCode', result.payment_code);
        window.location.assign(result.payment_url);
        return;
      }
      if (result.status !== 'SUCCESS' || !result.invoice_id) throw new Error('Backend chưa xác nhận thanh toán thành công. Hóa đơn vẫn được giữ để bạn thử lại.');
      const detail = await getInvoiceDetails(result.invoice_id);
      const payment = detail.payments?.find((item) => item.payment_code === result.payment_code);
      if (!payment || payment.status.toUpperCase() !== 'SUCCESS'
        || detail.status.toUpperCase() !== 'PAID'
        || detail.booking_status.toUpperCase() !== 'CHECKED_OUT') {
        throw new Error('Giao dịch chưa được xác nhận đầy đủ. Hãy kiểm tra trạng thái thanh toán trước khi tiếp tục.');
      }
      setCreatedInvoice(null);
      setSelectedCheckOutBooking(null);
      setCheckoutSuccess({
        detail,
        payment: method === 'CASH' ? { ...payment, paid_at: confirmedAt } : payment,
      });
      await fetchRecent();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể check-out booking.', 'error');
    } finally {
      setIsCheckingOut(null);
    }
  };

  const createCheckoutInvoice = async () => {
    if (!selectedCheckOutBooking) return;
    try {
      setIsCreatingInvoice(true);
      setCashTendered('');
      setCashTenderError('');
      const result = await createReceptionInvoice(selectedCheckOutBooking.id);
      const detail = await getInvoiceDetails(result.invoice_id);
      setCreatedInvoice({ detail, created: result.created });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo hoặc tải hóa đơn.', 'error');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const continueInvoicePayment = () => {
    if (checkOutPaymentMethod === 'CASH' && invoiceBalanceDue > 0) {
      if (cashTenderedIsEmpty) {
        const message = 'Vui lòng nhập số tiền khách đưa.';
        setCashTenderError(message);
        showToast(message, 'error');
        document.getElementById('checkout-cash-tendered')?.focus();
        return;
      }
      if (cashTenderedAmount < invoiceBalanceDue) {
        const message = 'Tiền khách đưa chưa đủ số tiền cần thanh toán.';
        setCashTenderError(message);
        showToast(message, 'error');
        document.getElementById('checkout-cash-tendered')?.focus();
        return;
      }
    }
    setCashTenderError('');
    void confirmCheckOut();
  };

  // Tự động tải dữ liệu khi component được gắn vào giao diện
  useEffect(() => {
    void fetchRecent();
    if (mode === 'management') {
      void fetchAvailability();
      void getActivePromotions()
        .then((promotions) => { setWalkInPromotions(promotions); setWalkInPromotionLoadError(''); })
        .catch(() => { setWalkInPromotions([]); setWalkInPromotionLoadError('Không tải được danh sách promotion. Bạn vẫn có thể nhập mã để kiểm tra.'); });
      void getServices()
        .then((data) => setServiceOptions(data.filter((service) => service.booking_policy === 'PREBOOK')))
        .catch(() => setServiceOptions([]));
    }
    if (mode === 'checkin') void fetchAttentionBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const filteredManagementBookings = useMemo(() => {
    const query = managementQuery.trim().toLocaleLowerCase();
    const sevenDaysFromToday = addDays(vietnamToday, 7);
    return managementBookings.filter((booking) => {
      const checkInDate = String(booking.check_in_date).slice(0, 10);
      const isCurrentlyStaying = booking.status === 'CHECKED_IN'
        && checkInDate <= vietnamToday;
      const isUpcoming = booking.status === 'CONFIRMED'
        && checkInDate >= vietnamToday
        && checkInDate <= sevenDaysFromToday;
      if (!isCurrentlyStaying && !isUpcoming) return false;
      const matchesQuery = !query || [
        booking.booking_code,
        booking.guest_full_name,
        booking.guest_phone,
        booking.guest_email || '',
        booking.room_number || '',
        booking.room_type_name || '',
      ].some((value) => value.toLocaleLowerCase().includes(query));
      const matchesDateFrom = !managementDateFrom || checkInDate >= managementDateFrom;
      const matchesDateTo = !managementDateTo || checkInDate <= managementDateTo;
      const matchesStatus = managementStatus === 'ALL' || booking.status === managementStatus;
      const requiredDeposit = Number(booking.required_deposit_amount || 0);
      const paymentStatus = booking.deposit_payment_status
        || (booking.requires_deposit_payment === false || requiredDeposit <= 0
          ? 'NOT_REQUIRED'
          : Number(booking.deposit_amount) >= requiredDeposit ? 'PAID' : 'UNPAID');
      const matchesPayment = managementPaymentStatus === 'ALL' || paymentStatus === managementPaymentStatus;
      return matchesQuery && matchesDateFrom && matchesDateTo && matchesStatus && matchesPayment;
    });
  }, [managementBookings, managementDateFrom, managementDateTo, managementPaymentStatus, managementQuery, managementStatus, vietnamToday]);
  const managementPageSize = 10;
  const managementPageCount = Math.max(1, Math.ceil(filteredManagementBookings.length / managementPageSize));
  useEffect(() => {
    if (managementPage > managementPageCount) setManagementPage(managementPageCount);
  }, [managementPage, managementPageCount]);
  const paginatedManagementBookings = filteredManagementBookings.slice(
    (managementPage - 1) * managementPageSize,
    managementPage * managementPageSize,
  );

  // Refresh deposit totals after a payment is confirmed, even when reception
  // leaves this dashboard open in another tab during the customer's payment.
  useEffect(() => {
    const refreshBookings = () => {
      if (document.visibilityState === 'visible') {
        setAttentionNow(new Date());
        void fetchRecent();
        if (mode === 'checkin') void fetchAttentionBookings();
      }
    };
    const intervalId = window.setInterval(refreshBookings, 10000);
    window.addEventListener('focus', refreshBookings);
    document.addEventListener('visibilitychange', refreshBookings);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshBookings);
      document.removeEventListener('visibilitychange', refreshBookings);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /**
   * 3. XỬ LÝ MỞ MODAL ĐẶT PHÒNG TẠI QUẦY
   * Mở form tạo booking với các loại phòng đã chọn từ popup.
   */
  const handleOpenWalkInModal = (roomTypes: RoomAvailabilityItem[]) => {
    const [roomType, ...additionalTypes] = roomTypes;
    if (!roomType) return;
    setSelectedRoomType(roomType);
    setAdditionalWalkInTypes(additionalTypes);
    const roomTypeOccurrences: Record<number, number> = { [roomType.id]: 1 };
    setAdditionalWalkInRoomIds(Object.fromEntries(additionalTypes.map((type, index) => {
      const occurrence = roomTypeOccurrences[type.id] || 0;
      roomTypeOccurrences[type.id] = occurrence + 1;
      const assignableRooms = type.available_room_list.filter((room) => room.status === 'AVAILABLE');
      return [index, assignableRooms[occurrence] ? String(assignableRooms[occurrence].id) : ''];
    })));

    // Mặc định chọn phòng vật lý đầu tiên trong danh sách phòng trống nếu có
    const assignableRooms = roomType.available_room_list.filter((room) => room.status === 'AVAILABLE');
    const defaultRoomId = assignableRooms.length > 0
      ? String(assignableRooms[0].id)
      : '';

    setWalkInForm({
      guest_full_name: '',
      guest_phone: '',
      guest_email: '',
      guest_id_card: '',
      room_id: defaultRoomId,
      deposit_amount: 0,
      check_in_now: true,
      special_request: 'Khách đặt trực tiếp tại quầy lễ tân',
    });
    setSelectedServiceQuantities({});
    setWalkInPromotionId('');
    setWalkInPromotionCode('');
    setWalkInAppliedPromotion(null);
    setWalkInPromotionMessage('Chọn promotion hoặc nhập mã để áp dụng.');

    setIsModalOpen(true);
  };

  const confirmRoomPickerSelection = () => {
    const selections = availabilityList.flatMap((type) => Array.from(
      { length: Math.max(0, Math.min(pickerRoomQuantities[type.id] || 0, type.available_rooms)) },
      () => type,
    ));
    if (!selections.length) return;
    setIsRoomPickerOpen(false);
    handleOpenWalkInModal(selections);
  };

  /**
   * Đóng modal đặt phòng
   */
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRoomType(null);
    setAdditionalWalkInTypes([]);
  };

  const applyWalkInPromotion = async (codeToApply = walkInPromotionCode) => {
    const code = codeToApply.trim().toUpperCase();
    if (!code) {
      setWalkInPromotionMessage('Vui lòng nhập mã promotion trước khi áp dụng.');
      return false;
    }
    if (walkInSubtotal <= 0) {
      setWalkInPromotionMessage('Hãy chọn phòng và ngày lưu trú hợp lệ trước.');
      return false;
    }
    setIsApplyingWalkInPromotion(true);
    setWalkInPromotionCode(code);
    setWalkInPromotionMessage('Đang kiểm tra promotion…');
    try {
      const result = await validatePromotion(code, walkInSubtotal);
      setWalkInPromotionId(result.promotion_code);
      setWalkInAppliedPromotion({ code: result.promotion_code, discount_amount: Number(result.discount_amount), subtotal: walkInSubtotal });
      setWalkInPromotionMessage(`Đã áp dụng mã ${result.promotion_code}. Giảm ${formatCurrency(Number(result.discount_amount))}.`);
      return true;
    } catch (error) {
      setWalkInPromotionId('');
      setWalkInAppliedPromotion(null);
      setWalkInPromotionMessage(error instanceof Error ? error.message : 'Không thể xác thực promotion.');
      return false;
    } finally {
      setIsApplyingWalkInPromotion(false);
    }
  };

  /**
   * 4. XỬ LÝ GỬI FORM ĐẶT PHÒNG TẠI QUẦY (WALK-IN)
   */
  const handleSubmitWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomType) return;

    // Validate guest contact and identity fields before submitting.
    if (!walkInForm.guest_full_name.trim()) {
      showToast('Vui lòng nhập họ và tên của khách hàng.', 'error');
      return;
    }
    const normalizedPhone = walkInForm.guest_phone.trim();
    if (!/^\d{10}$/.test(normalizedPhone)) {
      showToast('Số điện thoại phải gồm đúng 10 chữ số.', 'error');
      return;
    }
    const normalizedEmail = walkInForm.guest_email.trim();
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      showToast('Vui lòng nhập email đúng định dạng, ví dụ khach@example.com.', 'error');
      return;
    }
    const selectedTypes = [selectedRoomType, ...additionalWalkInTypes];
    const selectedRoomIds = [walkInForm.room_id, ...additionalWalkInTypes.map((_, index) => additionalWalkInRoomIds[index] || '')].filter(Boolean);
    if (new Set(selectedRoomIds).size !== selectedRoomIds.length) {
      showToast('Mỗi phòng trong booking phải được gán một phòng vật lý khác nhau.', 'error');
      return;
    }
    if (adults > selectedTypes.reduce((capacity, type) => capacity + type.max_adults, 0)
      || children > selectedTypes.reduce((capacity, type) => capacity + type.max_children, 0)) {
      showToast('Số khách vượt quá sức chứa của các phòng đã chọn.', 'error');
      return;
    }
    if (!/^\d{12}$/.test(walkInForm.guest_id_card.trim())) {
      showToast('CCCD phải gồm đúng 12 chữ số.', 'error');
      return;
    }

    try {
      setIsSubmittingBooking(true);
      const payload: WalkInBookingPayload = {
        room_type_id: selectedRoomType.id,
        room_id: walkInForm.room_id ? Number(walkInForm.room_id) : null,
        room_selections: [
          { room_type_id: selectedRoomType.id, room_id: walkInForm.room_id ? Number(walkInForm.room_id) : null },
          ...additionalWalkInTypes.map((type, index) => ({ room_type_id: type.id, room_id: additionalWalkInRoomIds[index] ? Number(additionalWalkInRoomIds[index]) : null })),
        ],
        service_selections: Object.entries(selectedServiceQuantities)
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([serviceId, quantity]) => ({ service_id: Number(serviceId), quantity: Number(quantity) })),
        promotion_code: isWalkInPromotionApplied ? walkInAppliedPromotion?.code : undefined,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults,
        children,
        guest_full_name: walkInForm.guest_full_name,
        guest_phone: normalizedPhone,
        guest_email: normalizedEmail || undefined,
        guest_id_card: walkInForm.guest_id_card || undefined,
        deposit_amount: Number(walkInForm.deposit_amount || 0),
        special_request: walkInForm.special_request,
        check_in_now: true,
      };

      const res = await createWalkInBooking(payload);

      showToast(`${res.message} (Khách: ${res.booking.guest_full_name}, Phòng: ${res.booking.room_number || 'Tự gán'}${Number(res.booking.discount_amount || 0) > 0 ? `, Promotion ${res.booking.promotion_code}: giảm ${formatCurrency(Number(res.booking.discount_amount))}` : ''}, Tổng: ${formatCurrency(res.booking.total_amount)})`, 'success');
      setIsModalOpen(false);
      void fetchAvailability();
      void fetchRecent();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Đặt phòng tại quầy thất bại.', 'error');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  // Lọc danh sách theo sức chứa khách và bộ lọc "Chỉ phòng còn trống"
  const displayedRoomTypes = useMemo(() => {
    return availabilityList.filter((item) => {
      const matchesCapacity = item.capacity_matched;
      const matchesAvailability = !filterOnlyAvailable || item.is_available;
      return matchesCapacity && matchesAvailability;
    });
  }, [availabilityList, filterOnlyAvailable]);

  // Thống kê tổng quan nhanh cho Lễ tân
  const totalAvailableRoomsCount = useMemo(() => {
    return availabilityList.reduce((sum, item) => sum + item.available_rooms, 0);
  }, [availabilityList]);
  const visibleBookings = recentBookings.filter((booking) => {
    if (mode === 'checkin') return booking.status === 'CONFIRMED';
    if (mode === 'checkout') return booking.status === 'CHECKED_IN';
    return booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
  }).filter((booking) => {
    if (mode !== 'checkin' && mode !== 'checkout') return true;
    const normalizedQuery = appliedCheckInFilters.query.trim().toLocaleLowerCase();
    const matchesDate = !appliedCheckInFilters.date
      || String(booking.check_in_date).slice(0, 10) === appliedCheckInFilters.date;
    const searchableText = [booking.booking_code, booking.guest_full_name, booking.guest_phone, booking.room_number]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return matchesDate && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
  const bookingTableTitle = mode === 'checkin'
    ? 'Booking chờ check-in'
    : mode === 'checkout'
      ? 'Khách đang lưu trú · Chờ check-out'
      : 'Booking chờ check-in / đang lưu trú';
  const bookingTableDescription = mode === 'checkin'
    ? 'Chỉ hiển thị booking đã xác nhận, đủ điều kiện làm thủ tục nhận phòng.'
    : mode === 'checkout'
      ? 'Chỉ hiển thị khách đã check-in và đang lưu trú.'
      : 'Booking đã check-in vẫn được giữ tại đây; booking đã checkout nằm trong lịch sử booking.';

  const invoiceBalanceDue = createdInvoice ? Math.max(0, Number(createdInvoice.detail.amount_due) || 0) : 0;
  const cashTenderedIsEmpty = cashTendered.trim() === '';
  const cashTenderedAmount = cashTenderedIsEmpty ? 0 : Math.max(0, Number(cashTendered) || 0);
  const cashChangeDue = Math.max(0, cashTenderedAmount - invoiceBalanceDue);

  return (
    <div className={`reception-booking-module${mode === 'management' ? ' booking-management-main-container' : ''}`}>
      {checkoutSuccess && <CheckoutPaymentSuccessModal result={checkoutSuccess} onClose={() => setCheckoutSuccess(null)} />}
      {mode === 'management' && <>
      <section className="booking-management-toolbar">
        <div>
          <h3>Quản lý booking</h3>
          <p>Theo dõi thông tin đặt phòng, trạng thái và thanh toán của khách.</p>
        </div>
        <div className="booking-management-toolbar-actions">
          {onViewBookingHistory && <button type="button" className="btn btn-outline" onClick={onViewBookingHistory}>Xem lịch sử booking</button>}
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={isCreateBookingOpen}
            onClick={() => setIsCreateBookingOpen((open) => !open)}
          >
            {isCreateBookingOpen ? 'Đóng tạo booking' : '＋ Tạo booking'}
          </button>
        </div>
      </section>
      {isCreateBookingOpen && <>
      {/* =========================================================================
          KHỐI 1: BỘ LỌC KIỂM TRA PHÒNG TRỐNG (CHECK ROOM AVAILABILITY CONTROLS)
          ========================================================================= */}
      <div className="availability-search-card">
        <div className="search-card-header">
          <div>
            <h3 className="module-section-title">Kiểm tra phòng trống & Đặt tại quầy</h3>
            <p className="module-section-subtitle">
              Tra cứu chính xác loại phòng còn trống theo ngày để tư vấn và tạo đơn cho khách đến trực tiếp tại quầy lễ tân.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void fetchAvailability()}
            disabled={isLoadingAvailability}
          >
            {isLoadingAvailability ? 'Đang kiểm tra...' : 'Làm mới'}
          </button>
        </div>

        <div className="reception-filter-grid">
          <div className="filter-field">
            <label htmlFor="rec-checkin">Ngày nhận phòng</label>
            <input
              id="rec-checkin"
              type="date"
              value={checkInDate}
              onChange={(e) => {
                const nextIn = e.target.value;
                setCheckInDate(nextIn);
                if (new Date(checkOutDate) <= new Date(nextIn)) {
                  setCheckOutDate(addDays(nextIn, 1));
                }
              }}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="rec-checkout">Ngày trả phòng</label>
            <input
              id="rec-checkout"
              type="date"
              value={checkOutDate}
              onChange={(e) => {
                const nextOut = e.target.value;
                if (new Date(nextOut) <= new Date(checkInDate)) {
                  setCheckOutDate(addDays(checkInDate, 1));
                } else {
                  setCheckOutDate(nextOut);
                }
              }}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="rec-adults">Người lớn</label>
            <select
              id="rec-adults"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <option key={num} value={num}>
                  {num} người lớn
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="rec-children">Trẻ em</label>
            <select
              id="rec-children"
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4].map((num) => (
                <option key={num} value={num}>
                  {num} trẻ em
                </option>
              ))}
            </select>
          </div>

          <div className="filter-action-wrap">
            <button
              type="button"
              className="btn btn-primary full-width"
              onClick={() => void fetchAvailability()}
              disabled={isLoadingAvailability}
            >
              {isLoadingAvailability ? 'Đang kiểm tra...' : 'Kiểm tra phòng'}
            </button>
          </div>
        </div>

        {/* Thanh tóm tắt nhanh tình trạng phòng trống */}
        <div className="reception-stat-strip">
          <div className="stat-pill">
            <span className="pill-label">Khoảng thời gian:</span>
            <strong>{checkInDate} → {checkOutDate} ({nights} đêm)</strong>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Tổng phòng còn trống:</span>
            <strong className="text-success">{totalAvailableRoomsCount} phòng</strong>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Loại phòng phù hợp:</span>
            <strong>
              {availabilityList.filter((i) => i.capacity_matched && i.is_available).length} / {availabilityList.length} loại
            </strong>
          </div>
          <div className="stat-toggle-pill">
            <label className="toggle-checkbox-label">
              <input
                type="checkbox"
                checked={filterOnlyAvailable}
                onChange={(e) => setFilterOnlyAvailable(e.target.checked)}
              />
              <span>Chỉ hiển thị loại phòng còn trống</span>
            </label>
          </div>
        </div>

        {availabilityError && <div className="reception-alert alert-error">{availabilityError}</div>}
      </div>

      {/* =========================================================================
          KHỐI 2: DANH SÁCH LOẠI PHÒNG VÀ TÌNH TRẠNG PHÒNG TRỐNG
          ========================================================================= */}
      <div className="reception-room-list-section">
        <h4 className="section-title-sm">Danh sách loại phòng & Sẵn sàng đón khách</h4>

        {displayedRoomTypes.length === 0 ? (
          <div className="empty-state-box">
            <strong>Không có phòng phù hợp</strong>
            <span>
              Không tìm thấy loại phòng đủ sức chứa cho {adults} người lớn và {children} trẻ em trong khoảng thời gian đã chọn.
              Vui lòng điều chỉnh số khách hoặc chọn ngày khác.
            </span>
          </div>
        ) : (
          <div className="reception-room-grid">
            {displayedRoomTypes.map((room) => {
              const estimatedTotal = room.base_price * nights;

              return (
                <div
                  key={room.id}
                  className={`reception-room-card ${!room.is_available ? 'card-sold-out' : ''}`}
                >
                  <div className="card-top-header">
                    <div>
                      <h4 className="room-title">{room.name}</h4>
                      <span className="room-capacity-info">
                        Tối đa {room.max_adults} người lớn, {room.max_children} trẻ em
                      </span>
                    </div>

                    {/* Huy hiệu tình trạng phòng trống */}
                    {room.capacity_matched ? (
                      room.is_available ? (
                        <span className="badge-status-available">
                          Còn {room.available_rooms} / {room.total_rooms} phòng
                        </span>
                      ) : (
                        <span className="badge-status-soldout">
                          Hết phòng ngày này
                        </span>
                      )
                    ) : (
                      <span className="badge-status-soldout">
                        Không đủ sức chứa
                      </span>
                    )}
                  </div>

                  <p className="room-desc-text">{room.description}</p>

                  {/* Hiển thị số phòng vật lý cụ thể còn trống */}
                  <div className="physical-rooms-box">
                    <span className="physical-rooms-label">Số phòng trống:</span>
                    {room.available_room_list && room.available_room_list.length > 0 ? (
                      <div className="room-tags-wrapper">
                        {room.available_room_list.map((r: AvailableRoom) => (
                          <span key={r.id} className="room-number-tag" title={`Tầng ${r.floor || 1}`}>
                            Phòng {r.room_number}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-sm">Không còn phòng vật lý nào trống</span>
                    )}
                  </div>

                  <div className="card-footer-pricing">
                    <div>
                      <div className="price-primary">{formatCurrency(room.base_price)} <small>/ đêm</small></div>
                      <div className="price-total-est">
                        Tổng {nights} đêm: <strong>{formatCurrency(estimatedTotal)}</strong>
                      </div>
                    </div>

                    {room.is_available && <span className="room-selection-hint">Có thể chọn cho booking</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="booking-now-bar">
          <span>Chọn ngày lưu trú và loại phòng, sau đó tạo booking cho khách.</span>
          <button type="button" className="btn btn-primary booking-now-button" disabled={!availabilityList.some((roomType) => roomType.is_available)} onClick={() => { setPickerRoomQuantities({}); setIsRoomPickerOpen(true); }}>Booking Now</button>
        </div>
      </div>
      </>}

      {/* =========================================================================
          KHỐI 3: MODAL ĐẶT PHÒNG TRỰC TIẾP TẠI QUẦY (WALK-IN BOOKING MODAL)
          ========================================================================= */}
      {isRoomPickerOpen && <div className="modal-backdrop" onClick={() => setIsRoomPickerOpen(false)}>
        <div className="room-picker-modal" role="dialog" aria-modal="true" aria-labelledby="walkin-room-picker-title" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header"><div><h3 id="walkin-room-picker-title">Chọn phòng cho booking</h3><p>Có thể chọn nhiều loại phòng trong cùng một booking.</p></div><button type="button" className="modal-close-btn" onClick={() => setIsRoomPickerOpen(false)}>Đóng</button></div>
          <div className="room-picker-list">{availabilityList.filter((roomType) => roomType.is_available).map((roomType) => {
            const quantity = pickerRoomQuantities[roomType.id] || 0;
            return <div className={`room-picker-option ${quantity > 0 ? 'selected' : ''}`} key={roomType.id}>
              <input aria-label={`Số lượng ${roomType.name}`} type="number" min="0" max={roomType.available_rooms} value={quantity} onChange={(event) => setPickerRoomQuantities({ ...pickerRoomQuantities, [roomType.id]: Math.max(0, Math.min(roomType.available_rooms, Number(event.target.value) || 0)) })} />
              <span className="room-picker-option-copy"><strong>{roomType.name}</strong><small>Tối đa {roomType.max_adults} người lớn, {roomType.max_children} trẻ em · Còn {roomType.available_rooms} phòng</small></span>
              <strong className="room-picker-price">{formatCurrency(roomType.base_price)} / đêm</strong>
            </div>;
          })}</div>
          <div className="room-picker-footer"><span>{Object.values(pickerRoomQuantities).reduce((sum, quantity) => sum + quantity, 0)} phòng được chọn</span><div><button type="button" className="btn btn-outline" onClick={() => setIsRoomPickerOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" disabled={!Object.values(pickerRoomQuantities).some((quantity) => quantity > 0)} onClick={confirmRoomPickerSelection}>Tiếp tục</button></div></div>
        </div>
      </div>}

      {isModalOpen && selectedRoomType && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="walkin-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Đặt phòng tại quầy (Walk-in Booking)</h3>
                <p>Tạo đơn trực tiếp cho khách đến quầy lễ tân • {selectedRoomType.name}</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={handleCloseModal}>
                Đóng
              </button>
            </div>

            <form onSubmit={handleSubmitWalkIn} className="walkin-modal-form">
              {/* Tóm tắt thông tin phòng đã chọn */}
              <div className="booking-summary-strip">
                <div>
                  <strong>Loại phòng:</strong> {[selectedRoomType, ...additionalWalkInTypes].map((type) => type.name).join(', ')}
                </div>
                <div>
                  <strong>Lưu trú:</strong> {checkInDate} → {checkOutDate} ({nights} đêm)
                </div>
                <div>
                  <strong>Giá/đêm:</strong> {formatCurrency([selectedRoomType, ...additionalWalkInTypes].reduce((sum, type) => sum + type.base_price, 0))}
                </div>
                <div>
                  <strong>Tổng tiền phòng:</strong>{' '}
                  <span className="text-highlight">
                    {formatCurrency(walkInRoomTotal)}
                  </span>
                </div>
                <div><strong>Tổng tiền dịch vụ:</strong> <span className="text-highlight">{formatCurrency(walkInServiceTotal)}</span></div>
                <div><strong>Tổng trước promotion:</strong> <span>{formatCurrency(walkInSubtotal)}</span></div>
                {selectedWalkInPromotion && <div><strong>Promotion {selectedWalkInPromotion.code}:</strong> <span className="text-highlight">− {formatCurrency(walkInDiscount)}</span></div>}
                <div><strong>Tổng booking dự kiến:</strong> <span className="text-highlight">{formatCurrency(walkInTotal)}</span></div>
              </div>

              <div className="booking-room-summary">
                <h3>Khuyến mãi</h3>
                <div className="booking-promotion-selection">
                  <div>{isWalkInPromotionApplied
                    ? <><strong>{walkInAppliedPromotion.code}</strong><span>Đã giảm {formatCurrency(walkInDiscount)}</span></>
                    : <span>{walkInAppliedPromotion ? 'Tạm tính đã thay đổi, vui lòng áp dụng lại mã.' : 'Chưa chọn mã khuyến mãi'}</span>}
                  </div>
                  <button type="button" className="btn btn-outline" onClick={() => setIsWalkInPromotionModalOpen(true)}>
                    {isWalkInPromotionApplied ? 'Đổi promotion' : 'Chọn promotion'}
                  </button>
                </div>
                <p className={`customer-promotion-message${isWalkInPromotionApplied ? ' is-success' : ''}`} role="status" aria-live="polite">{walkInPromotionMessage}</p>
                <p>Tạm tính: {formatCurrency(walkInSubtotal)}{isWalkInPromotionApplied ? ` · Giảm ${formatCurrency(walkInDiscount)} · Còn ${formatCurrency(walkInTotal)}` : ''}</p>
              </div>

              {/* Thông tin khách hàng đến quầy */}
              <div className="form-sub-header">Thông tin khách hàng</div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="guest_full_name">
                    Họ và tên khách hàng <span className="req">*</span>
                  </label>
                  <input
                    id="guest_full_name"
                    type="text"
                    required
                    placeholder="Nguyễn Văn A"
                    value={walkInForm.guest_full_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_full_name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="guest_phone">
                    Số điện thoại <span className="req">*</span>
                  </label>
                  <input
                    id="guest_phone"
                    type="tel"
                    required
                    inputMode="numeric"
                    minLength={10}
                    maxLength={10}
                    pattern="[0-9]{10}"
                    placeholder="0912345678"
                    value={walkInForm.guest_phone}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="guest_id_card">Số CCCD <span className="req">*</span></label>
                  <input
                    id="guest_id_card"
                    type="text"
                    placeholder="001200001234"
                    value={walkInForm.guest_id_card}
                    inputMode="numeric"
                    minLength={12}
                    maxLength={12}
                    pattern="[0-9]{12}"
                    required
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_id_card: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="guest_email">Email khách hàng (nếu có)</label>
                  <input
                    id="guest_email"
                    type="email"
                    placeholder="khach@example.com"
                    value={walkInForm.guest_email}
                    maxLength={254}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_email: e.target.value })}
                  />
                </div>
              </div>

              {/* Chọn số phòng cụ thể & Thanh toán */}
              <div className="form-sub-header">Xếp phòng & Thanh toán</div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="assigned_room_id">Chọn số phòng vật lý <span className="optional-hint">(có thể gán sau nếu phòng đang dọn)</span></label>
                  <select
                    id="assigned_room_id"
                    value={walkInForm.room_id}
                    onChange={(e) => setWalkInForm({ ...walkInForm, room_id: e.target.value })}
                  >
                    {selectedRoomType.available_room_list.filter((room) => room.status === 'AVAILABLE' && !additionalWalkInTypes.some((type, index) => type.id === selectedRoomType.id && additionalWalkInRoomIds[index] === String(room.id))).map((r: AvailableRoom) => (
                      <option key={r.id} value={r.id}>
                        Phòng {r.room_number} (Tầng {r.floor || 1})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="deposit_amount">Số tiền khách đã thanh toán trước (VNĐ, nếu có)</label>
                  <input
                    id="deposit_amount"
                    type="number"
                    min="0"
                    step="50000"
                    value={walkInForm.deposit_amount}
                    onChange={(e) =>
                      setWalkInForm({ ...walkInForm, deposit_amount: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              {additionalWalkInTypes.map((type, index) => {
                const usedRoomIds = additionalWalkInTypes.flatMap((otherType, otherIndex) => otherIndex !== index && otherType.id === type.id && additionalWalkInRoomIds[otherIndex] ? [additionalWalkInRoomIds[otherIndex]] : []);
                if (selectedRoomType.id === type.id && walkInForm.room_id) usedRoomIds.push(walkInForm.room_id);
                return <div className="form-row-2 walkin-extra-room" key={`${type.id}-${index}`}>
                <div className="form-group"><label htmlFor={`walkin-room-${index}`}>{type.name} · {formatCurrency(type.base_price)} / đêm</label><select id={`walkin-room-${index}`} value={additionalWalkInRoomIds[index] || ''} onChange={(event) => setAdditionalWalkInRoomIds({ ...additionalWalkInRoomIds, [index]: event.target.value })}>{type.available_room_list.filter((availableRoom) => availableRoom.status === 'AVAILABLE' && String(availableRoom.id) !== walkInForm.room_id && (String(availableRoom.id) === additionalWalkInRoomIds[index] || !usedRoomIds.includes(String(availableRoom.id)))).map((availableRoom) => <option key={availableRoom.id} value={availableRoom.id}>Phòng {availableRoom.room_number} (Tầng {availableRoom.floor || 1})</option>)}</select></div>
                <div className="form-group"><label>Phòng trong booking</label><span>{index + 2}</span></div>
              </div>;
              })}

              <div className="form-sub-header">Dịch vụ đi kèm</div>
              {serviceOptions.length > 0 ? (
                <div className="service-selection-grid">
                  {serviceOptions.map((service) => (
                    <div className="service-choice-row" key={service.id}>
                      <div className="service-choice-info">
                        <strong>{service.name}</strong>
                        <span>{formatCurrency(service.price)} / {service.unit}</span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={selectedServiceQuantities[service.id] || 0}
                        onChange={(e) => setSelectedServiceQuantities({
                          ...selectedServiceQuantities,
                          [service.id]: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                        })}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="form-note-muted">Hiện chưa có dịch vụ nào đang hoạt động.</div>
              )}

              <div className="form-group">
                <label htmlFor="special_request">Ghi chú / Yêu cầu đặc biệt</label>
                <textarea
                  id="special_request"
                  rows={2}
                  placeholder="Ghi chú thêm về khách, giờ nhận phòng, hóa đơn..."
                  value={walkInForm.special_request}
                  onChange={(e) =>
                    setWalkInForm({ ...walkInForm, special_request: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions-bar">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseModal}
                  disabled={isSubmittingBooking}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingBooking}
                >
                  {isSubmittingBooking ? 'Đang tạo đơn...' : 'Xác nhận đặt phòng tại quầy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isWalkInPromotionModalOpen && <div className="modal-backdrop promotion-modal-backdrop" onClick={() => setIsWalkInPromotionModalOpen(false)}>
        <section className="promotion-picker-modal" role="dialog" aria-modal="true" aria-labelledby="walkin-promotion-picker-title" onClick={(event) => event.stopPropagation()}>
          <header className="modal-header">
            <div><h3 id="walkin-promotion-picker-title">Chọn promotion</h3><p>Chọn ưu đãi có sẵn hoặc nhập mã promotion.</p></div>
            <button type="button" className="modal-close-btn" onClick={() => setIsWalkInPromotionModalOpen(false)}>Đóng</button>
          </header>
          <div className="promotion-picker-content">
            {walkInPromotions.length > 0 ? <div className="booking-promotion-list" aria-label="Danh sách promotion">
              {walkInPromotions.map((promotion) => <article className="booking-promotion-option" key={promotion.id}>
                <div><strong>{promotion.name}</strong>
                  <span>Mã: <b>{promotion.code}</b> · {promotion.discount_type === 'PERCENT'
                    ? `Giảm ${promotion.discount_value}%${promotion.max_discount ? `, tối đa ${new Intl.NumberFormat('vi-VN').format(promotion.max_discount)} ₫` : ''}`
                    : `Giảm ${new Intl.NumberFormat('vi-VN').format(promotion.discount_value)} ₫`}</span>
                  {promotion.description && <small>{promotion.description}</small>}
                </div>
                <button type="button" className="btn btn-outline btn-sm" disabled={isApplyingWalkInPromotion} onClick={async () => {
                  if (await applyWalkInPromotion(promotion.code)) setIsWalkInPromotionModalOpen(false);
                }}>{isApplyingWalkInPromotion ? 'Đang kiểm tra…' : 'Chọn mã này'}</button>
              </article>)}
            </div> : <p className="customer-promotion-empty">{walkInPromotionLoadError || 'Hiện không có promotion đang áp dụng.'}</p>}
            <form className="promotion-picker-manual" onSubmit={async (event) => {
              event.preventDefault();
              if (await applyWalkInPromotion()) setIsWalkInPromotionModalOpen(false);
            }}>
              <label htmlFor="walkin-promotion-manual-code">Hoặc nhập mã promotion</label>
              <div className="customer-promotion-controls">
                <input id="walkin-promotion-manual-code" value={walkInPromotionCode} placeholder="Nhập mã khuyến mãi" onChange={(event) => {
                  const value = event.target.value.toUpperCase();
                  setWalkInPromotionCode(value);
                  setWalkInAppliedPromotion(null);
                  setWalkInPromotionId('');
                  setWalkInPromotionMessage(value.trim() ? 'Nhấn Áp dụng để kiểm tra mã.' : 'Chọn promotion hoặc nhập mã để áp dụng.');
                }} />
                <button type="submit" className="btn btn-primary" disabled={isApplyingWalkInPromotion}>{isApplyingWalkInPromotion ? 'Đang kiểm tra…' : 'Áp dụng mã'}</button>
              </div>
            </form>
            <p className={`customer-promotion-message${isWalkInPromotionApplied ? ' is-success' : ''}`} role="status" aria-live="polite">{walkInPromotionMessage}</p>
          </div>
        </section>
      </div>}
      </>}

      {/* =========================================================================
          KHỐI 4: DANH SÁCH CÁC ĐƠN ĐẶT PHÒNG GẦN ĐÂY (RECENT BOOKINGS)
          ========================================================================= */}
      {mode === 'management' && <section className="booking-management-list-panel">
        {overdueCheckoutBookings.length > 0 && <aside className="booking-management-checkout-alert" role="alert">
          <div>
            <strong>Có {overdueCheckoutBookings.length} booking chưa checkout đúng hạn</strong>
            <p>Đã qua 12:00 ngày trả phòng nhưng khách vẫn đang lưu trú. Vui lòng liên hệ và xử lý checkout.</p>
          </div>
          <ul>
            {overdueCheckoutBookings.map((booking) => (
              <li key={booking.id}>
                <strong>{booking.booking_code}</strong>
                <span>{booking.guest_full_name} · {booking.guest_phone}</span>
                <span>{booking.room_number ? `Phòng ${booking.room_number}` : booking.room_type_name || 'Chưa gán phòng'}</span>
                <span>Hạn trả phòng: {String(booking.check_out_date).slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </aside>}
        <div className="booking-management-filter-grid">
          <label>
            <span>Tìm booking</span>
            <input
              type="search"
              value={managementQuery}
              onChange={(event) => { setManagementQuery(event.target.value); setManagementPage(1); }}
              placeholder="Mã booking, tên khách, điện thoại, email..."
            />
          </label>
          <label>
            <span>Nhận phòng từ</span>
            <input type="date" value={managementDateFrom} onChange={(event) => { setManagementDateFrom(event.target.value); setManagementPage(1); }} />
          </label>
          <label>
            <span>Đến ngày</span>
            <input type="date" value={managementDateTo} min={managementDateFrom || undefined} onChange={(event) => { setManagementDateTo(event.target.value); setManagementPage(1); }} />
          </label>
          <label>
            <span>Trạng thái booking</span>
            <select value={managementStatus} onChange={(event) => { setManagementStatus(event.target.value); setManagementPage(1); }}>
              <option value="ALL">Tất cả trạng thái</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="CHECKED_IN">CHECKED_IN</option>
            </select>
          </label>
          <label>
            <span>Thanh toán</span>
            <select value={managementPaymentStatus} onChange={(event) => { setManagementPaymentStatus(event.target.value); setManagementPage(1); }}>
              <option value="ALL">Tất cả thanh toán</option>
              <option value="PAID">Đã thanh toán đủ cọc</option>
              <option value="PENDING">Đang chờ</option>
              <option value="PARTIAL">Thanh toán một phần</option>
              <option value="UNPAID">Chưa thanh toán cọc</option>
              <option value="FAILED">Thất bại</option>
              <option value="NOT_REQUIRED">Không yêu cầu đặt cọc</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm booking-management-search-submit"
            onClick={() => setManagementPage(1)}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
            Search
          </button>
          <button type="button" className="btn btn-sm dashboard-refresh-button" onClick={() => void fetchRecent()} disabled={isLoadingBookings}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>
            {isLoadingBookings ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>

        <section className="booking-management-data-card" aria-label="Danh sách booking">
        <DataTable className="booking-management-table-wrap">
          <table className="booking-management-table">
            <thead>
              <tr>
                <th>Mã booking</th>
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th>Loại phòng</th>
                <th>Nhận phòng</th>
                <th>Trả phòng</th>
                <th>Trạng thái</th>
                <th>Thanh toán</th>
                <th>Tổng tiền</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingBookings && managementBookings.length === 0 ? (
                <tr><td colSpan={9} className="booking-management-empty">Đang tải danh sách booking...</td></tr>
              ) : paginatedManagementBookings.length === 0 ? (
                <tr><td colSpan={9} className="booking-management-empty">Không có booking đang lưu trú hoặc nhận phòng trong 7 ngày tới.</td></tr>
              ) : paginatedManagementBookings.map((booking) => (
                <tr
                  key={booking.id}
                  className={selectedBookingDetail?.id === booking.id ? 'selected' : ''}
                  onClick={() => setSelectedBookingDetail(booking)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedBookingDetail(booking);
                    }
                  }}
                  tabIndex={0}
                  title="Chọn để xem chi tiết booking"
                >
                  <td><strong className="booking-code-text">{booking.booking_code}</strong></td>
                  <td>{booking.guest_full_name}</td>
                  <td>{booking.guest_phone}</td>
                  <td>
                    <div>{booking.room_type_name || '—'}{booking.room_number ? ` · P.${booking.room_number}` : ''}</div>
                  </td>
                  <td>{String(booking.check_in_date).slice(0, 10)}</td>
                  <td>{String(booking.check_out_date).slice(0, 10)}</td>
                  <td>
                    <span className={`booking-management-status booking-management-status-${booking.status.toLowerCase()}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td>
                    <span className="booking-management-deposit-amount">Đã cọc: {formatCurrency(booking.deposit_amount)}</span>
                    <small className="booking-management-deposit-status">{getDepositPaymentStatus(booking)}</small>
                  </td>
                  <td>{formatCurrency(booking.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
        <footer className="booking-management-pagination">
          <span>
            Hiển thị {filteredManagementBookings.length ? (managementPage - 1) * managementPageSize + 1 : 0}–
            {Math.min(managementPage * managementPageSize, filteredManagementBookings.length)} / {filteredManagementBookings.length} booking
          </span>
          <div>
            <button type="button" aria-label="Trang trước" disabled={managementPage <= 1} onClick={() => setManagementPage((page) => Math.max(1, page - 1))}>‹</button>
            <span>{managementPage} / {managementPageCount}</span>
            <button type="button" aria-label="Trang sau" disabled={managementPage >= managementPageCount} onClick={() => setManagementPage((page) => Math.min(managementPageCount, page + 1))}>›</button>
          </div>
        </footer>
        </section>
      </section>}

      <div className={`reception-recent-bookings-card${mode === 'management' ? ' booking-management-legacy' : ''}`}>
        <div className="recent-card-header">
          <div>
            <h4 className="module-section-title">{bookingTableTitle}</h4>
            <p className="module-section-subtitle">{bookingTableDescription}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void fetchRecent()}
            disabled={isLoadingBookings}
          >
            {isLoadingBookings ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>

        {mode === 'checkin' && <section className="overdue-bookings-attention" aria-labelledby="overdue-bookings-title">
          <div className="recent-card-header">
            <div>
              <h4 id="overdue-bookings-title" className="module-section-title">Booking chưa Check-in</h4>
              <p className="module-section-subtitle">
                {overdueBookings.length} booking cần xử lý
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void fetchAttentionBookings()}
              disabled={isLoadingAttentionBookings}
            >
              {isLoadingAttentionBookings ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
          {isLoadingAttentionBookings && bookingHistory.length === 0 ? (
            <div className="empty-state-box">Đang tải booking cần xử lý...</div>
          ) : attentionBookingsError ? (
            <div className="reception-alert alert-error">
              {attentionBookingsError}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchAttentionBookings()}>Thử lại</button>
            </div>
          ) : overdueBookings.length === 0 ? (
            <div className="empty-state-box">Không có booking nào cần xử lý sau 18:00 hôm nay.</div>
          ) : (
            <div className="overdue-booking-list">
              {overdueBookings.map((booking) => (
                <article className="overdue-booking-item" key={booking.id}>
                  <dl className="booking-detail-grid">
                    <div><dt>Booking ID</dt><dd>{booking.id}</dd></div>
                    <div><dt>Khách hàng</dt><dd>{booking.guest_full_name}</dd></div>
                    <div><dt>Số điện thoại</dt><dd>{booking.guest_phone}</dd></div>
                    <div><dt>Số phòng</dt><dd>{booking.room_number || 'Chưa gán'}</dd></div>
                    <div><dt>Loại phòng</dt><dd>{booking.room_type_name || '—'}</dd></div>
                    <div><dt>Ngày check-in</dt><dd>{String(booking.check_in_date).slice(0, 10)}</dd></div>
                    <div><dt>Check-in time (mốc xử lý)</dt><dd>18:00</dd></div>
                    <div><dt>Thời gian tạo booking</dt><dd>{formatVietnamDateTime(booking.created_at)}</dd></div>
                    <div><dt>Tiền đặt cọc</dt><dd>{formatCurrency(Number(booking.deposit_amount || 0))}</dd></div>
                    <div><dt>Payment status</dt><dd>{getDepositPaymentStatus(booking)}</dd></div>
                    <div><dt>Trạng thái booking</dt><dd>{booking.status}</dd></div>
                  </dl>
                  <p>Booking này đã đến thời gian xử lý nhưng khách vẫn chưa check-in. Bạn có muốn hủy booking không?</p>
                  <div className="booking-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setSelectedBookingDetail(booking)}>View Details</button>
                    <button type="button" className="btn btn-outline" onClick={() => handleKeepOverdueBooking(booking)}>Keep Booking</button>
                    <button type="button" className="btn btn-primary" onClick={() => { setAttentionCancellationError(null); setBookingToCancel(booking); }}>Cancel Booking</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>}

        {recentBookingsError && <div className="reception-alert alert-error" role="alert">
          {recentBookingsError}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchRecent()}>Retry</button>
        </div>}

        {mode !== 'management' && <form
          className="checkin-booking-filter"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedCheckInFilters({ date: checkInFilterDate, query: checkInFilterQuery });
          }}
        >
          <label className="checkin-booking-filter-date">
            <span className="checkin-booking-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
              {mode === 'checkout' ? 'Check-out Date' : 'Check-in Date'}
            </span>
            <input
              type="date"
              lang="en-GB"
              value={checkInFilterDate}
              onChange={(event) => setCheckInFilterDate(event.target.value)}
              aria-label={mode === 'checkout' ? 'Check-out Date' : 'Check-in Date'}
            />
          </label>
          <label className="checkin-booking-filter-search">
            <span className="sr-only">Search bookings</span>
            <svg className="checkin-booking-filter-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
            <input
              type="search"
              value={checkInFilterQuery}
              onChange={(event) => setCheckInFilterQuery(event.target.value)}
              placeholder="Search by booking code, guest name, room number, phone..."
              aria-label="Search by booking code, guest name, room number, phone"
            />
          </label>
          <button type="submit" className="checkin-booking-filter-submit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
            Search
          </button>
          <button
            type="button"
            className="checkin-booking-filter-refresh"
            disabled={isLoadingBookings}
            onClick={() => {
              setCheckInFilterDate('');
              setCheckInFilterQuery('');
              setAppliedCheckInFilters({ date: '', query: '' });
              void fetchRecent();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>
            Làm mới
          </button>
        </form>}

        <DataTable className="table-wrap">
          <table className="reception-table">
            <thead>
              <tr>
                <th>Mã đặt</th>
                <th>Khách hàng</th>
                <th>Số ĐT</th>
                <th>Loại phòng</th>
                <th>Số phòng</th>
                <th>Trạng thái phòng</th>
                <th>Thời gian ở</th>
                <th>Ngày tạo booking</th>
                <th>Tổng tiền</th>
                <th>Tiền cọc</th>
                <th>Trạng thái booking</th>
                {mode !== 'management' && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {isLoadingBookings && recentBookings.length === 0 ? (
                <tr>
                  <td colSpan={mode === 'management' ? 11 : 12} className="text-center py-4 text-muted">Loading bookings...</td>
                </tr>
              ) : visibleBookings.length === 0 ? (
                <tr>
                  <td colSpan={mode === 'management' ? 11 : 12} className="text-center py-4 text-muted">
                    {mode === 'checkin'
                      ? 'Hiện không có booking nào chờ check-in.'
                      : mode === 'checkout'
                        ? 'Hiện không có khách nào đang chờ check-out.'
                        : 'Hiện không có booking nào đang hoạt động.'}
                  </td>
                </tr>
              ) : (
                visibleBookings.map((b) => (
                  <React.Fragment key={b.id}>
                  <tr className="booking-history-row" onClick={() => setSelectedBookingDetail(b)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBookingDetail(b); } }} tabIndex={0} title="Nhấn để xem chi tiết booking">
                    <td>
                      <strong className="booking-code-text">{b.booking_code}</strong>
                    </td>
                    <td>{b.guest_full_name}</td>
                    <td>{b.guest_phone}</td>
                    <td>{b.room_type_name || 'Phòng'}</td>
                    <td>
                      {b.room_number ? (
                        <span className="room-tag-pill">P.{b.room_number}</span>
                      ) : (
                        <span className="text-muted">Chưa gán</span>
                      )}
                    </td>
                    <td>
                      {b.room_status ? <span className={`room-status-badge room-status-${b.room_status.toLowerCase()}`}>
                        {({ AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' } as const)[b.room_status]}
                      </span> : <span className="text-muted">Chưa gán</span>}
                    </td>
                    <td className="text-sm">
                      {b.check_in_date ? String(b.check_in_date).slice(0, 10) : ''} →{' '}
                      {b.check_out_date ? String(b.check_out_date).slice(0, 10) : ''}
                    </td>
                    <td className="text-sm">{b.created_at ? new Date(b.created_at).toLocaleString('vi-VN') : '—'}</td>
                    <td>{formatCurrency(b.total_amount)}</td>
                    <td>{formatCurrency(b.deposit_amount)}</td>
                    <td>
                      <span className={`status-badge ${b.status === 'CHECKED_IN' ? 'status-checked-in' : 'status-confirmed'}`}>
                        {b.status === 'CHECKED_IN' ? 'Đã check-in' : 'Chờ check-in'}
                      </span>
                    </td>
                    {mode !== 'management' && <td onClick={(event) => event.stopPropagation()}>
                      {mode === 'checkin' && b.status === 'CONFIRMED' ? (
                        b.requires_deposit_payment && Number(b.deposit_amount) < Number(b.required_deposit_amount || 0) ? (
                          <button type="button" disabled title="Khách cần thanh toán đủ cọc tối thiểu 30% trước khi check-in.">Chưa đủ cọc</button>
                        ) : (
                          <button type="button" className="reception-booking-action" onClick={() => {
                            void openCheckInPage(b);
                          }}>Xác nhận check-in</button>
                        )
                      ) : mode === 'checkout' && b.has_pending_final_payment ? (
                        <button type="button" disabled>Đang chờ thanh toán</button>
                      ) : mode === 'checkout' && b.status === 'CHECKED_IN' ? (
                        <button type="button" className="reception-booking-action" disabled={String(isCheckingOut) === String(b.id)} onClick={() => void handleCheckOut(b)}>
                          {String(isCheckingOut) === String(b.id) ? 'Đang xử lý…' : 'Checkout & thanh toán'}
                        </button>
                      ) : '—'}
                    </td>}
                  </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </DataTable>
        {selectedBookingDetail && <div className={`booking-detail-backdrop${mode === 'management' ? ' booking-management-detail-backdrop' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !isUpdatingSelectedBooking && !isCancellingSelectedBooking) { setSelectedBookingDetail(null); setIsEditingSelectedBooking(false); } }}>
          <section className="booking-detail-modal" role="dialog" aria-modal="true" aria-labelledby="reception-booking-detail-title">
            <header className="booking-detail-header"><div><span>Chi tiết booking</span><h3 id="reception-booking-detail-title">{selectedBookingDetail.booking_code}</h3></div><button type="button" aria-label="Đóng" disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking} onClick={() => { setSelectedBookingDetail(null); setIsEditingSelectedBooking(false); }}>×</button></header>
            {isEditingSelectedBooking && selectedBookingDetail.status === 'CONFIRMED' ? (
              <form className="booking-edit-form" onSubmit={(event) => void handleUpdateSelectedBooking(event)}>
                <label>Khách hàng<input required maxLength={100} value={selectedBookingDraft.guest_full_name} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, guest_full_name: event.target.value })} /></label>
                <label>Số điện thoại<input required type="tel" maxLength={20} value={selectedBookingDraft.guest_phone} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, guest_phone: event.target.value })} /></label>
                <label>Email<input type="email" maxLength={255} value={selectedBookingDraft.guest_email} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, guest_email: event.target.value })} /></label>
                <label>Ngày nhận phòng<input required type="date" value={selectedBookingDraft.check_in_date} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, check_in_date: event.target.value })} /></label>
                <label>Ngày trả phòng<input required type="date" min={selectedBookingDraft.check_in_date || undefined} value={selectedBookingDraft.check_out_date} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, check_out_date: event.target.value })} /></label>
                <label>Số người lớn<input required type="number" min={1} max={selectedBookingAdultsCapacity || 20} value={selectedBookingDraft.adults} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, adults: Number(event.target.value) })} /></label>
                <label>Số trẻ em<input required type="number" min={0} max={selectedBookingChildrenCapacity || 20} value={selectedBookingDraft.children} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, children: Number(event.target.value) })} /></label>
                <label className="booking-edit-wide">Yêu cầu đặc biệt<textarea maxLength={500} rows={3} value={selectedBookingDraft.special_request} onChange={(event) => setSelectedBookingDraft({ ...selectedBookingDraft, special_request: event.target.value })} /></label>
                {selectedBookingRoomError && <div className="reception-alert alert-error booking-edit-wide">{selectedBookingRoomError}</div>}
                <BookingRoomSelectionEditor
                  options={selectedBookingRoomOptions}
                  selections={selectedBookingDraft.room_selections}
                  originalSelections={getBookingRoomSelections(selectedBookingDetail)}
                  reservedSelections={selectedBookingReservedSelections}
                  totalRooms={getBookingRoomSelections(selectedBookingDetail).reduce((sum, selection) => sum + selection.quantity, 0)}
                  loading={isCheckingSelectedBookingRooms}
                  onChange={(room_selections) => setSelectedBookingDraft({ ...selectedBookingDraft, room_selections })}
                />
                <div className="booking-detail-actions booking-edit-wide">
                  <button className="btn btn-primary" type="submit" disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking || isCheckingSelectedBookingRooms || !!selectedBookingRoomError || selectedBookingDraft.adults > selectedBookingAdultsCapacity || selectedBookingDraft.children > selectedBookingChildrenCapacity || selectedBookingDraft.room_selections.reduce((sum, selection) => sum + selection.quantity, 0) < getBookingRoomSelections(selectedBookingDetail).reduce((sum, selection) => sum + selection.quantity, 0)}>{isUpdatingSelectedBooking ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
                  <button className="btn btn-outline" type="button" onClick={() => setIsEditingSelectedBooking(false)} disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking}>Quay lại</button>
                </div>
              </form>
            ) : <>
              <dl className="booking-detail-grid">
                <div><dt>Khách hàng</dt><dd>{selectedBookingDetail.guest_full_name}</dd></div><div><dt>Điện thoại</dt><dd>{selectedBookingDetail.guest_phone}</dd></div>
                <div><dt>Email</dt><dd>{selectedBookingDetail.guest_email || '—'}</dd></div><div><dt>Loại phòng / phòng</dt><dd>{selectedBookingDetail.room_type_name || '—'}{selectedBookingDetail.room_number ? ` · P.${selectedBookingDetail.room_number}` : ' · Chưa gán'}</dd></div>
                <div><dt>Nhận phòng</dt><dd>{String(selectedBookingDetail.check_in_date).slice(0, 10)}</dd></div><div><dt>Trả phòng</dt><dd>{String(selectedBookingDetail.check_out_date).slice(0, 10)}</dd></div>
                <div><dt>Số khách</dt><dd>{selectedBookingDetail.adults} người lớn, {selectedBookingDetail.children} trẻ em</dd></div><div><dt>Trạng thái</dt><dd>{selectedBookingDetail.status}</dd></div>
                <div><dt>Tổng tiền</dt><dd>{formatCurrency(selectedBookingDetail.total_amount)}</dd></div><div><dt>Đã cọc</dt><dd>{formatCurrency(selectedBookingDetail.deposit_amount)}</dd></div>
                <div><dt>Đã thanh toán checkout</dt><dd>{formatCurrency(selectedBookingDetail.final_paid_amount || 0)}</dd></div><div><dt>Còn phải thu</dt><dd>{formatCurrency(selectedBookingDetail.balance_due ?? (selectedBookingDetail.total_amount - selectedBookingDetail.deposit_amount))}</dd></div>
                <div className="booking-detail-wide"><dt>Yêu cầu đặc biệt</dt><dd>{selectedBookingDetail.special_request || 'Không có'}</dd></div>
              </dl>
              <BookingServicePanel bookingId={selectedBookingDetail.id} canAddServices={selectedBookingDetail.status === 'CHECKED_IN' || (selectedBookingDetail.status === 'CONFIRMED' && String(selectedBookingDetail.check_in_date).slice(0, 10) <= today && String(selectedBookingDetail.check_out_date).slice(0, 10) > today)} onTotalChange={(total) => {
                setSelectedBookingDetail((current) => current ? { ...current, total_amount: total } : current);
                setRecentBookings((current) => current.map((booking) => String(booking.id) === String(selectedBookingDetail.id) ? { ...booking, total_amount: total } : booking));
                setManagementBookings((current) => current.map((booking) => String(booking.id) === String(selectedBookingDetail.id) ? { ...booking, total_amount: total } : booking));
              }} />
              <div className="booking-detail-actions">
                {mode === 'management' && selectedBookingDetail.status === 'CONFIRMED' && <>
                  <button type="button" className="btn btn-primary" onClick={startEditingSelectedBooking}>Cập nhật booking</button>
                  <button type="button" className="btn btn-outline" onClick={() => void handleCancelSelectedBooking()} disabled={isCancellingSelectedBooking || isUpdatingSelectedBooking}>
                    {isCancellingSelectedBooking ? 'Đang hủy...' : 'Hủy booking'}
                  </button>
                </>}
                <button type="button" className="btn btn-outline" onClick={() => setSelectedBookingDetail(null)} disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking}>Đóng</button>
              </div>
            </>}
          </section>
        </div>}
        {bookingToCancel && (
          <div className="booking-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isCancellingBooking) setBookingToCancel(null); }}>
            <section className="booking-detail-modal" role="dialog" aria-modal="true" aria-labelledby="overdue-cancel-title">
              <header className="booking-detail-header">
                <div><span>Booking chưa Check-in</span><h3 id="overdue-cancel-title">Xác nhận hủy booking</h3></div>
                <button type="button" aria-label="Đóng" disabled={isCancellingBooking} onClick={() => setBookingToCancel(null)}>×</button>
              </header>
              <p>Bạn có chắc muốn cancel booking này?</p>
              <p><strong>Booking:</strong> {bookingToCancel.booking_code} · {bookingToCancel.guest_full_name}</p>
              <p><strong>Số tiền đặt cọc hiện có:</strong> {formatCurrency(Number(bookingToCancel.deposit_amount || 0))}</p>
              <p>Chính sách xử lý tiền cọc do backend quyết định; giao diện không tự xác định hoàn tiền hay khấu trừ.</p>
              {attentionCancellationError && <div className="reception-alert alert-error">{attentionCancellationError}</div>}
              <div className="booking-detail-actions">
                <button type="button" className="btn btn-outline" onClick={() => setBookingToCancel(null)} disabled={isCancellingBooking}>Không, quay lại</button>
                <button type="button" className="btn btn-primary" onClick={() => void handleCancelOverdueBooking()} disabled={isCancellingBooking}>
                  {isCancellingBooking ? 'Đang hủy...' : 'Xác nhận cancel'}
                </button>
              </div>
            </section>
          </div>
        )}
        {selectedCheckInBooking && (
          <div className="checkin-modal-backdrop checkin-workflow-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isCheckingIn) setSelectedCheckInBooking(null); }}>
            <section className="checkin-modal checkin-workflow" role="dialog" aria-modal="true" aria-labelledby="checkin-modal-title">
              <header className="checkin-modal-header checkin-workflow-header">
                <div><span className="checkin-modal-eyebrow">Check-in Guest</span><h3 id="checkin-modal-title">Xác nhận nhận phòng</h3><p>Kiểm tra thông tin, gán phòng và hoàn tất check-in.</p></div>
                <button type="button" className="checkin-modal-close" aria-label="Đóng" onClick={() => !isCheckingIn && setSelectedCheckInBooking(null)} disabled={isCheckingIn}>×</button>
              </header>
              <form className="checkin-verification-form checkin-workflow-form" onSubmit={(event) => void handleSubmitCheckIn(event)}>
                <section className="checkin-workflow-section">
                  <h4><span>1</span> Thông tin booking <span className="status-badge status-confirmed">CONFIRMED</span></h4>
                  <div className="checkin-booking-overview">
                    <div><small>Mã booking</small><strong>{selectedCheckInBooking.booking_code}</strong></div>
                    <div><small>Loại phòng</small><strong>{selectedCheckInBooking.room_type_name || 'Phòng'}</strong></div>
                    <div><small>Nhận phòng</small><strong>{String(selectedCheckInBooking.check_in_date).slice(0, 10)} · 14:00</strong></div>
                    <div><small>Trả phòng</small><strong>{String(selectedCheckInBooking.check_out_date).slice(0, 10)} · 12:00</strong></div>
                    <div><small>Thời gian lưu trú</small><strong>{calculateNights(String(selectedCheckInBooking.check_in_date).slice(0, 10), String(selectedCheckInBooking.check_out_date).slice(0, 10))} đêm</strong></div>
                    <div><small>Số phòng</small><strong>{checkInRoomSlots.length || getBookingRoomSelections(selectedCheckInBooking).reduce((sum, room) => sum + room.quantity, 0)}</strong></div>
                  </div>
                </section>

                <section className="checkin-workflow-section">
                  <h4><span>2</span> Thông tin khách</h4>
                  <div className="checkin-workflow-grid">
                    <label>Họ và tên<input value={selectedCheckInBooking.guest_full_name} readOnly /></label>
                    <label>Số điện thoại<input value={selectedCheckInBooking.guest_phone} readOnly /></label>
                    <label>Email<input value={selectedCheckInBooking.guest_email || 'Chưa cung cấp'} readOnly /></label>
                    {selectedCheckInBooking.has_guest_id_card ? (
                      <div className="checkin-identity-saved"><strong>CCCD/CMND</strong><span>Đã lưu trong hồ sơ khách</span></div>
                    ) : (
                      <label>CCCD khách đặt online <span className="req">*</span><input
                        type="text"
                        inputMode="numeric"
                        maxLength={12}
                        value={checkInIdCard}
                        onChange={(event) => setCheckInIdCard(event.target.value)}
                        autoComplete="off"
                        placeholder="Nhập CCCD gồm 12 chữ số"
                      /></label>
                    )}
                  </div>
                  <label className="checkbox-inline checkin-identity-confirmation">
                    <input type="checkbox" checked={hasVerifiedOriginalId} onChange={(event) => setHasVerifiedOriginalId(event.target.checked)} />
                    Đã xem giấy tờ bản gốc và đối chiếu với khách đặt phòng
                  </label>
                </section>

                <section className="checkin-workflow-section">
                  <h4><span>3</span> Gán phòng & thông tin check-in</h4>
                  {isLoadingCheckInRooms ? <p className="checkin-workflow-muted">Đang tải danh sách phòng phù hợp...</p> : checkInRoomSlots.length === 0 ? (
                    <p className="checkin-workflow-error">Không tìm thấy phòng trong booking. Không thể tiếp tục check-in.</p>
                  ) : <div className="checkin-room-assignment-list">
                    {checkInRoomSlots.map((slot, index) => {
                      const usedByOtherSlot = new Set(Object.entries(checkInRoomIds)
                        .filter(([slotId]) => Number(slotId) !== slot.booking_room_id)
                        .map(([, roomId]) => roomId));
                      const availableRooms = slot.rooms.filter((room) =>
                        room.status === 'AVAILABLE'
                        && (!usedByOtherSlot.has(String(room.id)) || checkInRoomIds[slot.booking_room_id] === String(room.id)));
                      return <label key={slot.booking_room_id}>
                        <span>{slot.room_type_name} · Phòng {index + 1}</span>
                        <select
                          required
                          value={checkInRoomIds[slot.booking_room_id] || ''}
                          onChange={(event) => setCheckInRoomIds((current) => ({ ...current, [slot.booking_room_id]: event.target.value }))}
                          disabled={isLoadingCheckInRooms || isCheckingIn || !availableRooms.length}
                        >
                          <option value="">{availableRooms.length ? 'Chọn phòng còn trống' : 'Không có phòng sẵn sàng'}</option>
                          {availableRooms.map((room) => <option key={room.id} value={room.id}>Phòng {room.room_number} · Tầng {room.floor}</option>)}
                        </select>
                      </label>;
                    })}
                  </div>}
                  <div className="checkin-workflow-grid checkin-stay-details">
                    <label>Ngày check-in<input value={String(selectedCheckInBooking.check_in_date).slice(0, 10)} readOnly /></label>
                    <label>Giờ check-in<input value="14:00" readOnly /></label>
                    <label>Số người lớn<input value={`${selectedCheckInBooking.adults} người`} readOnly /></label>
                    <label>Số trẻ em<input value={`${selectedCheckInBooking.children} trẻ em`} readOnly /></label>
                  </div>
                </section>

                <section className="checkin-workflow-section">
                  <h4><span>4</span> Chi phí ban đầu</h4>
                  <div className="checkin-charge-table">
                    <div className="checkin-charge-head"><span>Loại chi phí</span><span>Đơn giá / đêm</span><span>Số lượng</span><span>Thành tiền</span></div>
                    {(selectedCheckInBooking.room_selections || []).map((selection) => {
                      const nights = calculateNights(String(selectedCheckInBooking.check_in_date).slice(0, 10), String(selectedCheckInBooking.check_out_date).slice(0, 10));
                      const price = Number(selection.price_per_night || 0);
                      return <div className="checkin-charge-row" key={selection.room_type_id}>
                        <span>{selection.room_type_name}</span><span>{formatCurrency(price)}</span><span>{selection.quantity}</span><strong>{formatCurrency(price * selection.quantity * nights)}</strong>
                      </div>;
                    })}
                  </div>
                  <div className="checkin-charge-summary">
                    <div><span>Tổng tiền booking</span><strong>{formatCurrency(Number(selectedCheckInBooking.total_amount || 0))}</strong></div>
                    <div><span>Đã đặt cọc</span><strong>{formatCurrency(Number(selectedCheckInBooking.deposit_amount || 0))}</strong></div>
                    <div><span>Còn lại (thu khi checkout)</span><strong>{formatCurrency(Math.max(0, Number(selectedCheckInBooking.total_amount || 0) - Number(selectedCheckInBooking.deposit_amount || 0) - Number(selectedCheckInBooking.final_paid_amount || 0)))}</strong></div>
                  </div>
                  <p className="checkin-workflow-muted">Check-in không thu thêm tiền. Khoản còn lại được đối soát khi checkout.</p>
                </section>

                <section className="checkin-workflow-section">
                  <h4><span>5</span> Ghi chú</h4>
                  <textarea value={selectedCheckInBooking.special_request || ''} readOnly rows={2} placeholder="Booking không có ghi chú." />
                </section>

                <div className="booking-actions checkin-workflow-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setSelectedCheckInBooking(null)} disabled={isCheckingIn}>Hủy</button>
                  <button type="submit" className="btn btn-primary" disabled={isCheckingIn || isLoadingCheckInRooms}>{isCheckingIn ? 'Đang xác nhận...' : 'Xác nhận check-in'}</button>
                </div>
              </form>
            </section>
          </div>
        )}
        {selectedCheckOutBooking && !createdInvoice && (
          <div className="checkout-page-backdrop">
            <section className="checkout-page" role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
              <header className="checkout-page-header">
                <div><span className="checkin-modal-eyebrow">CHECK-OUT GUEST</span><h3 id="checkout-modal-title">Check-out và thanh toán</h3><p>Kiểm tra thông tin lưu trú, đối soát chi phí và hoàn tất trả phòng.</p></div>
                <button className="checkin-modal-close" type="button" aria-label="Đóng" disabled={isCheckingOut != null || isCreatingInvoice} onClick={() => setSelectedCheckOutBooking(null)}>×</button>
              </header>
              <div className="checkout-page-body">
                <section className="checkout-page-section">
                  <h4>Thông tin booking <span className="status-badge status-checked-in">ĐANG LƯU TRÚ</span></h4>
                  <div className="checkout-page-grid">
                    <div><small>Mã booking</small><strong>{selectedCheckOutBooking.booking_code}</strong></div>
                    <div><small>Loại phòng</small><strong>{selectedCheckOutBooking.room_type_name || 'Phòng'}</strong></div>
                    <div><small>Phòng</small><strong>{selectedCheckOutBooking.room_number || 'Chưa gán'}</strong></div>
                    <div><small>Nhận phòng</small><strong>{String(selectedCheckOutBooking.check_in_date).slice(0, 10)} · 14:00</strong></div>
                    <div><small>Trả phòng</small><strong>{String(selectedCheckOutBooking.check_out_date).slice(0, 10)} · 12:00</strong></div>
                    <div><small>Thời gian lưu trú</small><strong>{calculateNights(String(selectedCheckOutBooking.check_in_date).slice(0, 10), String(selectedCheckOutBooking.check_out_date).slice(0, 10))} đêm</strong></div>
                  </div>
                </section>
                <section className="checkout-page-section checkout-room-condition">
                  <h4>Tình trạng phòng sau khi trả</h4>
                  <div className="checkout-room-status"><span className="room-status-dot" /><div><strong>Phòng {selectedCheckOutBooking.room_number || 'được gán cho booking'}</strong><small>Phòng sẽ chuyển sang trạng thái cần dọn sau khi checkout thành công.</small></div><span className="checkout-cleaning-badge">CẦN DỌN</span></div>
                </section>
                <section className="checkout-page-section">
                  <h4>Thông tin khách</h4>
                  <div className="checkout-page-grid">
                    <div><small>Họ và tên</small><strong>{selectedCheckOutBooking.guest_full_name}</strong></div>
                    <div><small>Số điện thoại</small><strong>{selectedCheckOutBooking.guest_phone}</strong></div>
                    <div><small>Email</small><strong>{selectedCheckOutBooking.guest_email || 'Chưa cung cấp'}</strong></div>
                    <div><small>Số khách</small><strong>{selectedCheckOutBooking.adults} người lớn · {selectedCheckOutBooking.children} trẻ em</strong></div>
                  </div>
                </section>
                <section className="checkout-page-section">
                  <h4>Đối soát chi phí booking</h4>
                  <div className="checkout-charge-row"><span>Tiền phòng và dịch vụ đã tính trong booking</span><strong>{formatCurrency(Number(selectedCheckOutBooking.total_amount || 0))}</strong></div>
                  <div className="checkout-charge-row"><span>Đã thanh toán trước / đặt cọc</span><strong>− {formatCurrency(Number(selectedCheckOutBooking.deposit_amount || 0))}</strong></div>
                  <div className="checkout-charge-row"><span>Đã thanh toán checkout</span><strong>− {formatCurrency(Number(selectedCheckOutBooking.final_paid_amount || 0))}</strong></div>
                  <div className="checkout-total-row"><span>Còn phải thu</span><strong>{formatCurrency(Math.max(0, Number(selectedCheckOutBooking.balance_due ?? (selectedCheckOutBooking.total_amount - selectedCheckOutBooking.deposit_amount - Number(selectedCheckOutBooking.final_paid_amount || 0))) || 0))}</strong></div>
                  <p className="checkout-page-note">Các khoản phát sinh ngoài booking cần được ghi nhận vào booking trước khi thu tiền.</p>
                </section>
                <section className="checkout-page-section">
                  <h4>Hóa đơn</h4>
                <div className="checkout-page-actions">
                  <button className="btn btn-outline" type="button" disabled={isCheckingOut != null} onClick={() => setSelectedCheckOutBooking(null)}>Quay lại</button>
                  <button className="btn btn-primary checkout-create-invoice-btn" type="button" disabled={isCheckingOut != null || isCreatingInvoice} onClick={() => void createCheckoutInvoice()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>
                    {isCreatingInvoice ? 'Đang tạo hóa đơn…' : 'Tạo hóa đơn'}
                  </button>
                </div>
                </section>
              </div>
            </section>
          </div>
        )}
        {createdInvoice && (
          <div className="checkout-created-invoice-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isCheckingOut) setCreatedInvoice(null);
          }}>
            <section className="checkout-created-invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="created-invoice-title">
              <header className="checkout-created-invoice-header">
                <div>
                  <span>CHECK-OUT GUEST</span>
                  <h2 id="created-invoice-title">{createdInvoice.created ? 'Hóa đơn đã được tạo' : 'Thông tin hóa đơn'}</h2>
                  <p>Kiểm tra thông tin hóa đơn trước khi tiếp tục thanh toán.</p>
                </div>
                <button type="button" aria-label="Đóng" disabled={isCheckingOut != null} onClick={() => setCreatedInvoice(null)}>×</button>
              </header>
              <div className={`checkout-invoice-notice ${createdInvoice.created ? 'is-success' : 'is-existing'}`} role="status">
                <span className="checkout-invoice-check" aria-hidden="true">{createdInvoice.created ? '✓' : 'i'}</span>
                <div>
                  <strong>{createdInvoice.created ? 'Tạo hóa đơn thành công!' : 'Booking đã có hóa đơn.'}</strong>
                  <p>Mã hóa đơn: {createdInvoice.detail.invoice_number}. {createdInvoice.created ? 'Vui lòng kiểm tra thông tin bên dưới.' : 'Hệ thống đã mở hóa đơn hiện có, không tạo bản trùng.'}</p>
                </div>
              </div>
              <div className="checkout-created-invoice-body">
                <div className="checkout-created-invoice-overview">
                  <section className="checkout-created-invoice-card checkout-created-invoice-main-card">
                    <h3>Thông tin hóa đơn</h3>
                    <dl>
                      <div><dt>Mã hóa đơn</dt><dd>{createdInvoice.detail.invoice_number}</dd></div>
                      <div><dt>Ngày tạo</dt><dd>{formatVietnamDateTime(createdInvoice.detail.issued_at)}</dd></div>
                      <div><dt>Trạng thái</dt><dd><span className={`checkout-invoice-status ${createdInvoice.detail.amount_due <= 0 || createdInvoice.detail.status.toUpperCase() === 'PAID' ? 'is-paid' : 'is-open'}`}>{createdInvoice.detail.amount_due <= 0 || createdInvoice.detail.status.toUpperCase() === 'PAID' ? 'Đã thanh toán' : 'Chờ thanh toán'}</span></dd></div>
                      <div><dt>Nhân viên lập</dt><dd>{createdInvoice.detail.created_by_full_name || '—'}</dd></div>
                    </dl>
                  </section>
                  <section className="checkout-created-invoice-card checkout-created-invoice-booking-card">
                    <h3>Thông tin booking</h3>
                    <dl>
                      <div><dt>Mã booking</dt><dd>{createdInvoice.detail.booking_code}</dd></div>
                      <div><dt>Loại phòng</dt><dd>{Object.entries(createdInvoice.detail.rooms.reduce<Record<string, number>>((counts, room) => {
                        if (room.room_type_name) counts[room.room_type_name] = (counts[room.room_type_name] || 0) + 1;
                        return counts;
                      }, {})).map(([name, count]) => `${name} × ${count}`).join(', ') || '—'}</dd></div>
                      <div><dt>Phòng</dt><dd>{createdInvoice.detail.rooms.map((room) => room.room_number).filter(Boolean).join(', ') || '—'}</dd></div>
                      <div><dt>Nhận phòng</dt><dd>{String(createdInvoice.detail.check_in_date || '').slice(0, 10) || '—'}</dd></div>
                      <div><dt>Trả phòng</dt><dd>{String(createdInvoice.detail.check_out_date || '').slice(0, 10) || '—'}</dd></div>
                      <div><dt>Số đêm</dt><dd>{calculateNights(String(createdInvoice.detail.check_in_date || '').slice(0, 10), String(createdInvoice.detail.check_out_date || '').slice(0, 10))}</dd></div>
                    </dl>
                  </section>
                  <section className="checkout-created-invoice-card checkout-created-invoice-customer-card">
                    <h3>Thông tin khách hàng</h3>
                    <dl>
                      <div><dt>Họ và tên</dt><dd>{createdInvoice.detail.customer_full_name || createdInvoice.detail.guest_full_name || '—'}</dd></div>
                      <div><dt>Số điện thoại</dt><dd>{createdInvoice.detail.customer_phone || createdInvoice.detail.guest_phone || '—'}</dd></div>
                      <div><dt>Email</dt><dd>{createdInvoice.detail.customer_email || createdInvoice.detail.guest_email || '—'}</dd></div>
                      <div><dt>CCCD</dt><dd>{createdInvoice.detail.guest_id_card_number || '—'}</dd></div>
                      <div><dt>Số người lớn</dt><dd>{createdInvoice.detail.adults}</dd></div>
                      <div><dt>Số trẻ em</dt><dd>{createdInvoice.detail.children}</dd></div>
                    </dl>
                  </section>
                <section className="checkout-created-invoice-card checkout-created-invoice-items">
                  <h3>Chi tiết khoản mục</h3>
                  <div className="table-responsive">
                    <table>
                      <thead><tr><th>#</th><th>Loại</th><th>Nội dung</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
                      <tbody>{createdInvoice.detail.items.length ? createdInvoice.detail.items.map((item, index) => {
                        const roomIndex = createdInvoice.detail.items.slice(0, index).filter((candidate) => candidate.item_type === 'ROOM').length;
                        const room = item.item_type === 'ROOM' ? createdInvoice.detail.rooms[roomIndex] : undefined;
                        const description = room
                          ? `${room.room_type_name} - ${room.room_number || 'Chưa xếp'}`
                          : item.item_type === 'SERVICE' && item.room_number
                            ? `${item.description} - ${item.room_number}`
                            : item.description || '—';
                        return <tr key={`${item.item_type}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{item.item_type === 'ROOM' ? 'Tiền phòng' : item.item_type === 'SERVICE' ? 'Dịch vụ' : item.item_type === 'OTHER' ? 'Phụ thu' : item.item_type}</td>
                          <td>{description}</td>
                          <td>{formatCurrency(item.unit_price)}</td>
                          <td>{item.item_type === 'ROOM' ? `1 phòng · ${item.quantity} đêm` : item.quantity}</td>
                          <td>{formatCurrency(item.amount)}</td>
                        </tr>;
                      }) : <tr><td colSpan={6} className="checkout-invoice-empty">Hóa đơn chưa có khoản mục.</td></tr>}</tbody>
                    </table>
                  </div>
                </section>
                </div>
                <div className="checkout-created-invoice-payment">
                  <div className="checkout-created-invoice-payment-left">
                    <section className="checkout-created-invoice-card checkout-created-invoice-method-card">
                      <h3>Phương thức thanh toán</h3>
                      <fieldset className="checkout-created-invoice-methods">
                        <label className={checkOutPaymentMethod === 'CASH' ? 'is-selected' : ''}>
                          <input type="radio" name="checkout-invoice-payment-method" value="CASH" checked={checkOutPaymentMethod === 'CASH'} onChange={() => { setCheckOutPaymentMethod('CASH'); setCashTenderError(''); }} />
                          <svg className="checkout-payment-method-icon cash" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M4 10h16M8 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M7 7V5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                          <span><strong>Tiền mặt</strong><small>Thanh toán trực tiếp tại quầy</small></span>
                        </label>
                        <label className={`${checkOutPaymentMethod === 'VNPAY' ? 'is-selected' : ''}${!vnpayEnabled ? ' is-demo' : ''}`} title={!vnpayEnabled ? 'VNPay chỉ hiển thị minh họa; chưa bật cấu hình thanh toán' : undefined}>
                          <input type="radio" name="checkout-invoice-payment-method" value="VNPAY" checked={checkOutPaymentMethod === 'VNPAY'} onChange={() => { setCheckOutPaymentMethod('VNPAY'); setCashTenderError(''); }} aria-label="Thanh toán qua cổng VNPay" />
                          <span className="checkout-payment-method-vnpay-brand">
                            <img className="checkout-payment-method-logo-vnpay" src="/vnpay-logo-full.jpg" alt="VNPay — Cho cuộc sống đơn giản hơn" />
                            <small>Thanh toán qua cổng VNPay</small>
                          </span>
                        </label>
                      </fieldset>
                    </section>
                    <section className="checkout-created-invoice-card checkout-created-invoice-note-card">
                      <h3>Ghi chú (tùy chọn)</h3>
                      <textarea value={checkOutPaymentNote} onChange={(event) => setCheckOutPaymentNote(event.target.value)} maxLength={500} rows={3} placeholder="Nhập ghi chú..." />
                      <small>{checkOutPaymentNote.length}/500</small>
                    </section>
                  </div>
                  <div className="checkout-created-invoice-payment-right">
                    <section className="checkout-created-invoice-card checkout-created-invoice-summary">
                      <h3>Tổng kết hóa đơn</h3>
                      <div><span>Tổng tiền</span><strong>{formatCurrency(createdInvoice.detail.total_amount)}</strong></div>
                      <div><span>Đã thanh toán (tiền cọc)</span><strong>{formatCurrency(createdInvoice.detail.deposit_paid)}</strong></div>
                      <div className="checkout-invoice-due"><span>Số tiền còn phải thanh toán</span><strong>{formatCurrency(createdInvoice.detail.amount_due)}</strong></div>
                    </section>
                    {checkOutPaymentMethod === 'CASH' && <section className="checkout-created-invoice-card checkout-cash-payment-card">
                      <h3>Thông tin thanh toán tiền mặt</h3>
                      <div className="checkout-cash-payment-row">
                        <label htmlFor="checkout-cash-tendered">Tiền khách đưa</label>
                        <div className="checkout-cash-input-wrap">
                          <input id="checkout-cash-tendered" type="number" min="0" step="1" inputMode="numeric" value={cashTendered} aria-invalid={Boolean(cashTenderError)} aria-describedby={cashTenderError ? 'checkout-cash-tender-error' : undefined} onChange={(event) => { setCashTendered(event.target.value); setCashTenderError(''); }} placeholder="Nhập số tiền khách đưa" />
                          <span>₫</span>
                        </div>
                      </div>
                      <div className="checkout-cash-payment-row">
                        <span>Tiền trả lại khách</span>
                        <strong className={cashChangeDue > 0 ? 'has-change' : ''}>{formatCurrency(cashChangeDue)}</strong>
                      </div>
                      {cashTenderError && <p id="checkout-cash-tender-error" className="checkout-cash-insufficient" role="alert" aria-live="assertive">{cashTenderError}</p>}
                    </section>}
                  </div>
                </div>
              </div>
              <footer className="checkout-created-invoice-actions">
                <button className="btn btn-outline" type="button" disabled={isCheckingOut != null} onClick={() => setCreatedInvoice(null)}>← Quay lại chỉnh sửa</button>
                <button className="btn btn-primary" type="button" disabled={isCheckingOut != null || createdInvoice.detail.amount_due <= 0 || createdInvoice.detail.status.toUpperCase() === 'PAID'} onClick={continueInvoicePayment}>
                  {createdInvoice.detail.amount_due <= 0 || createdInvoice.detail.status.toUpperCase() === 'PAID' ? 'Đã thanh toán' : isCheckingOut != null ? 'Đang xử lý…' : 'Xác nhận thanh toán'}
                </button>
              </footer>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
