import { useEffect, useMemo, useState } from 'react';
import deluxeCityView from '../assets/deluxe-city-view.jpg';
import executiveGarden from '../assets/executive-garden.webp';
import familySuite from '../assets/family-suite.jpg';
import heroImage from '../assets/lumiere-hero.png';
import lotusLogo from '../assets/lumiere-lotus.png';
import presidentialVilla from '../assets/presidential-villa.jpg';
import skyLounge from '../assets/sky-lounge.jpg';
import sunsetImage from '../assets/lumiere-sunset.png';
import {
  getActivePromotions,
  getCurrentRoleFromQuery,
  getReviews,
  getRoomTypes,
  getServices,
} from '../services/homeService';
import { logout } from '../services/authService';
import { getRoomTypeDetails } from '../services/roomTypeService';
import { checkRoomAvailability } from '../services/roomService';
import { createReview, getMyReviewBookings } from '../services/reviewService';
import ReviewForm from '../components/ReviewForm';
import { resolveRole } from '../utils/role';
import type {
  AppUser,
  Promotion,
  Review,
  ReviewBooking,
  RoomAvailabilityItem,
  RoomType,
  SearchFormState,
  ServiceItem,
} from '../types';

const daysBetween = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: string, amount: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return formatDateInput(d);
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

const formatPromotionDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const renderStars = (rating: number) => {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
};

const roomImageMap: Record<number, string> = {
  1: deluxeCityView,
  2: executiveGarden,
  3: familySuite,
  4: presidentialVilla,
  5: skyLounge,
};

const getRoomImage = (room: RoomType) => room.image_url ?? roomImageMap[room.id] ?? '';

type RoomTypeDetails = RoomType & {
  images?: { image_url: string; is_primary: boolean }[];
  reviews?: { customer_name: string; rating: number; comment: string | null }[];
};

export default function HomePage() {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  const [user, setUser] = useState<AppUser | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomAvailabilityItem[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewBookings, setReviewBookings] = useState<ReviewBooking[]>([]);
  const [selectedReviewBookingId, setSelectedReviewBookingId] = useState<number | null>(null);
  const [isReviewBookingsLoading, setIsReviewBookingsLoading] = useState(false);
  const [reviewModalError, setReviewModalError] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchFormState>({
    check_in_date: today,
    check_out_date: tomorrow,
    adults: 2,
    children: 0,
  });
  const [searchError, setSearchError] = useState<string | null>(null);
  const [onlyAvailableFilter, setOnlyAvailableFilter] = useState(false);
  const [filteredRoomTypes, setFilteredRoomTypes] = useState<RoomAvailabilityItem[]>([]);
  const [isFiltered, setIsFiltered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selectedRoomDetails, setSelectedRoomDetails] = useState<RoomTypeDetails | null>(null);
  const [isRoomDetailsOpen, setIsRoomDetailsOpen] = useState(false);
  const [isRoomDetailsLoading, setIsRoomDetailsLoading] = useState(false);
  const [roomDetailsError, setRoomDetailsError] = useState('');
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);

  const openReviewModal = async () => {
    setIsReviewModalOpen(true);
    setIsReviewBookingsLoading(true);
    setReviewModalError('');
    setReviewSubmitted(false);
    try {
      const bookings = await getMyReviewBookings();
      const eligibleBookings = bookings.filter((booking) => booking.can_review && !booking.review && booking.room_type_count === 1 && booking.room_type_id != null);
      setReviewBookings(eligibleBookings);
      setSelectedReviewBookingId(eligibleBookings[0]?.booking_id ?? null);
    } catch (value) {
      setReviewModalError(value instanceof Error ? value.message : 'Không thể tải booking để đánh giá.');
    } finally {
      setIsReviewBookingsLoading(false);
    }
  };

  const submitReview = async (rating: number, comment: string) => {
    if (!selectedReviewBookingId) return;
    await createReview(selectedReviewBookingId, rating, comment);
    setReviewSubmitted(true);
    try {
      setReviews(await getReviews());
    } catch (refreshError) {
      console.error('Could not refresh public reviews:', refreshError);
    }
  };

  const openRoomDetails = async (roomTypeId: number) => {
    setIsRoomDetailsOpen(true);
    setIsRoomDetailsLoading(true);
    setSelectedRoomDetails(null);
    setRoomDetailsError('');
    try {
      setSelectedRoomDetails(await getRoomTypeDetails<RoomTypeDetails>(roomTypeId));
    } catch (detailsError) {
      setRoomDetailsError(detailsError instanceof Error ? detailsError.message : 'Không thể tải chi tiết loại phòng.');
    } finally {
      setIsRoomDetailsLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        const mappedRole = resolveRole(parsedUser) ?? 'CUSTOMER';
        setUser({
          full_name: parsedUser.full_name || parsedUser.email || 'Khách hàng',
          role: mappedRole,
        });
      } catch {
        localStorage.removeItem('user');
      }
    }

    const role = getCurrentRoleFromQuery();
    if (role) {
      const displayName =
        role === 'CUSTOMER'
          ? 'Khách hàng'
          : role === 'RECEPTIONIST'
            ? 'Lễ tân'
            : role === 'HOUSEKEEPER'
              ? 'Nhân viên dọn phòng'
              : 'Quản trị viên';
      setUser({ full_name: displayName, role });
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [availabilityRes, promotionData, serviceData, reviewData] = await Promise.all([
          checkRoomAvailability({
            check_in_date: today,
            check_out_date: tomorrow,
            adults: 2,
            children: 0,
          }),
          getActivePromotions(),
          getServices(),
          getReviews(),
        ]);

        const roomData = availabilityRes.data || [];
        setRoomTypes(roomData);
        setPromotions(promotionData);
        setServices(serviceData);
        setReviews(reviewData);
        setFilteredRoomTypes(
          roomData.filter((item) => item.capacity_matched && (!onlyAvailableFilter || item.is_available)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tải dữ liệu.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [today, tomorrow]);

  const nightCount = useMemo(() => daysBetween(search.check_in_date, search.check_out_date), [search]);

  useEffect(() => {
    const baseList = roomTypes.filter(
      (item) => item.capacity_matched && item.max_adults >= search.adults && item.max_children >= search.children,
    );

    setFilteredRoomTypes(onlyAvailableFilter ? baseList.filter((item) => item.is_available) : baseList);
  }, [roomTypes, onlyAvailableFilter, search.adults, search.children]);

  const handleSearch = async () => {
    const todayDate = new Date(today);
    const checkIn = new Date(search.check_in_date);
    const checkOut = new Date(search.check_out_date);
    const nextErrors: string[] = [];

    if (checkIn < todayDate) {
      nextErrors.push('Ngày nhận không thể ở quá khứ.');
    }
    if (checkOut <= checkIn) {
      nextErrors.push('Ngày trả phòng phải sau ngày nhận phòng.');
    }
    if (search.adults < 1) {
      nextErrors.push('Số người lớn phải lớn hơn hoặc bằng 1.');
    }

    if (nextErrors.length > 0) {
      setSearchError(nextErrors.join(' '));
      setIsFiltered(false);
      return;
    }

    try {
      setIsCheckingAvailability(true);
      setSearchError(null);

      const result = await checkRoomAvailability({
        check_in_date: search.check_in_date,
        check_out_date: search.check_out_date,
        adults: search.adults,
        children: search.children,
      });

      const updatedRooms = result.data || [];
      setRoomTypes(updatedRooms);

      const matched = updatedRooms.filter(
        (item) => item.capacity_matched && item.max_adults >= search.adults && item.max_children >= search.children,
      );
      setFilteredRoomTypes(onlyAvailableFilter ? matched.filter((item) => item.is_available) : matched);
      setIsFiltered(true);
      document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra phòng trống.');
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const toggleOnlyAvailable = () => {
    const nextValue = !onlyAvailableFilter;
    setOnlyAvailableFilter(nextValue);
    setFilteredRoomTypes(
      roomTypes
        .filter(
          (item) => item.capacity_matched && item.max_adults >= search.adults && item.max_children >= search.children,
        )
        .filter((item) => (nextValue ? item.is_available : true)),
    );
  };

  const resetFilter = () => {
    const baseList = roomTypes.filter(
      (item) => item.capacity_matched && item.max_adults >= search.adults && item.max_children >= search.children,
    );
    setIsFiltered(false);
    setFilteredRoomTypes(onlyAvailableFilter ? baseList.filter((item) => item.is_available) : baseList);
    setSearchError(null);
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
  };

  const averageReview = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  const getRolePath = (role: AppUser['role']) => {
    switch (role) {
      case 'CUSTOMER':
        return '/my-bookings';
      case 'RECEPTIONIST':
        return '/reception';
      case 'HOUSEKEEPER':
        return '/housekeeping';
      case 'ADMIN':
        return '/admin';
      default:
        return '/';
    }
  };

  const dashboardLabel: Record<AppUser['role'], string> = {
    CUSTOMER: 'My bookings',
    RECEPTIONIST: 'Dashboard Lễ tân',
    HOUSEKEEPER: 'Dashboard Housekeeper',
    ADMIN: 'Dashboard Admin',
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) {
        await logout(refreshToken);
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
  };

  if (isLoading) {
    return <div className="loading-state">Đang tải dữ liệu...</div>;
  }

  if (error) {
    return (
      <div className="loading-state error-box">
        <p>{error}</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </div>
    );
  }

  return (
    <div className="home-page">
      <header className="topbar">
        <div className="container nav-shell">
          <div className="brand-wrap">
            <div className="brand-badge">
              <img src={lotusLogo} alt="" />
            </div>
            <div>
              <div className="brand-name">Hotel Lumière</div>
              <small>Stay in comfort</small>
            </div>
          </div>

          <nav className={`main-nav ${menuOpen ? 'open' : ''}`} aria-label="Menu chính">
            <a href="#rooms" onClick={() => setMenuOpen(false)}>Phòng</a>
            <a href="#promotions" onClick={() => setMenuOpen(false)}>Ưu đãi</a>
            <a href="#services" onClick={() => setMenuOpen(false)}>Dịch vụ</a>
            <a href="#reviews" onClick={() => setMenuOpen(false)}>Đánh giá</a>
            <a href="#rooms" onClick={() => setMenuOpen(false)}>Khám phá</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Liên hệ</a>
          </nav>

          <div className="nav-actions">
            {!user ? (
              <>
                <a className="btn btn-outline" href="/login">
                  Đăng nhập
                </a>
                <a className="btn btn-primary" href="/register">
                  Đăng ký
                </a>
              </>
            ) : (
              <>
                <div className="user-menu-wrap">
                  <button
                    type="button"
                    className="user-menu-trigger"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setUserMenuOpen((open) => !open)}
                  >
                    <span className="user-avatar" aria-hidden="true">{user.full_name.trim().charAt(0).toLocaleUpperCase() || 'U'}</span>
                    <span className="user-greeting">Xin chào, {user.full_name}</span>
                    <svg className="user-menu-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      {userMenuOpen
                        ? <path d="m6 15 6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        : <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                    </svg>
                  </button>
                  {userMenuOpen && (
                    <div className="user-menu-panel" role="menu">
                      <div className="user-menu-identity">
                        <span className="user-avatar" aria-hidden="true">{user.full_name.trim().charAt(0).toLocaleUpperCase() || 'U'}</span>
                        <span><strong>{user.full_name}</strong><small>{user.role === 'CUSTOMER' ? 'Khách hàng' : user.role}</small></span>
                      </div>
                      <a href={getRolePath(user.role)} role="menuitem" className="user-menu-account" onClick={() => setUserMenuOpen(false)}>
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="M4.5 21c.5-4.2 3-6.3 7.5-6.3s7 2.1 7.5 6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                        <span>{user.role === 'CUSTOMER' ? 'Tài khoản của tôi' : dashboardLabel[user.role]}</span><span className="account-arrow" aria-hidden="true">›</span>
                      </a>
                      <button type="button" role="menuitem" className="user-menu-logout" onClick={() => void handleLogout()}>
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button className="menu-toggle" onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? 'Đóng' : 'Menu'}
          </button>
        </div>
      </header>

      <main>
        <section
          className="hero-section"
          style={{ backgroundImage: `linear-gradient(90deg, rgba(255, 250, 239, .58) 0%, rgba(255, 250, 239, .36) 40%, rgba(255, 250, 239, .04) 78%), url(${heroImage})` }}
        >
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Khách sạn nghỉ dưỡng và lưu trú</span>
              <h1>Trải nghiệm lưu trú sang trọng, ấm cúng và đẳng cấp.</h1>
              <p>
                Tận hưởng không gian nghỉ dưỡng lý tưởng cho các chuyến đi công tác, nghỉ dưỡng
                và gia đình với dịch vụ tận tâm ngay trong trung tâm thành phố.
              </p>
              <a className="btn btn-hero" href="#rooms">Khám phá phòng <span aria-hidden="true">→</span></a>
            </div>

            <div className="booking-box" aria-label="Tìm phòng">
              <h2>Tìm phòng</h2>

              <div className="field-grid">
                <label>
                  <span>Ngày nhận phòng</span>
                  <input
                    type="date"
                    value={search.check_in_date}
                    onChange={(e) => {
                      const nextCheckIn = e.target.value;
                      const nextState = { ...search, check_in_date: nextCheckIn };
                      if (new Date(nextState.check_out_date) <= new Date(nextCheckIn)) {
                        nextState.check_out_date = addDays(nextCheckIn, 1);
                      }
                      setSearch(nextState);
                    }}
                  />
                </label>

                <label>
                  <span>Ngày trả phòng</span>
                  <input
                    type="date"
                    value={search.check_out_date}
                    onChange={(e) => {
                      const nextCheckOut = e.target.value;
                      const nextState = { ...search, check_out_date: nextCheckOut };
                      if (new Date(nextCheckOut) <= new Date(search.check_in_date)) {
                        nextState.check_out_date = addDays(search.check_in_date, 1);
                      }
                      setSearch(nextState);
                    }}
                  />
                </label>

                <label>
                  <span>Người lớn</span>
                  <select
                    value={search.adults}
                    onChange={(e) => setSearch({ ...search, adults: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Trẻ em</span>
                  <select
                    value={search.children}
                    onChange={(e) => setSearch({ ...search, children: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {searchError && <p className="inline-error">{searchError}</p>}

              <button className="btn btn-primary full-width" onClick={() => void handleSearch()}>
                Tìm phòng
              </button>

              <div className="stay-note">
                <strong>{nightCount} đêm</strong>
                <span>Nhận phòng từ 14:00, trả phòng trước 12:00</span>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-strip" aria-label="Điểm nổi bật">
          <div className="container feature-strip-inner">
            <div><span aria-hidden="true">⌖</span><p><strong>Vị trí tuyệt đẹp</strong><small>Gần thiên nhiên, yên bình</small></p></div>
            <div><span aria-hidden="true">▱</span><p><strong>Phòng nghỉ sang trọng</strong><small>Thiết kế tinh tế, tiện nghi</small></p></div>
            <div><span aria-hidden="true">♧</span><p><strong>Dịch vụ tận tâm</strong><small>Đội ngũ chuyên nghiệp</small></p></div>
            <div><span aria-hidden="true">◇</span><p><strong>Đặt phòng an toàn</strong><small>Thanh toán linh hoạt</small></p></div>
          </div>
        </section>

        <section id="rooms" className="container section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Các loại phòng</span>
              <h2>Chọn căn phòng phù hợp với nhu cầu của bạn</h2>
            </div>
            {isFiltered && (
              <button className="btn btn-secondary" onClick={resetFilter}>
                Xem tất cả loại phòng
              </button>
            )}
            <a className="btn btn-primary" href={`/booking?${new URLSearchParams({ check_in_date: search.check_in_date, check_out_date: search.check_out_date, adults: String(search.adults), children: String(search.children) }).toString()}`}>
              Xem tất cả phòng
            </a>
          </div>

          {filteredRoomTypes.length === 0 ? (
            <div className="empty-state">
              Không có loại phòng phù hợp. Hãy giảm số lượng khách hoặc thử đặt nhiều phòng.
            </div>
          ) : (
            <div className="room-grid">
              {filteredRoomTypes.map((room) => {
                const total = room.base_price * nightCount;
                const roomImage = getRoomImage(room);
                return (
                  <article
                    key={room.id}
                    className="room-card room-card-clickable"
                    role="button"
                    tabIndex={0}
                    aria-label={`Xem chi tiết loại phòng ${room.name}`}
                    onClick={() => void openRoomDetails(room.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void openRoomDetails(room.id);
                      }
                    }}
                  >
                    <div className="room-image-wrap">
                      {roomImage ? (
                        <img src={roomImage} alt={room.name} className="room-image" />
                      ) : (
                        <div className="room-image placeholder">Chưa có ảnh</div>
                      )}
                      <small className={`availability-badge${room.available_rooms > 0 ? '' : ' sold-out'}`}>
                        {room.available_rooms > 0 ? `Còn ${room.available_rooms} phòng` : 'Hết phòng'}
                      </small>
                    </div>

                    <div className="room-body">
                      <div className="room-header-row">
                        <h3>{room.name}</h3>
                        <div className="room-card-header-actions">
                          <div className="rating-badge">
                            {room.average_rating.toFixed(1)} ★ ({room.review_count})
                          </div>
                        </div>
                      </div>

                      <p className="room-description">{room.description}</p>
                      <p className="room-guest-limit">
                        Tối đa {room.max_adults} người lớn, {room.max_children} trẻ em
                      </p>
                      <ul className="amenities-list">
                        {room.amenities.map((amenity) => (
                          <li key={amenity}>{amenity}</li>
                        ))}
                      </ul>

                      <div className="room-bottom">
                        <div>
                          <div className="price">{formatCurrency(room.base_price)} / đêm</div>
                          <div className="base-total">
                            {nightCount} đêm: {formatCurrency(total)}
                          </div>
                        </div>
                        <div className="room-card-actions">
                          <a
                            className="btn btn-primary"
                            onClick={(event) => event.stopPropagation()}
                            href={`/booking?room_type_id=${room.id}&check_in_date=${search.check_in_date}&check_out_date=${search.check_out_date}&adults=${search.adults}&children=${search.children}`}
                          >
                            Đặt phòng
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {isRoomDetailsOpen && (
          <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsRoomDetailsOpen(false); }}>
            <div className="room-type-modal room-type-details-modal" role="dialog" aria-modal="true" aria-labelledby="customer-room-details-title">
              <div className="room-type-modal-heading">
                <div>
                  <h3 id="customer-room-details-title">Chi tiết loại phòng</h3>
                  <p>Thông tin giá, sức chứa, tiện nghi và phản hồi của khách.</p>
                </div>
                <button className="room-type-close" type="button" aria-label="Đóng" onClick={() => setIsRoomDetailsOpen(false)}>×</button>
              </div>
              {isRoomDetailsLoading ? <p role="status">Đang tải chi tiết...</p> : roomDetailsError ? <div className="error-text" role="alert">{roomDetailsError}</div> : selectedRoomDetails ? (
                <div className="room-type-details-content">
                  {selectedRoomDetails.images?.length ? <div className="room-type-details-images">{selectedRoomDetails.images.map((image: { image_url: string }, index: number) => <img key={`${image.image_url}-${index}`} src={image.image_url} alt={`${selectedRoomDetails.name} ${index + 1}`} />)}</div> : null}
                  <div className="room-type-details-summary"><div><span className="muted-label">Loại phòng</span><h4>{selectedRoomDetails.name}</h4></div><strong>{formatCurrency(selectedRoomDetails.base_price)} <small>/ đêm</small></strong></div>
                  <p className="room-type-details-description">{selectedRoomDetails.description || 'Chưa có mô tả cho loại phòng này.'}</p>
                  <div className="room-type-details-facts">
                    <div><span>Sức chứa người lớn</span><strong>{selectedRoomDetails.max_adults}</strong></div>
                    <div><span>Sức chứa trẻ em</span><strong>{selectedRoomDetails.max_children}</strong></div>
                    <div><span>Đánh giá trung bình</span><strong>{selectedRoomDetails.average_rating == null ? 'Chưa có' : `${selectedRoomDetails.average_rating.toFixed(1)} / 5`}</strong></div>
                    <div><span>Số lượt đánh giá</span><strong>{selectedRoomDetails.review_count ?? 0}</strong></div>
                  </div>
                  <div className="room-type-details-section"><h4>Tiện nghi</h4>{selectedRoomDetails.amenities?.length ? <div className="room-type-amenities">{selectedRoomDetails.amenities.map((amenity: string) => <span key={amenity}>{amenity}</span>)}</div> : <p>Chưa cập nhật tiện nghi.</p>}</div>
                  <div className="room-type-details-section"><h4>Đánh giá gần đây</h4>{selectedRoomDetails.reviews?.length ? <div className="room-type-review-list">{selectedRoomDetails.reviews.map((review: { customer_name: string; rating: number; comment: string | null }, index: number) => <article key={`${review.customer_name}-${index}`}><div><strong>{review.customer_name}</strong><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div><p>{review.comment || 'Khách không để lại nhận xét.'}</p></article>)}</div> : <p>Chưa có đánh giá cho loại phòng này.</p>}</div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <section id="promotions" className="container section-block">
          <div className="section-heading narrow">
            <span className="eyebrow">Ưu đãi</span>
            <h2>Mã khuyến mãi đang áp dụng</h2>
          </div>

          {promotions.length === 0 ? null : (
            <div className="promotion-grid">
              {promotions.map((promotion) => (
                <article key={promotion.id} className="promo-card">
                  <div className="promo-head">
                    <span className="promo-code">{promotion.code}</span>
                    <button className="copy-btn" onClick={() => void copyCode(promotion.code)}>
                      Sao chép mã
                    </button>
                  </div>
                  <h3>{promotion.name}</h3>
                  <p>{promotion.description}</p>
                  <div className="promo-discount">
                    {promotion.discount_type === 'PERCENT'
                      ? `Giảm ${promotion.discount_value}%, tối đa ${promotion.max_discount ? formatCurrency(promotion.max_discount) : 'không giới hạn'}`
                      : `Giảm ${formatCurrency(promotion.discount_value)}`}
                  </div>
                  <small>
                    Hạn dùng: {formatPromotionDate(promotion.valid_from)} đến {formatPromotionDate(promotion.valid_to)}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="services" className="container section-block">
          <div className="section-heading narrow">
            <span className="eyebrow">Dịch vụ</span>
            <h2>Phục vụ tiện ích quan trọng trong kỳ nghỉ</h2>
          </div>

          <div className="service-list">
            {services.map((service) => (
              <div key={service.id} className="service-item">
                <button
                  className="service-item-details-button"
                  type="button"
                  onClick={() => setSelectedService(service)}
                  aria-label={`Xem chi tiết dịch vụ ${service.name}`}
                >
                  <div>
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                  </div>
                  <span className="service-item-details-hint">Xem chi tiết <span aria-hidden="true">→</span></span>
                </button>
                <div className="service-price">{formatCurrency(service.price)} / {service.unit}</div>
              </div>
            ))}
          </div>
        </section>

        {selectedService && (
          <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedService(null); }}>
            <section className="room-type-modal room-type-details-modal service-public-details" role="dialog" aria-modal="true" aria-labelledby="public-service-details-title">
              <div className="room-type-modal-heading">
                <div>
                  <span className="eyebrow">Dịch vụ khách sạn</span>
                  <h3 id="public-service-details-title">{selectedService.name}</h3>
                  <p>Thông tin dịch vụ dành cho khách lưu trú.</p>
                </div>
                <button className="room-type-close" type="button" aria-label="Đóng chi tiết dịch vụ" onClick={() => setSelectedService(null)}>×</button>
              </div>
              <div className="service-public-details-content">
                <p>{selectedService.description || 'Dịch vụ chưa có mô tả.'}</p>
                <div className="service-detail-facts">
                  <div><span>Giá dịch vụ</span><strong>{formatCurrency(selectedService.price)}</strong></div>
                  <div><span>Đơn vị tính</span><strong>{selectedService.unit}</strong></div>
                </div>
              </div>
            </section>
          </div>
        )}

        <section id="reviews" className="container section-block">
          <div className="section-heading review-layout">
            <div>
              <span className="eyebrow">Đánh giá</span>
              <h2>Khách hàng đánh giá về trải nghiệm lưu trú</h2>
            </div>
            <div className="review-summary">
              <strong>{averageReview ? averageReview.toFixed(1) : '0.0'}</strong>
              <span>{renderStars(averageReview || 0)}</span>
              <small>{reviews.length} đánh giá</small>
            </div>
          </div>

          <div className="review-actions">
            {user?.role === 'CUSTOMER' ? (
              <button className="btn btn-primary" type="button" onClick={() => void openReviewModal()}>Viết đánh giá</button>
            ) : user ? (
              <a className="btn btn-outline" href={getRolePath(user.role)}>Quản lý đánh giá</a>
            ) : (
              <a className="btn btn-outline" href="/login">Đăng nhập để đánh giá</a>
            )}
          </div>

          <div className="review-grid">
            {reviews.map((review) => (
              <article key={review.id} className="review-card">
                <div className="review-stars">{renderStars(review.rating)}</div>
                <p>{review.comment}</p>
                <div className="review-meta">
                  <strong>{review.customer_name}</strong>
                  <span>{review.room_type_name || 'Khách sạn'}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="special-offer" style={{ backgroundImage: `url(${sunsetImage})` }}>
          <div className="container special-offer-content">
            <span className="eyebrow">Ưu đãi đặc biệt</span>
            <h2>Kỳ nghỉ hoàn hảo<br />đang chờ bạn</h2>
            <p>Khám phá các gói ưu đãi hấp dẫn dành riêng cho kỳ nghỉ tiếp theo.</p>
            <a className="btn btn-light" href="#promotions">Xem ưu đãi <span aria-hidden="true">→</span></a>
          </div>
        </section>
      </main>

      {isReviewModalOpen && (
        <div className="review-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsReviewModalOpen(false); }}>
          <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
            <header className="review-modal-header">
              <div><span className="eyebrow">Chia sẻ trải nghiệm</span><h2 id="review-modal-title">Viết đánh giá</h2></div>
              <button type="button" className="review-modal-close" aria-label="Đóng" onClick={() => setIsReviewModalOpen(false)}>×</button>
            </header>
            {isReviewBookingsLoading ? <p role="status">Đang tải booking của bạn…</p>
              : reviewModalError ? <p className="error-text" role="alert">{reviewModalError}</p>
                : reviewSubmitted ? <div className="review-modal-success" role="status"><strong>Cảm ơn bạn đã đánh giá!</strong><p>Đánh giá đã được gửi thành công.</p><button type="button" className="btn btn-primary" onClick={() => setIsReviewModalOpen(false)}>Đóng</button></div>
                  : reviewBookings.length === 0 ? <div className="review-modal-empty"><p>Bạn chưa có booking đủ điều kiện để đánh giá.</p><small>Mỗi booking chỉ được đánh giá một lần và hiện cần gắn với đúng một loại phòng.</small></div>
                    : <div className="review-modal-content">
                      <label htmlFor="review-modal-booking">Chọn booking</label>
                      <select id="review-modal-booking" value={selectedReviewBookingId ?? ''} onChange={(event) => setSelectedReviewBookingId(Number(event.target.value))}>
                        {reviewBookings.map((booking) => <option key={booking.booking_id} value={booking.booking_id}>{booking.booking_code} · {booking.room_type_name} · {String(booking.check_in_date).slice(0, 10)}</option>)}
                      </select>
                      <ReviewForm submitLabel="Gửi đánh giá" onSubmit={submitReview} />
                    </div>}
          </section>
        </div>
      )}

      <footer id="contact" className="site-footer">
        <div className="container footer-grid">
          <div>
            <h3>Hotel Lumière</h3>
            <p>123 Nguyễn Huệ, Quận 1, TP.HCM</p>
          </div>
          <div>
            <h4>Liên hệ</h4>
            <p>Điện thoại: +84 28 1234 5678</p>
            <p>Email: hello@hotellumiere.vn</p>
          </div>
          <div>
            <h4>Giờ nhận / trả phòng</h4>
            <p>Nhận phòng: từ 14:00</p>
            <p>Trả phòng: trước 12:00</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
