import { bookings } from '../data/mockData';

export default function BookingsPage() {
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">Lịch trình đặt phòng</p>
        </div>
        <button className="btn-secondary">Export</button>
      </div>

      <div className="card panel">
        <h2 className="section-title">Danh sách đặt phòng</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Room</th>
                <th>Check in</th>
                <th>Check out</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.guest}</td>
                  <td>{booking.room}</td>
                  <td>{booking.checkIn}</td>
                  <td>{booking.checkOut}</td>
                  <td>${booking.total}</td>
                  <td>
                    <span className={`status-badge ${booking.status === 'Confirmed' ? 'status-confirmed' : booking.status === 'Pending' ? 'status-pending' : 'status-checked-out'}`}>
                      {booking.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
