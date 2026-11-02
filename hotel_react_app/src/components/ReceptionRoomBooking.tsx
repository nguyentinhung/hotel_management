import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  checkRoomAvailability,
  checkInBooking,
  getAssignableRooms,
  getActiveBookings,
  getBookingDetails,
  getBookingHistory,
  cancelBooking,
  createWalkInBooking,
  updateBooking,
} from '../services/roomService';
import type {
  RecentBooking,
  RoomAvailabilityItem,
  ServiceItem,
  WalkInBookingPayload,
} from '../types';
import BookingServicePanel from './BookingServicePanel';
import BookingRoomSelectionEditor, { type BookingRoomSelection } from './BookingRoomSelectionEditor';
import { createReceptionCheckout, createReceptionInvoice, getInvoiceDetails, syncReceptionBookingCompensations, type SyncReceptionCompensationsResponse } from '../services/paymentService';
import StayExtensionModal from './StayExtensionModal';
import BookingHoldExtensionModal from './BookingHoldExtensionModal';
import { retryOrGoToLogin } from '../utils/sessionRetry';
import { formatHotelDateTime, getCheckInDateTime, getHotelDate, getHoldCountdown, STANDARD_CHECK_IN_TIME } from '../utils/checkInCountdown';
import type { InvoiceDetail } from '../services/paymentService';
import CheckoutPaymentSuccessModal, { type CheckoutPaymentSuccess } from './CheckoutPaymentSuccessModal';
import { assignCheckoutCleaningRoom, getCleaningTask, listCheckoutCleaningRooms, listCleaningHousekeepers, saveInspectionItemCompensation, type CheckoutCleaningRoom, type CleaningTaskInspectionReport } from '../services/cleaningTaskService';
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
const formatDateInput = getHotelDate;

// Cộng thêm ngày
const addDays = (dateStr: string, days: number) => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

function getVietnamCheckoutCutoffUtc(date: string) {
  return Date.parse(`${date}T05:00:00.000Z`);
}

function formatHoldRemaining(booking: RecentBooking, now: Date) {
  if (booking.status === 'CANCELLED') {
    return booking.cancellation_reason === 'RESERVATION_EXPIRED' ? 'Đã tự động hủy' : 'Đã hủy';
  }
  if (booking.status === 'CHECKED_IN') return 'Đã check-in';
  if (booking.status !== 'CONFIRMED') return 'Chưa xác nhận';
  const holdUntil = booking.hold_until ? new Date(booking.hold_until).getTime() : NaN;
  if (!Number.isFinite(holdUntil)) return 'Chưa có hạn giữ phòng';
  const remaining = holdUntil - now.getTime();
  if (remaining <= 0) return 'Quá hạn check-in';
  const totalMinutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${minutes} phút`;
}

function getCheckInHoldState(booking: RecentBooking, today: string, now: Date) {
  if (booking.status === 'CANCELLED' && booking.cancellation_reason === 'RESERVATION_EXPIRED') return 'Đã tự động hủy';
  if (booking.status === 'CHECKED_IN') return 'Đã check-in';
  if (booking.status !== 'CONFIRMED') return booking.status;
  if (booking.hold_until && new Date(booking.hold_until).getTime() <= now.getTime()) return 'Quá hạn check-in';
  if (booking.hold_extended) return 'Đã gia hạn giữ phòng';
  if (String(booking.check_in_date).slice(0, 10) > today) return 'Chưa đến hạn check-in';
  return 'Đang giữ phòng';
}

function formatVietnamDateTime(value?: string | null) {
  if (!value) return '—';
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
type CompensationDecision = 'COMPENSATION' | 'NO_COMPENSATION' | '';
type CompensationDraft = { decision: CompensationDecision; amount: string };

function calculateCompensationAmount(unitPrice: number): string {
  const price = Number(unitPrice);
  if (!Number.isFinite(price) || price < 0) return '0';
  return String(Math.round(price * 80) / 100);
}

function updateCompensationDraftForItem(
  current: Record<string, CompensationDraft>,
  itemId: string,
  fallback: CompensationDraft,
  update: Partial<CompensationDraft>,
) {
  return {
    ...current,
    [itemId]: { ...(current[itemId] || fallback), ...update },
  };
}

function validateCompensationAmount(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return 'Enter an amount greater than zero.';
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return 'Enter a valid numeric amount.';

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  if (fractionalPart.length > 2) return 'Use no more than 2 decimal places.';

  const whole = (wholePart || '0').replace(/^0+(?=\d)/, '');
  if (whole.length > 12) return 'The maximum amount is 999999999999.99.';
  const cents = BigInt(whole) * 100n + BigInt((fractionalPart + '00').slice(0, 2));
  if (cents <= 0n) return 'Enter an amount greater than zero.';
  if (cents > 99999999999999n) return 'The maximum amount is 999999999999.99.';
  return null;
}

export default function ReceptionRoomBooking({
  mode = 'management',
  onViewBookingHistory,
  onCheckInComplete,
  readOnly = false,
}: {
  mode?: ReceptionBookingMode;
  onViewBookingHistory?: () => void;
  onCheckInComplete?: () => void;
  readOnly?: boolean;
}) {
  const { showToast, confirmAction, confirmActionWithInput } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const availabilityRequestId = useRef(0);

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
  const isBookingRequestInFlight = useRef(false);
  const [walkInIdCardFrontImage, setWalkInIdCardFrontImage] = useState<File | null>(null);
  const [walkInIdCardBackImage, setWalkInIdCardBackImage] = useState<File | null>(null);
  const [walkInPurpose, setWalkInPurpose] = useState('LEISURE');
  const [createRoomTypeFilter, setCreateRoomTypeFilter] = useState('ALL');
  const [createMaxPrice, setCreateMaxPrice] = useState('');
  const initialCreateStay = useRef({ checkInDate: '', checkOutDate: '', adults: 0, children: 0 });
  const initialCreateSelection = useRef({ primaryRoomId: '', typeIds: [] as number[] });

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
  const [bookingHistory, setBookingHistory] = useState<RecentBooking[]>([]);
  const [handledOverdueBookingIds, setHandledOverdueBookingIds] = useState<Set<string>>(loadHandledOverdueBookingIds);
  const [attentionNow, setAttentionNow] = useState(() => new Date());
  const [checkInClockNow, setCheckInClockNow] = useState(() => new Date());
  const [isLoadingAttentionBookings, setIsLoadingAttentionBookings] = useState(false);
  const [attentionBookingsError, setAttentionBookingsError] = useState<string | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<RecentBooking | null>(null);
  const [overdueCancellationNote, setOverdueCancellationNote] = useState('');
  const [isCancellingBooking, setIsCancellingBooking] = useState(false);
  const [attentionCancellationError, setAttentionCancellationError] = useState<string | null>(null);
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<RecentBooking | null>(null);
  const [isEditingSelectedBooking, setIsEditingSelectedBooking] = useState(false);
  const [isUpdatingSelectedBooking, setIsUpdatingSelectedBooking] = useState(false);
  const [isCancellingSelectedBooking, setIsCancellingSelectedBooking] = useState(false);
  const [isExtendingStay, setIsExtendingStay] = useState(false);
  const [isExtendingBookingHold, setIsExtendingBookingHold] = useState(false);
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
  const [checkInConfirmationBooking, setCheckInConfirmationBooking] = useState<RecentBooking | null>(null);
  const [checkInRoomSlots, setCheckInRoomSlots] = useState<Awaited<ReturnType<typeof getAssignableRooms>>['room_slots']>([]);
  const [checkInRoomIds, setCheckInRoomIds] = useState<Record<number, string>>({});
  const [isLoadingCheckInRooms, setIsLoadingCheckInRooms] = useState(false);
  const [checkInIdCardFrontImage, setCheckInIdCardFrontImage] = useState<File | null>(null);
  const [checkInIdCardBackImage, setCheckInIdCardBackImage] = useState<File | null>(null);
  const [hasVerifiedOriginalId, setHasVerifiedOriginalId] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState<string | number | null>(null);
  const [selectedCheckOutBooking, setSelectedCheckOutBooking] = useState<RecentBooking | null>(null);
  const [checkoutCleaningRooms, setCheckoutCleaningRooms] = useState<CheckoutCleaningRoom[]>([]);
  const [viewedCheckoutReportTaskIds, setViewedCheckoutReportTaskIds] = useState<Set<string>>(new Set());
  const [compensationConfirmedTaskIds, setCompensationConfirmedTaskIds] = useState<Set<string>>(new Set());
  const [checkoutHousekeepers, setCheckoutHousekeepers] = useState<{ id: string; full_name: string }[]>([]);
  const [checkoutAssigneeDraft, setCheckoutAssigneeDraft] = useState<Record<string, string>>({});
  const [loadingCheckoutAssignments, setLoadingCheckoutAssignments] = useState(false);
  const [assigningCheckoutRoomId, setAssigningCheckoutRoomId] = useState<string | null>(null);
  const [checkoutAssignmentLoadError, setCheckoutAssignmentLoadError] = useState('');
  const [checkoutInspectionReport, setCheckoutInspectionReport] = useState<CleaningTaskInspectionReport | null>(null);
  const [checkoutInspectionTaskId, setCheckoutInspectionTaskId] = useState<string | null>(null);
  const [compensationDrafts, setCompensationDrafts] = useState<Record<string, CompensationDraft>>({});
  const [compensationAmountErrors, setCompensationAmountErrors] = useState<Record<string, string>>({});
  const [savingCompensationItemId, setSavingCompensationItemId] = useState<string | null>(null);
  const [compensationMessage, setCompensationMessage] = useState('');
  const [compensationError, setCompensationError] = useState('');
  const [isCompensationConfirmOpen, setIsCompensationConfirmOpen] = useState(false);
  const [checkoutCompensationReconciliation, setCheckoutCompensationReconciliation] = useState<Record<string, {
    invoice: InvoiceDetail;
    compensationItems: SyncReceptionCompensationsResponse['compensation_items'];
  }>>({});
  const [pendingCheckoutCompensations, setPendingCheckoutCompensations] = useState<Record<string, SyncReceptionCompensationsResponse['compensation_items']>>({});
  const [loadingCheckoutReport, setLoadingCheckoutReport] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{ detail: InvoiceDetail; created: boolean } | null>(null);
  const [checkOutPaymentMethod, setCheckOutPaymentMethod] = useState<'CASH' | 'VNPAY'>('CASH');
  const [checkOutPaymentNote, setCheckOutPaymentNote] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [cashTenderError, setCashTenderError] = useState('');
  const vnpayEnabled = import.meta.env.VITE_VNPAY_ENABLED === 'true';
  const [checkoutSuccess, setCheckoutSuccess] = useState<CheckoutPaymentSuccess | null>(null);

  useEffect(() => {
    if (!isCompensationConfirmOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCompensationConfirmOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isCompensationConfirmOpen]);

  useEffect(() => {
    if (mode !== 'checkout' || searchParams.get('restoreCheckoutInvoice') !== '1') return;
    const invoiceId = Number(sessionStorage.getItem('hotelManagement.checkoutInvoiceId'));
    const bookingId = sessionStorage.getItem('hotelManagement.checkoutBookingId');
    const wasCreated = sessionStorage.getItem('hotelManagement.checkoutInvoiceCreated') === 'true';
    const paymentResult = searchParams.get('checkoutPaymentResult');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('restoreCheckoutInvoice');
    nextParams.delete('checkoutPaymentResult');
    setSearchParams(nextParams, { replace: true });
    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1 || !bookingId) {
      showToast('Không tìm thấy hóa đơn cần mở lại.', 'error');
      return;
    }
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Session expired. Please sign in again.', 'error');
      return;
    }
    void Promise.all([getInvoiceDetails(invoiceId), getBookingDetails(bookingId, accessToken)]).then(([detail, bookingResult]) => {
      setCreatedInvoice({ detail, created: wasCreated });
      setSelectedCheckOutBooking(bookingResult.booking);
      if (paymentResult === 'failed' || paymentResult === 'invalid') setCheckOutPaymentMethod('VNPAY');
      sessionStorage.removeItem('hotelManagement.checkoutInvoiceId');
      sessionStorage.removeItem('hotelManagement.checkoutBookingId');
      sessionStorage.removeItem('hotelManagement.checkoutInvoiceCreated');
      sessionStorage.removeItem('hotelManagement.checkoutPaymentCode');
      sessionStorage.removeItem('hotelManagement.vnpayReturnPath');
      if (paymentResult === 'failed') showToast('Giao dịch VNPay chưa hoàn tất. Hóa đơn vẫn được giữ để bạn thử lại.', 'error');
      if (paymentResult === 'invalid') showToast('Không xác thực được kết quả VNPay. Hóa đơn vẫn được giữ để bạn kiểm tra.', 'error');
    }).catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : 'Không thể mở lại hóa đơn.', 'error');
    });
  }, [mode, searchParams, setSearchParams, showToast]);

  const vietnamToday = getHotelDate(attentionNow);
  const checkInTodayBookings = useMemo(() => bookingHistory
    .filter((booking) => booking.status === 'CONFIRMED'
      && String(booking.check_in_date).slice(0, 10) === getHotelDate(checkInClockNow)
      // This list shows the hold/check-in window; omit rows whose actual hold starts on another day.
      && Boolean(booking.hold_start)
      && String(booking.hold_start).slice(0, 10) === getHotelDate(checkInClockNow))
    .sort((a, b) => {
      const timeDifference = getCheckInDateTime(String(a.check_in_date)) - getCheckInDateTime(String(b.check_in_date));
      if (timeDifference !== 0) return timeDifference;
      const holdA = a.hold_until ? new Date(a.hold_until).getTime() : Number.POSITIVE_INFINITY;
      const holdB = b.hold_until ? new Date(b.hold_until).getTime() : Number.POSITIVE_INFINITY;
      return holdA - holdB;
    }), [bookingHistory, checkInClockNow]);
  const overdueBookings = bookingHistory.filter((booking) => {
    return booking.status === 'CONFIRMED'
      && Boolean(booking.hold_until)
      && attentionNow.getTime() >= new Date(booking.hold_until as string).getTime()
      && !handledOverdueBookingIds.has(String(booking.id));
  });
  const overdueCheckoutBookings = managementBookings.filter((booking) => {
    const checkOutDate = String(booking.check_out_date).slice(0, 10);
    const checkoutCutoff = getVietnamCheckoutCutoffUtc(checkOutDate);
    return booking.status === 'CHECKED_IN'
      && Number.isFinite(checkoutCutoff)
      && attentionNow.getTime() >= checkoutCutoff;
  });
  const selectedBookingIsOverdueCheckout = selectedBookingDetail?.status === 'CHECKED_IN'
    && attentionNow.getTime() >= getVietnamCheckoutCutoffUtc(String(selectedBookingDetail.check_out_date).slice(0, 10));

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
  const fetchAvailability = async (criteria?: { check_in_date: string; check_out_date: string; adults: number; children: number }) => {
    const requestId = ++availabilityRequestId.current;
    try {
      setIsLoadingAvailability(true);
      setAvailabilityError(null);

      const res = await checkRoomAvailability({
        check_in_date: criteria?.check_in_date ?? checkInDate,
        check_out_date: criteria?.check_out_date ?? checkOutDate,
        adults: criteria?.adults ?? adults,
        children: criteria?.children ?? children,
      });

      if (requestId !== availabilityRequestId.current) return [];
      setAvailabilityList(res.data || []);
      return res.data || [];
    } catch (err) {
      if (requestId === availabilityRequestId.current) setAvailabilityError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra phòng trống.');
      return [];
    } finally {
      if (requestId === availabilityRequestId.current) setIsLoadingAvailability(false);
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
        setBookingHistory(history.bookings || []);
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

  const resetOverdueBookingDecision = (bookingId: string | number) => {
    const updatedIds = new Set(handledOverdueBookingIds);
    updatedIds.delete(String(bookingId));
    try {
      localStorage.setItem(overdueDecisionStorageKey, JSON.stringify([...updatedIds]));
    } catch (error) {
      console.error('Could not reset handled overdue-booking decision:', error);
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
      const result = await cancelBooking(bookingToCancel.id, accessToken, overdueCancellationNote);
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
    const confirmation = await confirmActionWithInput({
      title: 'Hủy booking?',
      message: `Bạn có chắc muốn hủy booking ${selectedBookingDetail.booking_code}?`,
      confirmLabel: 'Hủy booking',
      destructive: true,
      inputLabel: 'Ghi chú hủy (không bắt buộc)',
      inputPlaceholder: 'Nhập ghi chú cho việc hủy booking',
      inputMaxLength: 500,
    });
    if (!confirmation.confirmed) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }
    try {
      setIsCancellingSelectedBooking(true);
      const result = await cancelBooking(selectedBookingDetail.id, accessToken, confirmation.input);
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
    if (!selectedCheckInBooking.has_guest_id_card && !checkInIdCardFrontImage) {
      showToast('Vui lòng tải ảnh CCCD mặt trước lên để check-in booking online.', 'error');
      return;
    }
    if (!selectedCheckInBooking.has_guest_id_card_back && !checkInIdCardBackImage) {
      showToast('Vui lòng tải ảnh CCCD mặt sau lên để check-in.', 'error');
      return;
    }
    const checkInIdCardImages = [checkInIdCardFrontImage, checkInIdCardBackImage].filter((image): image is File => Boolean(image));
    if (checkInIdCardImages.some((image) => !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024)) {
      showToast('Mỗi ảnh CCCD phải là JPG, PNG hoặc WEBP và không quá 5 MB.', 'error');
      return;
    }
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }

    try {
      setIsCheckingIn(true);
      const result = await checkInBooking(
        selectedCheckInBooking.id,
        accessToken,
        checkInRoomSlots.map((slot) => ({
          booking_room_id: slot.booking_room_id,
          room_id: Number(checkInRoomIds[slot.booking_room_id]),
        })),
        checkInIdCardFrontImage || undefined,
        checkInIdCardBackImage || undefined,
      );
      showToast(result.message, 'success');
      setSelectedCheckInBooking(null);
      setCheckInRoomSlots([]);
      setCheckInRoomIds({});
      setCheckInIdCardFrontImage(null);
      setCheckInIdCardBackImage(null);
      setHasVerifiedOriginalId(false);
      await Promise.all([
        fetchRecent(),
        ...(mode === 'checkin' ? [fetchAttentionBookings()] : []),
      ]);
      onCheckInComplete?.();
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
    setCheckInIdCardFrontImage(null);
    setCheckInIdCardBackImage(null);
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

  const loadCheckoutRoomsWithReports = async (bookingId: string | number, accessToken: string) => {
    const rooms = await listCheckoutCleaningRooms(bookingId, accessToken);
    return Promise.all(rooms.map(async (room) => {
      if (!room.task_id || !room.inspection_submitted) return { ...room, inspection_report: null };
      try {
        const task = await getCleaningTask(room.task_id, accessToken);
        const inspectionReport = task.inspection_report ?? null;
        return {
          ...room,
          inspection_report: inspectionReport,
          report_requires_compensation_decision: Boolean(inspectionReport?.items.some(
            (item) => item.status === 'DAMAGED' || item.status === 'MISSING',
          )),
        };
      } catch {
        return { ...room, inspection_report: null };
      }
    }));
  };

  const handleCheckOut = async (booking: RecentBooking) => {
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
    setCheckoutCleaningRooms([]);
    setViewedCheckoutReportTaskIds(new Set());
    setCompensationConfirmedTaskIds(new Set());
    setCheckoutHousekeepers([]);
    setCheckoutAssigneeDraft({});
    setCheckoutAssignmentLoadError('');
    setLoadingCheckoutAssignments(true);
    try {
      const [rooms, housekeepers] = await Promise.all([
        loadCheckoutRoomsWithReports(booking.id, accessToken),
        listCleaningHousekeepers(accessToken),
      ]);
      setCheckoutCleaningRooms(rooms);
      setCheckoutHousekeepers(housekeepers);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tải được phòng hoặc Housekeeper để phân công.';
      setCheckoutAssignmentLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoadingCheckoutAssignments(false);
    }
  };

  const assignCheckoutHousekeeper = async (room: CheckoutCleaningRoom) => {
    if (!selectedCheckOutBooking || !room.room_id || !checkoutAssigneeDraft[room.booking_room_id] || assigningCheckoutRoomId) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }
    setAssigningCheckoutRoomId(room.booking_room_id);
    try {
      const result = await assignCheckoutCleaningRoom(
        selectedCheckOutBooking.id,
        room,
        checkoutAssigneeDraft[room.booking_room_id],
        accessToken,
      );
      setCheckoutCleaningRooms((current) => current.map((item) => item.booking_room_id === room.booking_room_id
        ? { ...item, task_id: result.task.id, task_status: result.task.status, assigned_to: result.task.assigned_to, assigned_to_name: result.task.assigned_to_name, inspection_submitted: result.task.inspection_submitted ?? false }
        : item));
      showToast(result.already_assigned ? 'Task Checkout Cleaning đã được phân công cho Housekeeper này.' : result.created ? 'Đã tạo và phân công Checkout Cleaning task.' : 'Đã phân công task Checkout Cleaning đang chờ cho Housekeeper.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể phân công Checkout Cleaning task.', 'error');
    } finally {
      setAssigningCheckoutRoomId(null);
    }
  };

  const refreshCheckoutTasks = async () => {
    if (!selectedCheckOutBooking) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return;
    setLoadingCheckoutAssignments(true);
    try {
      const [rooms, housekeepers] = await Promise.all([
        loadCheckoutRoomsWithReports(selectedCheckOutBooking.id, accessToken),
        listCleaningHousekeepers(accessToken),
      ]);
      setCheckoutCleaningRooms(rooms);
      setCheckoutHousekeepers(housekeepers);
      setCheckoutAssignmentLoadError('');
    } catch (error) {
      setCheckoutAssignmentLoadError(error instanceof Error ? error.message : 'Could not refresh checkout tasks.');
    } finally {
      setLoadingCheckoutAssignments(false);
    }
  };

  const openCheckoutInspectionReport = async (taskId: string) => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return;
    setLoadingCheckoutReport(true);
    try {
      const task = await getCleaningTask(taskId, accessToken);
      if (!task.inspection_report) throw new Error('Inspection report has not been submitted yet.');
      const reportRequiresCompensationDecision = task.inspection_report.items.some(
        (item) => item.status === 'DAMAGED' || item.status === 'MISSING',
      );
      setViewedCheckoutReportTaskIds((current) => new Set(current).add(taskId));
      setCompensationConfirmedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      setCheckoutCleaningRooms((current) => current.map((room) => room.task_id === taskId
        ? { ...room, report_requires_compensation_decision: reportRequiresCompensationDecision }
        : room));
      setCheckoutInspectionReport(task.inspection_report);
      setCheckoutInspectionTaskId(taskId);
      setCompensationDrafts(Object.fromEntries(task.inspection_report.items.map((item) => [item.inspection_item_id, {
        decision: item.compensation_decision || '',
        amount: item.compensation_decision === 'COMPENSATION'
          ? String(item.compensation_amount ?? calculateCompensationAmount(item.unit_price))
          : calculateCompensationAmount(item.unit_price),
      }])));
      setCompensationAmountErrors({});
      setCompensationMessage('');
      setCompensationError('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load the inspection report.', 'error');
    } finally {
      setLoadingCheckoutReport(false);
    }
  };

  const saveCheckoutCompensation = async (itemId: string) => {
    if (!checkoutInspectionReport || !checkoutInspectionTaskId || savingCompensationItemId) return;
    const item = checkoutInspectionReport.items.find((entry) => entry.inspection_item_id === itemId);
    const draft = compensationDrafts[itemId];
    if (!item || !draft?.decision) return;
    const amountError = draft.decision === 'COMPENSATION' ? validateCompensationAmount(draft.amount) : null;
    if (amountError) {
      setCompensationAmountErrors((current) => ({ ...current, [itemId]: amountError }));
      setCompensationMessage('');
      return;
    }
    const parsedAmount = draft.decision === 'COMPENSATION' ? Number(draft.amount) : undefined;
    setCompensationAmountErrors((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    const token = localStorage.getItem('accessToken');
    if (!token) { setCompensationError('Your session has expired. Sign in again.'); return; }
    setSavingCompensationItemId(itemId);
    setCompensationError('');
    setCompensationMessage('');
    try {
      const response = await saveInspectionItemCompensation(
        checkoutInspectionTaskId, itemId, draft.decision, parsedAmount, token,
      );
      const saved = response.compensation;
      setCheckoutInspectionReport((current) => current ? {
        ...current,
        items: current.items.map((entry) => entry.inspection_item_id === itemId
          ? { ...entry, compensation_decision: saved.decision, compensation_amount: saved.amount }
          : entry),
      } : current);
      setCompensationMessage(`Saved decision for ${item.equipment_name}.`);
    } catch (error) {
      setCompensationError(error instanceof Error ? error.message : 'Could not save this compensation decision.');
    } finally {
      setSavingCompensationItemId(null);
    }
  };

  const openCompensationConfirmation = () => {
    if (!checkoutInspectionReport || !selectedCheckOutBooking || savingCompensationItemId) return;
    setCompensationError('');
    setCompensationMessage('');
    setIsCompensationConfirmOpen(true);
  };

  const confirmApplyCheckoutCompensations = () => {
    if (!checkoutInspectionReport || !checkoutInspectionTaskId || !selectedCheckOutBooking
      || savingCompensationItemId || hasUnsavedCompensationChanges || hasUnresolvedCompensationDecisions) return;
    const report = checkoutInspectionReport;
    const reportTaskId = checkoutInspectionTaskId;
    const bookingId = String(selectedCheckOutBooking.id);
    setPendingCheckoutCompensations((current) => {
      const itemsByInspectionId = new Map((current[bookingId] || []).map((item) => [item.inspection_item_id, item]));
      for (const item of report.items) {
        if (item.compensation_decision === 'COMPENSATION') {
          itemsByInspectionId.set(item.inspection_item_id, {
            compensation_id: item.inspection_item_id,
            inspection_item_id: item.inspection_item_id,
            decision: 'COMPENSATION',
            amount: Number(item.compensation_amount || 0),
            invoice_item_id: null,
            room_number: report.room_number,
            equipment_name: item.equipment_name,
            asset_code: item.asset_code,
          });
        } else {
          itemsByInspectionId.delete(item.inspection_item_id);
        }
      }
      return { ...current, [bookingId]: Array.from(itemsByInspectionId.values()) };
    });
    if (reportTaskId) setCompensationConfirmedTaskIds((current) => new Set(current).add(reportTaskId));
    setCompensationError('');
    setCompensationMessage('');
    setIsCompensationConfirmOpen(false);
    setCheckoutInspectionReport(null);
    requestAnimationFrame(() => {
      document.getElementById('checkout-payment-reconciliation')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    const amount = report.items.reduce((total, item) => (
      item.compensation_decision === 'COMPENSATION' ? total + Number(item.compensation_amount || 0) : total
    ), 0);
    showToast(`Đã xác nhận ${formatCurrency(amount)} tiền bồi thường. Khoản này sẽ được cộng khi tạo hóa đơn.`, 'success');
  };

  const resumeCheckoutPayment = async (booking: RecentBooking) => {
    try {
      setIsCheckingOut(booking.id);
      const result = await createReceptionCheckout(booking.id, 'VNPAY');
      if (!result.payment_url) throw new Error('Không nhận được đường dẫn thanh toán VNPay.');
      if (result.invoice_id) sessionStorage.setItem('hotelManagement.checkoutInvoiceId', String(result.invoice_id));
      sessionStorage.setItem('hotelManagement.checkoutPaymentCode', result.payment_code);
      window.location.assign(result.payment_url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tiếp tục thanh toán.', 'error');
      setIsCheckingOut(null);
    }
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
        if (createdInvoice?.detail.id) {
          sessionStorage.setItem('hotelManagement.checkoutInvoiceId', String(createdInvoice.detail.id));
          sessionStorage.setItem('hotelManagement.checkoutInvoiceCreated', String(createdInvoice.created));
        }
        sessionStorage.setItem('hotelManagement.checkoutBookingId', String(booking.id));
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
      try {
        setCheckoutCleaningRooms(await listCheckoutCleaningRooms(booking.id, accessToken));
        setCheckoutAssignmentLoadError('');
      } catch (error) {
        setCheckoutAssignmentLoadError(error instanceof Error ? error.message : 'Could not load checkout cleaning tasks.');
      }
      setCreatedInvoice(null);
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
    if (!checkoutReportsReadyForInvoice) {
      showToast('Mở báo cáo của tất cả phòng và xác nhận các quyết định bồi thường trước khi tạo hóa đơn.', 'error');
      return;
    }
    try {
      setIsCreatingInvoice(true);
      setCashTendered('');
      setCashTenderError('');
      const result = await createReceptionInvoice(selectedCheckOutBooking.id);
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const reconciliation = await syncReceptionBookingCompensations(selectedCheckOutBooking.id, token);
      const detail = await getInvoiceDetails(result.invoice_id);
      const bookingId = String(selectedCheckOutBooking.id);
      setCheckoutCompensationReconciliation((current) => ({
        ...current,
        [bookingId]: {
          invoice: reconciliation.invoice,
          compensationItems: reconciliation.compensation_items.filter((item) => item.decision === 'COMPENSATION'),
        },
      }));
      setPendingCheckoutCompensations((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
      setSelectedCheckOutBooking((current) => current && String(current.id) === bookingId
        ? { ...current, balance_due: reconciliation.invoice.amount_due }
        : current);
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
  useEffect(() => {
    if (mode !== 'checkin') return undefined;
    const intervalId = window.setInterval(() => setCheckInClockNow(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, [mode]);
  const filteredManagementBookings = useMemo(() => {
    const query = managementQuery.trim().toLocaleLowerCase();
    return managementBookings.filter((booking) => {
      const checkInDate = String(booking.check_in_date).slice(0, 10);
      const isAutoCancelledForHold = booking.status === 'CANCELLED' && booking.cancellation_reason === 'RESERVATION_EXPIRED';
      if (booking.status !== 'CHECKED_IN' && booking.status !== 'CONFIRMED' && !isAutoCancelledForHold) return false;
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

  const upcomingCheckInAttention = (
    <section className="upcoming-checkin-attention" aria-labelledby="upcoming-checkin-title">
      <div className="upcoming-checkin-heading">
        {mode !== 'management' && <span className="upcoming-checkin-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v3l2 1"/><circle cx="12" cy="16" r="5"/></svg>
        </span>}
        <div>
          <h4 id="upcoming-checkin-title">Có {checkInTodayBookings.length} booking sắp đến giờ Check-in</h4>
          <p>Booking đã xác nhận, có ngày nhận phòng hôm nay (giờ Check-in tiêu chuẩn {STANDARD_CHECK_IN_TIME}).</p>
        </div>
      </div>
      {(mode === 'management' ? isLoadingBookings : isLoadingAttentionBookings) && bookingHistory.length === 0 ? (
        <div className="upcoming-checkin-empty">Đang tải booking Check-in hôm nay...</div>
      ) : (mode === 'management' ? recentBookingsError : attentionBookingsError) ? (
        <div className="reception-alert alert-error" role="alert">
          {mode === 'management' ? recentBookingsError : attentionBookingsError}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => retryOrGoToLogin(mode === 'management' ? recentBookingsError : attentionBookingsError, mode === 'management' ? fetchRecent : fetchAttentionBookings)}>Thử lại</button>
        </div>
      ) : checkInTodayBookings.length === 0 ? (
        <div className="upcoming-checkin-empty">Không có booking nào Check-in hôm nay.</div>
      ) : (
        <div className="upcoming-checkin-list">
          {checkInTodayBookings.map((booking) => {
            const countdown = getHoldCountdown(booking.hold_until, mode === 'management' ? attentionNow : checkInClockNow);
            return <article
              className="upcoming-checkin-row"
              key={booking.id}
              role={mode === 'management' ? 'button' : undefined}
              tabIndex={mode === 'management' ? 0 : undefined}
              onClick={mode === 'management' ? () => setSelectedBookingDetail(booking) : undefined}
              onKeyDown={mode === 'management' ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedBookingDetail(booking);
                }
              } : undefined}
              title={mode === 'management' ? 'Mở chi tiết booking' : undefined}
            >
              <div className="upcoming-checkin-booking">
                <strong>{booking.booking_code || `#${booking.id}`}</strong>
                <span>{booking.guest_full_name || 'Chưa có tên'} · {booking.guest_phone || 'Chưa có số điện thoại'}</span>
              </div>
              <div className="upcoming-checkin-field"><span>Phòng</span><strong>{booking.room_number || 'Chưa gán'}</strong></div>
              <div className="upcoming-checkin-field"><span>Bắt đầu giữ phòng</span><strong>{formatHotelDateTime(booking.hold_start)}</strong><small>Check-in tiêu chuẩn: {STANDARD_CHECK_IN_TIME}</small></div>
              <div className="upcoming-checkin-field"><span>Thời gian còn lại</span><strong className={`upcoming-checkin-countdown upcoming-checkin-countdown-${countdown.status}`}>{countdown.label}</strong><small>Hạn giữ phòng: {formatHotelDateTime(booking.hold_until)}</small></div>
            </article>;
          })}
        </div>
      )}
    </section>
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
    initialCreateSelection.current = {
      primaryRoomId: defaultRoomId,
      typeIds: roomTypes.map((type) => type.id),
    };
    setWalkInIdCardFrontImage(null);
    setWalkInIdCardBackImage(null);
    setWalkInPurpose('LEISURE');
    setSelectedServiceQuantities({});
    setWalkInPromotionId('');
    setWalkInPromotionCode('');
    setWalkInAppliedPromotion(null);
    setWalkInPromotionMessage('Chọn promotion hoặc nhập mã để áp dụng.');
    initialCreateStay.current = { checkInDate, checkOutDate, adults, children };

    setIsModalOpen(true);
  };

  const updateCreateRoomQuantity = (roomTypeId: number, quantity: number) => {
    const roomType = availabilityList.find((item) => item.id === roomTypeId);
    if (!roomType) return;
    const current = [selectedRoomType, ...additionalWalkInTypes].filter((item): item is RoomAvailabilityItem => Boolean(item));
    const next = current.filter((item) => item.id !== roomTypeId);
    for (let index = 0; index < Math.max(0, Math.min(quantity, roomType.available_rooms)); index += 1) next.push(roomType);
    if (!next.length) {
      showToast('Chọn ít nhất một phòng cho booking.', 'error');
      return;
    }
    if (adults > next.reduce((sum, item) => sum + item.max_adults, 0) || children > next.reduce((sum, item) => sum + item.max_children, 0)) {
      showToast('Sức chứa các phòng đã chọn không đủ cho số khách hiện tại.', 'error');
      return;
    }
    const [primary, ...additional] = next;
    const usedByType: Record<number, number> = {};
    const extraIds: Record<number, string> = {};
    additional.forEach((item, index) => {
      const occurrence = usedByType[item.id] || 1;
      usedByType[item.id] = occurrence + 1;
      const candidate = item.available_room_list.filter((room) => room.status === 'AVAILABLE')[occurrence];
      extraIds[index] = candidate ? String(candidate.id) : '';
    });
    const firstRoom = primary.available_room_list.find((room) => room.status === 'AVAILABLE');
    setSelectedRoomType(primary);
    setAdditionalWalkInTypes(additional);
    setAdditionalWalkInRoomIds(extraIds);
    setWalkInForm((form) => ({ ...form, room_id: firstRoom ? String(firstRoom.id) : '' }));
  };

  const refreshCreateAvailability = async (criteria: { check_in_date: string; check_out_date: string; adults: number; children: number }) => {
    const rooms = await fetchAvailability(criteria);
    if (selectedRoomType) {
      const currentSelections = [selectedRoomType, ...additionalWalkInTypes];
      let preserved = currentSelections.map((item) => rooms.find((room) => room.id === item.id && room.is_available)).filter((item): item is RoomAvailabilityItem => Boolean(item));
      if (preserved.length !== currentSelections.length || preserved.length > preserved[0]?.available_rooms) {
        const first = rooms.find((room) => room.is_available);
        preserved = first ? [first] : [];
      }
      if (preserved.length) {
        const [primary, ...additional] = preserved;
        setSelectedRoomType(primary);
        setAdditionalWalkInTypes(additional);
        const firstRoom = primary.available_room_list.find((room) => room.status === 'AVAILABLE');
        setWalkInForm((form) => ({ ...form, room_id: firstRoom ? String(firstRoom.id) : '' }));
      }
    }
  };

  /**
   * Đóng modal đặt phòng
   */
  const handleCloseModal = async () => {
    if (isSubmittingBooking || isLoadingAvailability) return;
    const hasUnsavedChanges = Boolean(
      walkInForm.guest_full_name.trim() || walkInForm.guest_phone.trim() || walkInForm.guest_email.trim() || walkInForm.guest_id_card.trim()
      || walkInIdCardFrontImage || walkInIdCardBackImage || Number(walkInForm.deposit_amount) > 0
      || Object.values(selectedServiceQuantities).some((quantity) => quantity > 0)
      || walkInPromotionCode.trim()
      || walkInPurpose !== 'LEISURE'
      || walkInForm.special_request !== 'Khách đặt trực tiếp tại quầy lễ tân'
      || checkInDate !== initialCreateStay.current.checkInDate || checkOutDate !== initialCreateStay.current.checkOutDate
      || adults !== initialCreateStay.current.adults || children !== initialCreateStay.current.children
      || walkInForm.room_id !== initialCreateSelection.current.primaryRoomId
      || [selectedRoomType?.id, ...additionalWalkInTypes.map((type) => type.id)].some((id, index) => id !== initialCreateSelection.current.typeIds[index])
    );
    if (hasUnsavedChanges && !await confirmAction({
      title: 'Đóng form tạo booking?',
      message: 'Thông tin bạn đã nhập sẽ bị xóa. Bạn có muốn đóng form không?',
      confirmLabel: 'Đóng form',
      destructive: true,
    })) return;
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
    if (isBookingRequestInFlight.current) return;
    if (!selectedRoomType) return;
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      showToast('Ngày trả phòng phải sau ngày nhận phòng.', 'error');
      return;
    }

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
    if (!walkInIdCardFrontImage || !walkInIdCardBackImage) {
      showToast('Vui lòng tải đủ ảnh CCCD mặt trước và mặt sau của khách.', 'error');
      return;
    }
    if ([walkInIdCardFrontImage, walkInIdCardBackImage].some((image) => !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024)) {
      showToast('Mỗi ảnh CCCD phải là JPG, PNG hoặc WEBP và không quá 5 MB.', 'error');
      return;
    }

    try {
      isBookingRequestInFlight.current = true;
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
        guest_id_card: walkInForm.guest_id_card.trim() || undefined,
        deposit_amount: Number(walkInForm.deposit_amount || 0),
        special_request: [walkInPurpose ? `Purpose: ${walkInPurpose}` : '', walkInForm.special_request].filter(Boolean).join(' · '),
        check_in_now: true,
      };

      const res = await createWalkInBooking(payload, walkInIdCardFrontImage, walkInIdCardBackImage);

      showToast(`${res.message} (Khách: ${res.booking.guest_full_name}, Phòng: ${res.booking.room_number || 'Tự gán'}${Number(res.booking.discount_amount || 0) > 0 ? `, Promotion ${res.booking.promotion_code}: giảm ${formatCurrency(Number(res.booking.discount_amount))}` : ''}, Tổng: ${formatCurrency(res.booking.total_amount)})`, 'success');
      setIsModalOpen(false);
      void fetchAvailability();
      void fetchRecent();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Đặt phòng tại quầy thất bại.', 'error');
    } finally {
      isBookingRequestInFlight.current = false;
      setIsSubmittingBooking(false);
    }
  };

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
  const savedCompensationTotal = checkoutInspectionReport?.items.reduce((total, item) => (
    item.compensation_decision === 'COMPENSATION' ? total + Number(item.compensation_amount || 0) : total
  ), 0) || 0;
  const hasUnsavedCompensationChanges = checkoutInspectionReport?.items.some((item) => {
    const draft = compensationDrafts[item.inspection_item_id];
    if (!draft) return false;
    if (draft.decision !== (item.compensation_decision || '')) return true;
    return draft.decision === 'COMPENSATION'
      && Number(draft.amount) !== Number(item.compensation_amount || 0);
  }) || false;
  const hasUnresolvedCompensationDecisions = checkoutInspectionReport?.items.some((item) => (
    (item.status === 'DAMAGED' || item.status === 'MISSING') && !item.compensation_decision
  )) || false;
  const checkoutReportsViewed = checkoutCleaningRooms.length > 0
    && checkoutCleaningRooms.every((room) => Boolean(
      room.task_id && room.inspection_submitted && viewedCheckoutReportTaskIds.has(room.task_id),
    ));
  const checkoutCompensationsConfirmed = checkoutReportsViewed
    && checkoutCleaningRooms.every((room) => (
      !room.report_requires_compensation_decision
      || Boolean(room.task_id && compensationConfirmedTaskIds.has(room.task_id))
    ));
  const checkoutReportsReadyForInvoice = checkoutReportsViewed && checkoutCompensationsConfirmed;
  const checkoutInvoicePrerequisites = checkoutCleaningRooms.flatMap((room) => {
    const roomLabel = room.room_number || `booking room #${room.booking_room_id}`;
    if (!room.task_id) return [`Phòng ${roomLabel}: chưa có Checkout Cleaning task.`];
    if (!room.inspection_submitted) return [`Phòng ${roomLabel}: Housekeeper chưa gửi báo cáo inspection.`];
    if (!viewedCheckoutReportTaskIds.has(room.task_id)) return [`Phòng ${roomLabel}: bạn chưa mở xem báo cáo.`];
    if (room.report_requires_compensation_decision && !compensationConfirmedTaskIds.has(room.task_id)) {
      return [`Phòng ${roomLabel}: chưa lưu và xác nhận quyết định bồi thường.`];
    }
    return [];
  });
  if (checkoutCleaningRooms.length === 0 && !loadingCheckoutAssignments) {
    checkoutInvoicePrerequisites.push('Chưa tải được danh sách phòng cần kiểm tra. Hãy làm mới danh sách.');
  }
  const activeCheckoutReconciliation = selectedCheckOutBooking
    ? checkoutCompensationReconciliation[String(selectedCheckOutBooking.id)]
    : undefined;
  const pendingCheckoutItems = selectedCheckOutBooking
    ? pendingCheckoutCompensations[String(selectedCheckOutBooking.id)]
    : undefined;
  const displayedCheckoutCompensationItems = pendingCheckoutItems ?? activeCheckoutReconciliation?.compensationItems ?? [];
  const displayedCheckoutCompensationTotal = displayedCheckoutCompensationItems.reduce((total, item) => total + Number(item.amount || 0), 0);
  const reconciledFinalPaid = activeCheckoutReconciliation?.invoice.payments
    .filter((payment) => payment.payment_type.toUpperCase() === 'FINAL' && payment.status.toUpperCase() === 'SUCCESS')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const createRoomTypeOptions = availabilityList.filter((item) => {
    const typeMatches = createRoomTypeFilter === 'ALL' || String(item.id) === createRoomTypeFilter;
    const priceMatches = !createMaxPrice || Number(item.base_price) <= Number(createMaxPrice);
    return typeMatches && priceMatches && (!filterOnlyAvailable || item.is_available);
  });
  const selectedCreateRoomCounts = [selectedRoomType, ...additionalWalkInTypes].reduce<Record<number, number>>((counts, item) => {
    if (item) counts[item.id] = (counts[item.id] || 0) + 1;
    return counts;
  }, {});
  const hasAvailableAssignedRooms = Boolean(selectedRoomType?.is_available && walkInForm.room_id
    && additionalWalkInTypes.every((type, index) => type.is_available && Boolean(additionalWalkInRoomIds[index])));

  return (
    <div className={`reception-booking-module${mode === 'management' ? ' booking-management-main-container' : ''}`}>
      {checkoutSuccess && <CheckoutPaymentSuccessModal result={checkoutSuccess} onClose={() => { setCheckoutSuccess(null); setSelectedCheckOutBooking(null); }} />}
      {checkoutInspectionReport && <div className="cleaning-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingCompensationItemId) setCheckoutInspectionReport(null); }}>
        <section className="cleaning-task-modal cleaning-detail-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-inspection-report-title">
          <div className="cleaning-modal-title"><div><span>Checkout Cleaning · Room {checkoutInspectionReport.room_number}</span><h3 id="checkout-inspection-report-title">Equipment Inspection Report</h3></div><button type="button" aria-label="Close report" disabled={Boolean(savingCompensationItemId)} onClick={() => setCheckoutInspectionReport(null)}>×</button></div>
          <dl className="cleaning-inspection-report-summary checkout-inspection-report-summary"><div><dt>Booking</dt><dd>{checkoutInspectionReport.booking_code || '—'}{checkoutInspectionReport.guest_full_name ? ` · ${checkoutInspectionReport.guest_full_name}` : ''}</dd></div><div><dt>Housekeeper</dt><dd>{checkoutInspectionReport.housekeeper_name}</dd></div><div><dt>Submitted at</dt><dd>{formatVietnamDateTime(checkoutInspectionReport.submitted_at)}</dd></div></dl>
          <div className="cleaning-inspection-report-items checkout-inspection-report-items">{checkoutInspectionReport.items.map((item) => {
            const draft = compensationDrafts[item.inspection_item_id] || { decision: '', amount: '' };
            const canDecide = item.status === 'DAMAGED' || item.status === 'MISSING';
            return <article key={item.inspection_item_id}>
              <div className="checkout-inspection-equipment-identity"><strong>{item.equipment_name}</strong><small>{item.asset_code}</small></div>
              <span className={`cleaning-inspection-status is-${item.status.toLowerCase()}`}>{item.status}</span>
              <p>{item.notes || '—'}</p>
              {canDecide && <div className="checkout-compensation-controls">
                <strong>Compensation decision</strong>
                <div className="checkout-compensation-options">
                  <label><input type="radio" name={`compensation-${item.inspection_item_id}`} checked={draft.decision === 'COMPENSATION'} disabled={Boolean(savingCompensationItemId)} onChange={() => setCompensationDrafts((current) => updateCompensationDraftForItem(current, item.inspection_item_id, draft, { decision: 'COMPENSATION', amount: calculateCompensationAmount(item.unit_price) }))} /> Compensation</label>
                  <label><input type="radio" name={`compensation-${item.inspection_item_id}`} checked={draft.decision === 'NO_COMPENSATION'} disabled={Boolean(savingCompensationItemId)} onChange={() => {
                    setCompensationDrafts((current) => updateCompensationDraftForItem(current, item.inspection_item_id, draft, { decision: 'NO_COMPENSATION' }));
                    setCompensationAmountErrors((current) => {
                      const next = { ...current };
                      delete next[item.inspection_item_id];
                      return next;
                    });
                  }} /> No compensation</label>
                </div>
                {draft.decision === 'COMPENSATION' && <label className="checkout-compensation-amount">Amount (80% of equipment price)<input type="number" min="0" step="0.01" value={calculateCompensationAmount(item.unit_price)} readOnly aria-readonly="true" /></label>}
                {item.compensation_decision && <p className="checkout-compensation-saved">Saved: {item.compensation_decision === 'COMPENSATION' ? 'Compensation' : 'No compensation'}{item.compensation_decision === 'COMPENSATION' ? ` · ${formatCurrency(Number(item.compensation_amount || 0))}` : ''}</p>}
                <button type="button" className="btn btn-outline checkout-compensation-save" disabled={!draft.decision || Boolean(savingCompensationItemId)} onClick={() => void saveCheckoutCompensation(item.inspection_item_id)}>
                  {savingCompensationItemId === item.inspection_item_id ? 'Saving…' : 'Save decision'}
                </button>
              </div>}
            </article>;
          })}</div>
          {checkoutInspectionReport.items.some((item) => item.status === 'DAMAGED' || item.status === 'MISSING') && <section className="checkout-compensation-apply">
            <div><span>Saved compensation total</span><strong>{formatCurrency(savedCompensationTotal)}</strong><small>Confirm returns to checkout payment. The charge is added when you create the invoice.</small></div>
            <button type="button" className="btn btn-primary" disabled={Boolean(savingCompensationItemId) || hasUnsavedCompensationChanges || hasUnresolvedCompensationDecisions} onClick={openCompensationConfirmation}>Xác nhận bồi thường</button>
            {hasUnsavedCompensationChanges && <small className="checkout-compensation-unsaved">Save your changed decisions before applying them to the invoice.</small>}
            {hasUnresolvedCompensationDecisions && <small className="checkout-compensation-unsaved">Save a Compensation or No compensation decision for every damaged or missing item.</small>}
          </section>}
          {compensationMessage && <p className="checkout-compensation-feedback is-success" role="status">{compensationMessage}</p>}
          {compensationError && <p className="checkout-compensation-feedback is-error" role="alert">{compensationError}</p>}
        </section>
      </div>}
      {isCompensationConfirmOpen && checkoutInspectionReport && <div className="app-confirm-backdrop checkout-compensation-confirm-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsCompensationConfirmOpen(false);
      }}>
        <section className="app-confirm-dialog checkout-compensation-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="checkout-compensation-confirm-title" aria-describedby="checkout-compensation-confirm-description">
          <header className="checkout-compensation-confirm-header">
            <h2 id="checkout-compensation-confirm-title">Confirm Compensation</h2>
            <button type="button" aria-label="Close confirmation" onClick={() => setIsCompensationConfirmOpen(false)}>×</button>
          </header>
          <p id="checkout-compensation-confirm-description">Confirm the saved equipment compensation and return to Check-out &amp; Payment? No invoice will be created yet; the charge will be added when you create it.</p>
          <div className="checkout-compensation-confirm-total"><span>Saved compensation total</span><strong>{formatCurrency(savedCompensationTotal)}</strong></div>
          {compensationError && <p className="checkout-compensation-confirm-error" role="alert">{compensationError}</p>}
          <footer>
            <button type="button" className="btn btn-outline" onClick={() => setIsCompensationConfirmOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={confirmApplyCheckoutCompensations}>Confirm</button>
          </footer>
        </section>
      </div>}
      {mode === 'management' && <>
      <section className="booking-management-toolbar">
        <div>
          <h3>Quản lý booking</h3>
          <p>Theo dõi thông tin đặt phòng, trạng thái và thanh toán của khách.</p>
        </div>
        <div className="booking-management-toolbar-actions">
          {!readOnly && onViewBookingHistory && <button type="button" className="btn btn-outline" onClick={onViewBookingHistory}>Xem lịch sử booking</button>}
          {!readOnly && <button
            type="button"
            className="btn btn-primary"
            aria-haspopup="dialog"
            onClick={async () => {
              initialCreateStay.current = { checkInDate, checkOutDate, adults, children };
              initialCreateSelection.current = { primaryRoomId: '', typeIds: [] };
              setSelectedRoomType(null);
              setIsModalOpen(true);
              const rooms = await fetchAvailability();
              const firstAvailable = rooms.find((room) => room.is_available);
              if (firstAvailable) handleOpenWalkInModal([firstAvailable]);
              else if (rooms.length) {
                handleOpenWalkInModal([rooms[0]]);
                showToast('Không có phòng khả dụng theo ngày này. Bạn có thể đổi thông tin lưu trú trong popup.', 'error');
              }
              else {
                setSelectedRoomType(null);
                setIsModalOpen(true);
                showToast('Không có phòng phù hợp trong khoảng ngày và số khách đã chọn.', 'error');
              }
            }}
            disabled={isLoadingAvailability}
          >
            {isLoadingAvailability ? 'Đang tải phòng…' : '＋ Tạo booking'}
          </button>}
        </div>
      </section>
      {isModalOpen && (
        <div className="modal-backdrop booking-create-backdrop" onClick={handleCloseModal}>
          <div className="walkin-modal-container booking-create-modal" role="dialog" aria-modal="true" aria-labelledby="walkin-booking-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 id="walkin-booking-title">Tạo booking mới</h3>
                <p>{selectedRoomType ? `Đặt tại quầy · ${selectedRoomType.name} · booking sẽ check-in ngay khi tạo` : 'Không có phòng phù hợp với điều kiện lưu trú hiện tại.'}</p>
              </div>
              <button type="button" className="modal-close-btn" aria-label="Đóng form tạo booking" onClick={handleCloseModal} disabled={isSubmittingBooking || isLoadingAvailability}>
                ×
              </button>
            </div>

            {selectedRoomType ? <form onSubmit={handleSubmitWalkIn} className="walkin-modal-form">
              {/* Tóm tắt thông tin phòng đã chọn */}




              {/* Thông tin khách hàng đến quầy */}
              <section className="booking-create-section"><h4 className="form-sub-header">Guest Information</h4>
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
                  <label htmlFor="guest_id_card_number">Citizen ID / CCCD</label>
                  <input id="guest_id_card_number" type="text" inputMode="numeric" maxLength={50} value={walkInForm.guest_id_card} onChange={(e) => setWalkInForm({ ...walkInForm, guest_id_card: e.target.value })} placeholder="Số CCCD / hộ chiếu" />
                  <small>Ảnh giấy tờ tùy thân vẫn cần tải lên để hoàn tất check-in.</small>
                </div>
                <div className="form-group">
                  <label htmlFor="guest_id_card_front_image">Ảnh CCCD mặt trước <span className="req">*</span></label>
                  <input id="guest_id_card_front_image" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setWalkInIdCardFrontImage(event.target.files?.[0] || null)} />
                  {walkInIdCardFrontImage && <small>Đã chọn: {walkInIdCardFrontImage.name}</small>}
                  <label htmlFor="guest_id_card_back_image">Ảnh CCCD mặt sau <span className="req">*</span></label>
                  <input id="guest_id_card_back_image" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setWalkInIdCardBackImage(event.target.files?.[0] || null)} />
                  <small>Chấp nhận JPG, PNG hoặc WEBP, tối đa 5 MB mỗi ảnh.</small>
                  {walkInIdCardBackImage && <small>Đã chọn: {walkInIdCardBackImage.name}</small>}
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
              </section>

              <section className="booking-create-section"><h4 className="form-sub-header">Stay Information</h4>
                <div className="booking-stay-grid">
                  <label>Check-in Date<input type="date" min={today} value={checkInDate} onChange={(event) => {
                    const nextIn = event.target.value;
                    const nextOut = new Date(nextIn) >= new Date(checkOutDate) ? addDays(nextIn, 1) : checkOutDate;
                    setCheckInDate(nextIn); setCheckOutDate(nextOut);
                    void refreshCreateAvailability({ check_in_date: nextIn, check_out_date: nextOut, adults, children });
                  }} /></label>
                  <label>Check-out Date<input type="date" min={addDays(checkInDate, 1)} value={checkOutDate} onChange={(event) => {
                    const nextOut = event.target.value;
                    if (new Date(nextOut) <= new Date(checkInDate)) return;
                    setCheckOutDate(nextOut);
                    void refreshCreateAvailability({ check_in_date: checkInDate, check_out_date: nextOut, adults, children });
                  }} /></label>
                  <label>Number of Nights<input type="number" value={nights} readOnly aria-readonly="true" /></label>
                  <label>Adults<select value={adults} onChange={(event) => {
                    const nextAdults = Number(event.target.value); setAdults(nextAdults);
                    void refreshCreateAvailability({ check_in_date: checkInDate, check_out_date: checkOutDate, adults: nextAdults, children });
                  }}>{[1,2,3,4,5,6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
                  <label>Children<select value={children} onChange={(event) => {
                    const nextChildren = Number(event.target.value); setChildren(nextChildren);
                    void refreshCreateAvailability({ check_in_date: checkInDate, check_out_date: checkOutDate, adults, children: nextChildren });
                  }}>{[0,1,2,3,4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
                  <label>Purpose of Stay<select value={walkInPurpose} onChange={(event) => setWalkInPurpose(event.target.value)}><option value="LEISURE">Leisure</option><option value="BUSINESS">Business</option><option value="OTHER">Other</option></select></label>
                </div>
              </section>

              <section className="booking-create-section"><h4 className="form-sub-header">Select Room Type</h4>
                <div className="booking-room-filter-grid">
                  <label>Room Type<select value={createRoomTypeFilter} onChange={(event) => setCreateRoomTypeFilter(event.target.value)}><option value="ALL">All room types</option>{availabilityList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Max Price / night<input type="number" min="0" value={createMaxPrice} onChange={(event) => setCreateMaxPrice(event.target.value)} placeholder="Any price" /></label>
                  <label>Availability<select value={filterOnlyAvailable ? 'AVAILABLE' : 'ALL'} onChange={(event) => setFilterOnlyAvailable(event.target.value === 'AVAILABLE')}><option value="ALL">All results</option><option value="AVAILABLE">Available only</option></select></label>
                </div>
                {createRoomTypeOptions.length ? <div className="booking-create-room-type-grid">{createRoomTypeOptions.map((roomType) => {
                  const quantity = selectedCreateRoomCounts[roomType.id] || 0;
                  return <article key={roomType.id} className={`booking-create-room-type-card${quantity ? ' is-selected' : ''}`}>
                    {roomType.image_url ? <img src={roomType.image_url} alt={roomType.name} loading="lazy" /> : <div className="booking-room-image-placeholder">No room image in catalog</div>}
                    <div className="booking-create-room-type-copy"><label><input type="checkbox" disabled={roomType.available_rooms < 1} checked={quantity > 0} onChange={(event) => updateCreateRoomQuantity(roomType.id, event.target.checked ? 1 : 0)} /> <strong>{roomType.name}</strong></label>
                      <small>Up to {roomType.max_adults} adults · {roomType.max_children} children</small><b>{formatCurrency(roomType.base_price)} <small>/ night</small></b>
                      <span className={roomType.available_rooms ? 'room-availability-ok' : 'room-availability-none'}>{roomType.available_rooms} available</span>
                      {quantity > 0 && <label className="booking-room-quantity">Rooms<select value={quantity} onChange={(event) => updateCreateRoomQuantity(roomType.id, Number(event.target.value))}>{Array.from({ length: Math.min(roomType.available_rooms, 10) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select></label>}
                    </div>
                  </article>;
                })}</div> : <div className="empty-state-box">No room types match these stay dates, guest counts, and filters.</div>}
              </section>

              {/* Chọn số phòng cụ thể & Thanh toán */}
              <section className="booking-create-section"><h4 className="form-sub-header">Assign Room ({selectedRoomType.name})</h4>
              <div className="booking-assignment-summary"><span><b>Selected Room Type</b>{selectedRoomType.name}</span><span><b>Stay Duration</b>{nights} nights</span><span><b>Check-in</b>{checkInDate}</span><span><b>Check-out</b>{checkOutDate}</span></div>
              {selectedRoomType.available_room_list.some((room) => room.status === 'AVAILABLE') ? <div className="booking-assign-room-grid">{selectedRoomType.available_room_list.filter((room) => room.status === 'AVAILABLE').map((room) => <label key={room.id} className={`booking-assign-room-card${walkInForm.room_id === String(room.id) ? ' is-selected' : ''}`}><input type="radio" name="assigned_room_id_card" checked={walkInForm.room_id === String(room.id)} onChange={() => setWalkInForm({ ...walkInForm, room_id: String(room.id) })} /><span>Room {room.room_number}</span><small>Available · Floor {room.floor || 1}</small></label>)}</div> : <div className="empty-state-box">No physical room is ready for assignment in this type and date range.</div>}
              <div className="booking-deposit-row">
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
              })}</section>

              <section className="booking-create-section"><h4 className="form-sub-header">Additional Services</h4>
              {serviceOptions.length > 0 ? (
                <div className="service-selection-grid">
                  {serviceOptions.map((service) => (
                    <div className="service-choice-row" key={service.id}>
                      <div className="service-choice-info">
                        <label className="booking-service-check"><input type="checkbox" checked={Boolean(selectedServiceQuantities[service.id])} onChange={(event) => setSelectedServiceQuantities({ ...selectedServiceQuantities, [service.id]: event.target.checked ? 1 : 0 })} />
                        <strong>{service.name}</strong>
                        <span>{formatCurrency(service.price)} / {service.unit}</span>
                        </label>
                      </div>
                      <input
                        aria-label={`Quantity ${service.name}`}
                        type="number"
                        min={selectedServiceQuantities[service.id] ? 1 : 0}
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
              </div></section>

              <section className="booking-create-section booking-room-summary">
                <h3 className="form-sub-header">Promotion / Discount</h3>
                <div className="booking-promotion-selection">
                  <div>{isWalkInPromotionApplied
                    ? <><strong>{walkInAppliedPromotion.code}</strong><span>Đã giảm {formatCurrency(walkInDiscount)}</span></>
                    : <span>{walkInAppliedPromotion ? 'Tạm tính đã thay đổi, vui lòng áp dụng lại mã.' : 'Chưa chọn mã khuyến mãi'}</span>}
                  </div>
                  <button type="button" className="btn btn-outline" onClick={() => setIsWalkInPromotionModalOpen(true)}>
                    {isWalkInPromotionApplied ? 'Đổi promotion' : 'Chọn promotion'}
                  </button>
                  {walkInAppliedPromotion && <button type="button" className="btn btn-outline" onClick={() => { setWalkInPromotionId(''); setWalkInPromotionCode(''); setWalkInAppliedPromotion(null); setWalkInPromotionMessage('Đã bỏ promotion.'); }}>Remove</button>}
                </div>
                <p className={`customer-promotion-message${isWalkInPromotionApplied ? ' is-success' : ''}`} role="status" aria-live="polite">{walkInPromotionMessage}</p>
                <p>Tạm tính: {formatCurrency(walkInSubtotal)}{isWalkInPromotionApplied ? ` · Giảm ${formatCurrency(walkInDiscount)} · Còn ${formatCurrency(walkInTotal)}` : ''}</p>
              </section>

              <section className="booking-create-section booking-summary-strip">
                {selectedRoomType.image_url && <img className="booking-summary-room-image" src={selectedRoomType.image_url} alt={selectedRoomType.name} />}
                <div>
                  <strong>Room Type:</strong> {[selectedRoomType, ...additionalWalkInTypes].map((type) => type.name).join(', ')}
                </div>
                <div>
                  <strong>Room Number:</strong> {selectedRoomType.available_room_list.find((room) => String(room.id) === walkInForm.room_id)?.room_number || 'Not assigned'}
                </div>
                <div>
                  <strong>Stay:</strong> {checkInDate} → {checkOutDate} · {nights} nights
                </div>
                <div>
                  <strong>Guests:</strong> {adults} adults · {children} children
                </div>
                <div><strong>Room Price / night:</strong> {formatCurrency([selectedRoomType, ...additionalWalkInTypes].reduce((sum, type) => sum + type.base_price, 0))}</div>
                <div>
                  <strong>Room Subtotal:</strong>{' '}
                  <span className="text-highlight">
                    {formatCurrency(walkInRoomTotal)}
                  </span>
                </div>
                <div><strong>Service Subtotal:</strong> <span className="text-highlight">{formatCurrency(walkInServiceTotal)}</span></div>
                <div><strong>Discount:</strong> <span>{formatCurrency(walkInDiscount)}</span>{selectedWalkInPromotion && ` · ${selectedWalkInPromotion.code}`}</div>
                <div><strong>Estimated Total:</strong> <span className="text-highlight">{formatCurrency(walkInTotal)}</span><small>Backend confirms the final amount on creation.</small></div>
              </section>

              <div className="modal-actions-bar">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseModal}
                  disabled={isSubmittingBooking}
                >
                  Cancel
                </button>
                <button type="button" className="btn btn-outline" disabled title="Backend hiện chưa hỗ trợ lưu booking nháp.">
                  Save as Draft · chưa hỗ trợ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingBooking || !hasAvailableAssignedRooms}
                  title={!hasAvailableAssignedRooms ? 'Chọn phòng còn trống và gán phòng thực tế trước khi tạo booking.' : undefined}
                >
                  {isSubmittingBooking ? 'Đang tạo đơn...' : 'Create Booking'}
                </button>
              </div>
            </form> : <div className="booking-create-empty">{isLoadingAvailability ? <><strong>Checking room availability…</strong><p>Loading room types and available rooms for the selected stay.</p></> : <><strong>Không có loại phòng trong kết quả</strong><p>Chỉnh thông tin lưu trú để kiểm tra lại phòng.</p></>}<div className="booking-empty-search"><label>Check-in<input type="date" min={today} value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} disabled={isLoadingAvailability} /></label><label>Check-out<input type="date" min={addDays(checkInDate, 1)} value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} disabled={isLoadingAvailability} /></label><label>Adults<select value={adults} onChange={(event) => setAdults(Number(event.target.value))} disabled={isLoadingAvailability}>{[1,2,3,4,5,6].map((count) => <option key={count}>{count}</option>)}</select></label><label>Children<select value={children} onChange={(event) => setChildren(Number(event.target.value))} disabled={isLoadingAvailability}>{[0,1,2,3,4].map((count) => <option key={count}>{count}</option>)}</select></label></div><button type="button" className="btn btn-primary" disabled={isLoadingAvailability} onClick={async () => { const rooms = await fetchAvailability(); const first = rooms.find((room) => room.is_available) || rooms[0]; if (first) handleOpenWalkInModal([first]); else showToast('Không tìm thấy loại phòng phù hợp.', 'error'); }}>Check Availability</button></div>}
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
        <div className="booking-attention-grid">
          {upcomingCheckInAttention}
          <aside className="booking-management-checkout-alert" aria-labelledby="overdue-checkout-title">
            <div>
              <strong id="overdue-checkout-title">Có {overdueCheckoutBookings.length} booking chưa checkout đúng hạn</strong>
              <p>Đã qua 12:00 ngày trả phòng nhưng khách vẫn đang lưu trú. Vui lòng liên hệ và xử lý checkout.</p>
            </div>
            {overdueCheckoutBookings.length === 0 ? (
              <div className="booking-attention-empty">Không có booking nào quá hạn checkout.</div>
            ) : <ul>
              {overdueCheckoutBookings.map((booking) => (
                <li
                  key={booking.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Mở giao diện lưu trú cho ${booking.booking_code}`}
                  onClick={() => {
                    setSelectedBookingDetail(booking);
                    setIsEditingSelectedBooking(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedBookingDetail(booking);
                      setIsEditingSelectedBooking(false);
                    }
                  }}
                >
                  <div className="booking-attention-overdue-guest">
                    <strong>{booking.booking_code}</strong>
                    <span>{booking.guest_full_name} · {booking.guest_phone}</span>
                  </div>
                  <div><span>Phòng</span><strong>{booking.room_number ? `Phòng ${booking.room_number}` : booking.room_type_name || 'Chưa gán phòng'}</strong></div>
                  <div><span>Hạn trả phòng</span><strong>{String(booking.check_out_date).slice(0, 10)}</strong></div>
                </li>
              ))}
            </ul>}
          </aside>
        </div>
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
              <option value="CANCELLED">Đã tự động hủy</option>
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
                <th>Hạn giữ phòng</th>
                <th>Tình trạng check-in</th>
                <th>Trả phòng</th>
                <th>Trạng thái</th>
                <th>Thanh toán</th>
                <th>Tổng tiền</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingBookings && managementBookings.length === 0 ? (
                <tr><td colSpan={11} className="booking-management-empty">Đang tải danh sách booking...</td></tr>
              ) : paginatedManagementBookings.length === 0 ? (
                <tr><td colSpan={11} className="booking-management-empty">Không có booking phù hợp với bộ lọc.</td></tr>
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
                  <td>{booking.hold_until ? formatVietnamDateTime(booking.hold_until) : '—'}<small className="booking-hold-remaining">{formatHoldRemaining(booking, attentionNow)}</small></td>
                  <td><span className="booking-hold-status">{getCheckInHoldState(booking, vietnamToday, attentionNow)}</span></td>
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
        </div>

        {mode === 'checkin' && upcomingCheckInAttention}

        {recentBookingsError && <div className="reception-alert alert-error" role="alert">
          {recentBookingsError}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => retryOrGoToLogin(recentBookingsError, fetchRecent)}>Retry</button>
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
                    <td className="text-sm">{b.created_at ? new Date(b.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</td>
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
                          setCheckInConfirmationBooking(b);
                          }}>Check in</button>
                        )
                      ) : mode === 'checkout' && b.has_pending_final_payment ? (
                        <button type="button" className="reception-booking-action" disabled={String(isCheckingOut) === String(b.id)} onClick={() => void resumeCheckoutPayment(b)}>
                          {String(isCheckingOut) === String(b.id) ? 'Đang mở thanh toán…' : 'Tiếp tục thanh toán'}
                        </button>
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
          <section className={`booking-detail-modal${selectedBookingIsOverdueCheckout ? ' booking-overdue-detail-mode' : ''}`} role="dialog" aria-modal="true" aria-labelledby="reception-booking-detail-title">
            {selectedBookingIsOverdueCheckout ? (
              <header className="overdue-detail-page-header">
                <div className="overdue-detail-title-row">
                  <h2 id="reception-booking-detail-title">Chi tiết booking</h2>
                  <div className="overdue-detail-header-actions">
                    {!readOnly && <button type="button" className="btn btn-outline stay-extension-trigger" onClick={() => setIsExtendingStay(true)}>＋ Gia hạn lưu trú</button>}
                    {!readOnly && <button type="button" className="btn btn-primary" onClick={() => { const booking = selectedBookingDetail; setSelectedBookingDetail(null); handleCheckOut(booking); }}>Check out</button>}
                    <button type="button" aria-label="Đóng" disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking} onClick={() => setSelectedBookingDetail(null)}>×</button>
                  </div>
                </div>
              </header>
            ) : <header className="booking-detail-header"><div><span>Chi tiết booking</span><h3 id="reception-booking-detail-title">{selectedBookingDetail.booking_code}</h3></div><button type="button" aria-label="Đóng" disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking} onClick={() => { setSelectedBookingDetail(null); setIsEditingSelectedBooking(false); }}>×</button></header>}
            {isEditingSelectedBooking && !readOnly && selectedBookingDetail.status === 'CONFIRMED' ? (
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
              {selectedBookingIsOverdueCheckout && <>
                <section className="overdue-detail-booking-banner">
                  <div className="overdue-detail-booking-code"><strong>{selectedBookingDetail.booking_code}</strong><span>Quá hạn checkout</span></div>
                  <div><span aria-hidden="true">♙</span>{selectedBookingDetail.guest_full_name}</div>
                  <div><span aria-hidden="true">☎</span>{selectedBookingDetail.guest_phone}</div>
                  <div><span aria-hidden="true">▤</span>Phòng {selectedBookingDetail.room_number || selectedBookingDetail.room_type_name || 'Chưa gán'}</div>
                  <div><span aria-hidden="true">▢</span>Hạn trả phòng: {String(selectedBookingDetail.check_out_date).slice(0, 10)}</div>
                </section>
                <section className="overdue-detail-stay-card">
                  <h3>Thông tin lưu trú</h3>
                  <dl>
                    <div><dt>Ngày nhận phòng:</dt><dd>{String(selectedBookingDetail.check_in_date).slice(0, 10)}</dd></div>
                    <div><dt>Hạn trả phòng:</dt><dd className="booking-overdue-date">{String(selectedBookingDetail.check_out_date).slice(0, 10)}</dd></div>
                    <div><dt>Thời gian lưu trú:</dt><dd>{calculateNights(String(selectedBookingDetail.check_in_date).slice(0, 10), String(selectedBookingDetail.check_out_date).slice(0, 10))} đêm ({String(selectedBookingDetail.check_in_date).slice(0, 10)} → {String(selectedBookingDetail.check_out_date).slice(0, 10)})</dd></div>
                  </dl>
                </section>
              </>}
              <dl className="booking-detail-grid">
                <div><dt>Khách hàng</dt><dd>{selectedBookingDetail.guest_full_name}</dd></div><div><dt>Điện thoại</dt><dd>{selectedBookingDetail.guest_phone}</dd></div>
                <div><dt>Email</dt><dd>{selectedBookingDetail.guest_email || '—'}</dd></div><div><dt>Loại phòng / phòng</dt><dd>{selectedBookingDetail.room_type_name || '—'}{selectedBookingDetail.room_number ? ` · P.${selectedBookingDetail.room_number}` : ' · Chưa gán'}</dd></div>
                <div><dt>Nhận phòng</dt><dd>{String(selectedBookingDetail.check_in_date).slice(0, 10)}</dd></div><div><dt>Hạn trả phòng</dt><dd className={selectedBookingIsOverdueCheckout ? 'booking-overdue-date' : undefined}>{String(selectedBookingDetail.check_out_date).slice(0, 10)}</dd></div>
                <div><dt>Thời gian lưu trú</dt><dd>{calculateNights(String(selectedBookingDetail.check_in_date).slice(0, 10), String(selectedBookingDetail.check_out_date).slice(0, 10))} đêm ({String(selectedBookingDetail.check_in_date).slice(0, 10)} → {String(selectedBookingDetail.check_out_date).slice(0, 10)})</dd></div>
                <div><dt>Số khách</dt><dd>{selectedBookingDetail.adults} người lớn, {selectedBookingDetail.children} trẻ em</dd></div><div><dt>Trạng thái</dt><dd>{selectedBookingDetail.status}</dd></div>
                <div><dt>Tổng tiền</dt><dd>{formatCurrency(selectedBookingDetail.total_amount)}</dd></div><div><dt>Đã cọc</dt><dd>{formatCurrency(selectedBookingDetail.deposit_amount)}</dd></div>
                <div><dt>Đã thanh toán checkout</dt><dd>{formatCurrency(selectedBookingDetail.final_paid_amount || 0)}</dd></div><div><dt>Còn phải thu</dt><dd>{formatCurrency(selectedBookingDetail.balance_due ?? (selectedBookingDetail.total_amount - selectedBookingDetail.deposit_amount))}</dd></div>
                <div className="booking-detail-wide"><dt>Yêu cầu đặc biệt</dt><dd>{selectedBookingDetail.special_request || 'Không có'}</dd></div>
                {selectedBookingDetail.status === 'CANCELLED' && <div className="booking-detail-wide booking-cancellation-info">
                  <dt>Lý do hủy</dt><dd>{selectedBookingDetail.cancellation_reason_label || 'Chưa ghi nhận'}</dd>
                  {selectedBookingDetail.cancellation_reason_note && <><dt>Ghi chú hủy</dt><dd>{selectedBookingDetail.cancellation_reason_note}</dd></>}
                  {selectedBookingDetail.cancelled_at && <><dt>Thời điểm hủy</dt><dd>{formatVietnamDateTime(selectedBookingDetail.cancelled_at)}</dd></>}
                  <dt>Người thực hiện</dt><dd>{selectedBookingDetail.cancellation_reason_code === 'CUSTOMER_CANCELLED' ? 'Customer' : selectedBookingDetail.cancellation_reason_code === 'RECEPTIONIST_CANCELLED' ? 'Receptionist' : ['CHECK_IN_EXPIRED', 'PAYMENT_TIMEOUT', 'ROOMS_UNAVAILABLE'].includes(selectedBookingDetail.cancellation_reason_code || '') ? 'System' : 'Chưa ghi nhận'}</dd>
                </div>}
              </dl>
              {mode === 'management' && selectedBookingDetail.status === 'CONFIRMED' && <section className="booking-hold-detail-card" aria-label="Thông tin giữ phòng">
                <h4>Thông tin giữ phòng</h4>
                <dl>
                  <div><dt>Hạn giữ phòng</dt><dd>{formatVietnamDateTime(selectedBookingDetail.hold_until)}</dd></div>
                  <div><dt>Thời gian còn lại</dt><dd>{formatHoldRemaining(selectedBookingDetail, attentionNow)}</dd></div>
                  <div><dt>Số lần gia hạn</dt><dd>{Number(selectedBookingDetail.hold_extension_count ?? (selectedBookingDetail.hold_extended ? 1 : 0))}/2</dd></div>
                  <div><dt>Trạng thái check-in</dt><dd>{getCheckInHoldState(selectedBookingDetail, vietnamToday, attentionNow)}</dd></div>
                  <div><dt>Giờ khách dự kiến đến</dt><dd>{formatVietnamDateTime(selectedBookingDetail.expected_arrival_at)}</dd></div>
                  <div><dt>Thời lượng mỗi lần gia hạn</dt><dd>+2 giờ (tối đa 4 giờ)</dd></div>
                </dl>
                {Number(selectedBookingDetail.hold_extension_count ?? (selectedBookingDetail.hold_extended ? 1 : 0)) >= 2 && <p className="booking-hold-extension-limit-note" role="status">Booking đã sử dụng tối đa 2 lần gia hạn giữ phòng.</p>}
              </section>}
              {mode === 'checkin' && <BookingServicePanel bookingId={selectedBookingDetail.id} canAddServices={!readOnly && selectedBookingDetail.status === 'CHECKED_IN'} onTotalChange={(total) => {
                setSelectedBookingDetail((current) => current ? { ...current, total_amount: total } : current);
                setRecentBookings((current) => current.map((booking) => String(booking.id) === String(selectedBookingDetail.id) ? { ...booking, total_amount: total } : booking));
                setManagementBookings((current) => current.map((booking) => String(booking.id) === String(selectedBookingDetail.id) ? { ...booking, total_amount: total } : booking));
              }} />}
              <div className="booking-detail-actions">
                {mode === 'management' && !readOnly && selectedBookingDetail.status === 'CONFIRMED' && (
                  selectedBookingDetail.requires_deposit_payment
                    && Number(selectedBookingDetail.deposit_amount) < Number(selectedBookingDetail.required_deposit_amount || 0)
                    ? <button type="button" disabled title="Khách cần thanh toán đủ tiền cọc tối thiểu 30% trước khi check-in.">Chưa đủ cọc</button>
                    : <button type="button" className="btn btn-primary" onClick={() => setCheckInConfirmationBooking(selectedBookingDetail)}>Check in</button>
                )}
                {mode === 'management' && !readOnly && selectedBookingDetail.status === 'CONFIRMED' && <>
                  {selectedBookingDetail.hold_until && new Date(selectedBookingDetail.hold_until).getTime() > attentionNow.getTime() && <button type="button" className="btn btn-outline" disabled={Number(selectedBookingDetail.hold_extension_count ?? (selectedBookingDetail.hold_extended ? 1 : 0)) >= 2} onClick={() => setIsExtendingBookingHold(true)}>Gia hạn giữ phòng</button>}
                  <button type="button" className="btn btn-primary" onClick={startEditingSelectedBooking}>Cập nhật booking</button>
                  <button type="button" className="btn btn-outline" onClick={() => void handleCancelSelectedBooking()} disabled={isCancellingSelectedBooking || isUpdatingSelectedBooking}>
                    {isCancellingSelectedBooking ? 'Đang hủy...' : 'Hủy booking'}
                  </button>
                </>}
                {mode === 'management' && !readOnly && selectedBookingDetail.status === 'CHECKED_IN' && <button type="button" className="btn btn-primary stay-extension-trigger" onClick={() => setIsExtendingStay(true)}><span aria-hidden="true">＋</span> Gia hạn lưu trú</button>}
                {mode === 'management' && !readOnly && selectedBookingDetail.status === 'CHECKED_IN' && <button type="button" className="btn btn-primary" onClick={() => handleCheckOut(selectedBookingDetail)}>Check out</button>}
                <button type="button" className="btn btn-outline" onClick={() => setSelectedBookingDetail(null)} disabled={isUpdatingSelectedBooking || isCancellingSelectedBooking}>Đóng</button>
              </div>
            </>}
          </section>
        </div>}
        {isExtendingStay && selectedBookingDetail && <StayExtensionModal
          booking={selectedBookingDetail}
          onClose={() => {
            setIsExtendingStay(false);
          }}
          onSuccess={(extension) => {
            setSelectedBookingDetail((current) => current ? {
              ...current,
              check_out_date: extension.check_out_date,
              total_amount: extension.total_amount,
              balance_due: extension.balance_due,
            } : current);
            setIsExtendingStay(false);
            showToast('Gia hạn lưu trú thành công.', 'success');
            void fetchRecent();
          }}
        />}
        {isExtendingBookingHold && selectedBookingDetail && <BookingHoldExtensionModal
          booking={selectedBookingDetail}
          onClose={() => setIsExtendingBookingHold(false)}
          onSuccess={(hold) => {
            const updatedBooking = { ...selectedBookingDetail, ...hold };
            resetOverdueBookingDecision(updatedBooking.id);
            setSelectedBookingDetail(updatedBooking);
            setRecentBookings((current) => current.map((booking) => String(booking.id) === String(updatedBooking.id) ? { ...booking, ...hold } : booking));
            setManagementBookings((current) => current.map((booking) => String(booking.id) === String(updatedBooking.id) ? { ...booking, ...hold } : booking));
            setBookingHistory((current) => current.map((booking) => String(booking.id) === String(updatedBooking.id) ? { ...booking, ...hold } : booking));
            setIsExtendingBookingHold(false);
            setAttentionNow(new Date());
            showToast('Đã gia hạn giữ phòng.', 'success');
            void fetchRecent();
          }}
        />}
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
              <label className="booking-cancellation-note-label">
                <span>Ghi chú hủy (không bắt buộc)</span>
                <textarea value={overdueCancellationNote} onChange={(event) => setOverdueCancellationNote(event.target.value)} maxLength={500} rows={3} placeholder="Nhập ghi chú cho việc hủy booking" />
              </label>
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
        {checkInConfirmationBooking && (
          <div className="booking-detail-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCheckInConfirmationBooking(null);
          }}>
            <section className="booking-detail-modal booking-checkin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-confirm-title">
              <header className="booking-detail-header">
                <div><span>CHECK-IN GUEST</span><h3 id="checkin-confirm-title">Xác nhận check-in</h3></div>
                <button type="button" aria-label="Đóng" onClick={() => setCheckInConfirmationBooking(null)}>×</button>
              </header>
              <div className="booking-checkin-confirm-content">
                <p>Bạn muốn bắt đầu check-in cho booking này?</p>
                <dl>
                  <div><dt>Mã booking</dt><dd>{checkInConfirmationBooking.booking_code}</dd></div>
                  <div><dt>Khách hàng</dt><dd>{checkInConfirmationBooking.guest_full_name}</dd></div>
                  <div><dt>Phòng</dt><dd>{checkInConfirmationBooking.room_number || checkInConfirmationBooking.room_type_name || 'Chưa gán'}</dd></div>
                </dl>
                <p className="booking-checkin-confirm-note">Tiếp tục để kiểm tra giấy tờ khách và xác nhận phòng trước khi hoàn tất check-in.</p>
              </div>
              <div className="booking-detail-actions">
                <button type="button" className="btn btn-outline" onClick={() => setCheckInConfirmationBooking(null)}>Hủy</button>
                <button type="button" className="btn btn-primary" onClick={() => {
                  const booking = checkInConfirmationBooking;
                  setCheckInConfirmationBooking(null);
                  void openCheckInPage(booking);
                }}>Tiếp tục check-in</button>
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
                    <div className="checkin-identity-upload">
                      {selectedCheckInBooking.has_guest_id_card && <div className="checkin-identity-saved"><strong>Mặt trước CCCD</strong><span>Đã lưu trong hồ sơ khách.</span></div>}
                      <label>{selectedCheckInBooking.has_guest_id_card ? 'Cập nhật ảnh mặt trước' : <>Ảnh CCCD mặt trước <span className="req">*</span></>}<input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required={!selectedCheckInBooking.has_guest_id_card}
                        onChange={(event) => setCheckInIdCardFrontImage(event.target.files?.[0] || null)}
                      />{checkInIdCardFrontImage && <small>Ảnh mới: {checkInIdCardFrontImage.name}</small>}</label>
                      {selectedCheckInBooking.has_guest_id_card_back && <div className="checkin-identity-saved"><strong>Mặt sau CCCD</strong><span>Đã lưu trong hồ sơ khách.</span></div>}
                      <label>{selectedCheckInBooking.has_guest_id_card_back ? 'Cập nhật ảnh mặt sau' : <>Ảnh CCCD mặt sau <span className="req">*</span></>}<input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required={!selectedCheckInBooking.has_guest_id_card_back}
                        onChange={(event) => setCheckInIdCardBackImage(event.target.files?.[0] || null)}
                      />{checkInIdCardBackImage && <small>Ảnh mới: {checkInIdCardBackImage.name}</small>}<small>JPG, PNG hoặc WEBP, tối đa 5 MB mỗi ảnh.</small></label>
                    </div>
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
                        {checkInRoomSlots.length > 1 && <span>{slot.room_type_name} · Phòng {index + 1}</span>}
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
                  <button type="submit" className="btn btn-primary" disabled={isCheckingIn || isLoadingCheckInRooms}>{isCheckingIn ? 'Đang check-in...' : 'Check in'}</button>
                </div>
              </form>
            </section>
          </div>
        )}
        {selectedCheckOutBooking && !createdInvoice && !checkoutSuccess && (
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
                <section className="checkout-page-section checkout-cleaning-assignments">
                  <h4>Assign Housekeeper · Checkout Cleaning</h4>
                  <p>Phân công công việc riêng cho từng phòng thuộc booking này.</p>
                  {checkoutAssignmentLoadError && <p role="alert">{checkoutAssignmentLoadError}</p>}
                  {loadingCheckoutAssignments ? <p role="status">Loading booking rooms…</p> : checkoutCleaningRooms.length === 0
                    ? <p>No booking rooms are available for this checkout.</p>
                    : <div className="checkout-cleaning-room-list">{checkoutCleaningRooms.map((room) => <div className="checkout-cleaning-room-row" key={room.booking_room_id}>
                      <div className="checkout-cleaning-room-info">
                        <strong>{room.room_number ? `Room ${room.room_number}` : 'Unassigned room'}</strong>
                        <small>Booking room #{room.booking_room_id}{room.room_id ? ` · Room ID ${room.room_id}` : ''}</small>
                        <span>Task status: {room.task_status || 'No task'} · Housekeeper: {room.assigned_to_name || 'Unassigned'}</span>
                      </div>
                      {(!room.task_id || (room.task_status === 'PENDING_ASSIGNMENT' && !room.assigned_to)) && <div className="checkout-cleaning-room-controls">
                        <select aria-label={`Housekeeper for room ${room.room_number || room.booking_room_id}`} value={checkoutAssigneeDraft[room.booking_room_id] || ''} disabled={Boolean(assigningCheckoutRoomId) || !room.room_id} onChange={(event) => setCheckoutAssigneeDraft((current) => ({ ...current, [room.booking_room_id]: event.target.value }))}>
                          <option value="">Select Housekeeper</option>{checkoutHousekeepers.map((housekeeper) => <option key={housekeeper.id} value={housekeeper.id}>{housekeeper.full_name}</option>)}
                        </select>
                        <button type="button" className="btn btn-primary" disabled={!room.room_id || !checkoutAssigneeDraft[room.booking_room_id] || Boolean(assigningCheckoutRoomId)} onClick={() => void assignCheckoutHousekeeper(room)}>{assigningCheckoutRoomId === room.booking_room_id ? 'Assigning…' : 'Assign Housekeeper'}</button>
                      </div>}
                    </div>)}</div>}
                </section>
                <section className="checkout-page-section checkout-cleaning-assignments">
                  <div className="checkout-inspection-section-heading">
                    <h4>Equipment Inspection Report</h4>
                    <button type="button" className="btn btn-outline" disabled={loadingCheckoutAssignments} onClick={() => void refreshCheckoutTasks()}>{loadingCheckoutAssignments ? 'Loading…' : 'Refresh'}</button>
                  </div>
                  <p>Review every submitted room report and confirm compensation decisions before creating the invoice.</p>
                  {checkoutAssignmentLoadError && <p role="alert">{checkoutAssignmentLoadError}</p>}
                  {loadingCheckoutAssignments ? <p role="status">Loading latest task and report status…</p> : checkoutCleaningRooms.length === 0
                    ? <p>No Checkout Cleaning tasks are available for this booking.</p>
                    : <div className="checkout-cleaning-room-list">{checkoutCleaningRooms.map((room) => <div className="checkout-cleaning-room-row" key={`report-${room.booking_room_id}`}>
                      <div className="checkout-cleaning-room-info">
                        <strong>{room.room_number ? `Room ${room.room_number}` : 'Unassigned room'}</strong>
                        <small>Booking room #{room.booking_room_id}{room.room_id ? ` · Room ID ${room.room_id}` : ''}</small>
                        <span>Cleaning Task status: {room.task_status || 'No task'}</span>
                        <span>Assigned Housekeeper: {room.assigned_to_name || 'Unassigned'}</span>
                        <span>Inspection report: {room.inspection_submitted ? 'Đã gửi báo cáo' : 'Chưa gửi báo cáo'}</span>
                        {room.task_id && room.inspection_submitted && <span>{viewedCheckoutReportTaskIds.has(room.task_id) ? 'Report viewed' : 'Report not viewed'}</span>}
                        {room.report_requires_compensation_decision && <span>{room.task_id && compensationConfirmedTaskIds.has(room.task_id) ? 'Compensation confirmed' : 'Compensation not confirmed'}</span>}
                        {room.inspection_submitted && room.inspection_report?.submitted_at && <span>Submitted at: {formatVietnamDateTime(room.inspection_report.submitted_at)}</span>}
                      </div>
                      {room.task_id && room.inspection_submitted && <button type="button" className="btn btn-outline" disabled={loadingCheckoutReport} onClick={() => void openCheckoutInspectionReport(room.task_id!)}>{loadingCheckoutReport ? 'Loading report…' : 'View Inspection Report'}</button>}
                    </div>)}</div>}
                </section>
                <section id="checkout-payment-reconciliation" className="checkout-page-section">
                  <h4>Đối soát chi phí booking</h4>
                  <div className="checkout-charge-row"><span>Tiền phòng và dịch vụ đã tính trong booking</span><strong>{formatCurrency(Number(selectedCheckOutBooking.total_amount || 0))}</strong></div>
                  {displayedCheckoutCompensationItems.length > 0 && <>
                    <div className="checkout-charge-row checkout-compensation-reconciliation-total"><span>{pendingCheckoutItems ? 'Bồi thường thiết bị (chờ tạo hóa đơn)' : 'Bồi thường thiết bị'}</span><strong>{formatCurrency(displayedCheckoutCompensationTotal)}</strong></div>
                    {displayedCheckoutCompensationItems.map((item) => <div className="checkout-charge-row checkout-compensation-reconciliation-item" key={item.compensation_id}>
                      <span>{item.equipment_name || 'Thiết bị'}{item.asset_code ? ` · ${item.asset_code}` : ''}{item.room_number ? ` · Phòng ${item.room_number}` : ''}</span>
                      <strong>{formatCurrency(Number(item.amount || 0))}</strong>
                    </div>)}
                  </>}
                  {activeCheckoutReconciliation && <div className="checkout-charge-row"><span>Tổng hóa đơn sau đồng bộ (đã gồm bồi thường)</span><strong>{formatCurrency(activeCheckoutReconciliation.invoice.total_amount)}</strong></div>}
                  <div className="checkout-charge-row"><span>Đã thanh toán trước / đặt cọc</span><strong>− {formatCurrency(Number(activeCheckoutReconciliation?.invoice.deposit_paid ?? selectedCheckOutBooking.deposit_amount ?? 0))}</strong></div>
                  <div className="checkout-charge-row"><span>Đã thanh toán checkout</span><strong>− {formatCurrency(Number(reconciledFinalPaid ?? selectedCheckOutBooking.final_paid_amount ?? 0))}</strong></div>
                  <div className="checkout-total-row"><span>{pendingCheckoutItems ? 'Còn phải thu (tạm tính)' : 'Còn phải thu'}</span><strong>{formatCurrency(Math.max(0, Number(activeCheckoutReconciliation?.invoice.amount_due ?? (Number(selectedCheckOutBooking.total_amount || 0) + displayedCheckoutCompensationTotal - Number(selectedCheckOutBooking.deposit_amount || 0) - Number(selectedCheckOutBooking.final_paid_amount || 0))) || 0))}</strong></div>
                  <p className="checkout-page-note">{pendingCheckoutItems ? 'Bồi thường đã xác nhận, chưa tạo hóa đơn. Tạo hóa đơn để ghi nhận chính thức và tiếp tục thanh toán.' : 'Các khoản phát sinh ngoài booking cần được ghi nhận vào booking trước khi thu tiền.'}</p>
                </section>
                <section className="checkout-page-section">
                  <h4>Hóa đơn</h4>
                {!checkoutReportsReadyForInvoice && !loadingCheckoutAssignments && <div className="reception-alert alert-error" role="alert" aria-live="polite">
                  <strong>Chưa thể tạo hóa đơn.</strong>
                  <ul>{checkoutInvoicePrerequisites.map((message) => <li key={message}>{message}</li>)}</ul>
                </div>}
                <div className="checkout-page-actions">
                  <button className="btn btn-outline" type="button" disabled={isCheckingOut != null} onClick={() => setSelectedCheckOutBooking(null)}>Quay lại</button>
                  <button className="btn btn-primary checkout-create-invoice-btn" type="button" disabled={!checkoutReportsReadyForInvoice || isCheckingOut != null || isCreatingInvoice} title={!checkoutReportsReadyForInvoice ? 'Xem báo cáo và xác nhận bồi thường trước khi tạo hóa đơn.' : undefined} onClick={() => void createCheckoutInvoice()}>
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
