import { bookings, rooms } from '../data/mockData';

export default function DashboardPage() {
  const activeBookings = bookings.filter((booking) => booking.status === 'Confirmed').length;
  const availableRooms = rooms.filter((room) => room.status === 'Available').length;
  const totalRevenue = bookings.reduce((sum, booking) => sum + booking.total, 0);

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Tổng quan khách sạn hôm nay</p>
        </div>
        <button className="btn-primary">Generate report</button>
      </div>

      <div className="grid grid-4">
        <div className="stat-card card">
          <h3>Total rooms</h3>
          <strong>{rooms.length}</strong>
          <small>+ 8% this month</small>
        </div>
        <div className="stat-card card">
          <h3>Available</h3>
          <strong>{availableRooms}</strong>
          <small>+ 12 rooms</small>
        </div>
        <div className="stat-card card">
          <h3>Bookings</h3>
          <strong>{activeBookings}</strong>
          <small>2 pending</small>
        </div>
        <div className="stat-card card">
          <h3>Revenue</h3>
          <strong>${totalRevenue}</strong>
          <small>+ $1200</small>
        </div>
      </div>

      <div className="card panel">
        <h2 className="section-title">Recent bookings</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Room</th>
                <th>Check in</th>
                <th>Check out</th>
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
