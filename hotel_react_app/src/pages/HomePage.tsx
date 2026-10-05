import { useEffect, useMemo, useState } from 'react';
import deluxeCityView from '../assets/deluxe-city-view.jpg';
import executiveGarden from '../assets/executive-garden.webp';
import familySuite from '../assets/family-suite.jpg';
import presidentialVilla from '../assets/presidential-villa.jpg';
import skyLounge from '../assets/sky-lounge.jpg';
import {
  getActivePromotions,
  getCurrentRoleFromQuery,
  getReviews,
  getRoomTypes,
  getServices,
} from '../services/homeService';
import { logout } from '../services/authService';
import api from '../services/api';
import { checkRoomAvailability } from '../services/roomService';
import type {
  AppUser,
  Promotion,
  Review,
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
  const [selectedRoomDetails, setSelectedRoomDetails] = useState<RoomTypeDetails | null>(null);
  const [isRoomDetailsOpen, setIsRoomDetailsOpen] = useState(false);
  const [isRoomDetailsLoading, setIsRoomDetailsLoading] = useState(false);
  const [roomDetailsError, setRoomDetailsError] = useState('');

  const openRoomDetails = async (roomTypeId: number) => {
    setIsRoomDetailsOpen(true);
    setIsRoomDetailsLoading(true);
    setSelectedRoomDetails(null);
    setRoomDetailsError('');
    try {
      setSelectedRoomDetails(await api.get<RoomTypeDetails>(`/api/room-types/${roomTypeId}`));
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
        const validRoles: AppUser['role'][] = ['CUSTOMER', 'RECEPTIONIST', 'HOUSEKEEPER', 'ADMIN'];
        const roleById: Record<number, AppUser['role']> = {
          1: 'CUSTOMER',
          2: 'RECEPTIONIST',
          3: 'HOUSEKEEPER',
          4: 'ADMIN',
        };
        const storedRole = validRoles.find((role) => role === parsedUser.role);
        const mappedRole = storedRole ?? roleById[Number(parsedUser.role_id)] ?? 'CUSTOMER';
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
            <div className="brand-badge">H</div>
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
                <span className="welcome-text">Xin chào, {user.full_name}</span>
                <a className="btn btn-outline" href={getRolePath(user.role)}>
                  {dashboardLabel[user.role]}
                </a>
                <button type="button" className="btn btn-primary" onClick={() => void handleLogout()}>
                  Đăng xuất
                </button>
              </>
            )}
          </div>

          <button className="menu-toggle" onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? 'Đóng' : 'Menu'}
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Khách sạn nghỉ dưỡng và lưu trú</span>
              <h1>Trải nghiệm lưu trú sang trọng, ấm cúng và đẳng cấp.</h1>
              <p>
                Tận hưởng không gian nghỉ dưỡng lý tưởng cho các chuyến đi công tác, nghỉ dưỡng
                và gia đình với dịch vụ tận tâm ngay trong trung tâm thành phố.
              </p>
              <div className="benefits">
                <div>Đặt phòng trực tuyến nhanh chóng</div>
                <div>Nhận mã xác nhận ngay sau khi đặt</div>
                <div>Thanh toán tại quầy lễ tân khi nhận phòng</div>
              </div>
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
              Booking Now
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
                    Hạn dùng: {promotion.valid_from} đến {promotion.valid_to}
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
                <div>
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                </div>
                <div className="service-price">{formatCurrency(service.price)} / {service.unit}</div>
              </div>
            ))}
          </div>
        </section>

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
      </main>

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
