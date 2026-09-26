import { rooms } from '../data/mockData';

export default function RoomsPage() {
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rooms</h1>
          <p className="page-subtitle">Quản lý tình trạng khách sạn</p>
        </div>
        <button className="btn-primary">+ Add room</button>
      </div>

      <div className="card panel">
        <h2 className="section-title">Danh sách phòng</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Type</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td>{room.roomNumber}</td>
                  <td>{room.type}</td>
                  <td>${room.price}</td>
                  <td>
                    <span className={`status-badge ${room.status === 'Available' ? 'status-available' : room.status === 'Booked' ? 'status-booked' : 'status-cleaning'}`}>
                      {room.status}
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
