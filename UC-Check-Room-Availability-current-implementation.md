# Use Case: Check Room Availability (as currently implemented)

**UC ID and Name:** UC-07.1 – Check Room Availability  
**Created By:** —  
**Date Created:** September 25, 2026  
**Primary Actors:** Guest, Customer, Receptionist  
**Secondary Actor:** Database System

## Screen Flow Mapping (current code)

The supplied diagram is a broader role-based screen flow. The current implementation uses these screen names and transitions:

| Screen-flow stage | Current screen/code behavior |
|---|---|
| HomePage | `/`; guest searches availability here without logging in. |
| Continue to online booking | Selecting an available type opens `/booking` with room type, dates, adults, and children in the URL. If the visitor is not signed in, the booking page offers a login link. |
| Login | `/login`; after successful customer login, returns to the requested redirect path when supplied. Receptionist login navigates to `/reception`. |
| Receptionist Dashboard – Booking Management | `/reception`; current sidebar label is **Đặt phòng tại quầy**. The availability search and walk-in booking form are part of this screen/module. |
| Receptionist Dashboard – Room assignment | Current sidebar label is **Phòng & gán phòng**. Receptionist views rooms and confirmed bookings, then selects a booking to view assignable rooms and assign one. |
| Receptionist Dashboard – Booking history | Current sidebar label is **Lịch sử booking**. It lists bookings and filters by text and booking creation date. |

The diagram's labels such as **Booking Management**, **Booking**, and **View booking history list** are conceptual labels; they are not the exact current sidebar text. The receptionist menu no longer has separate **Tổng quan** or **Đặt phòng** entries. Availability is accessed through **Đặt phòng tại quầy**. This UC covers the availability-search path, not the diagram's invoice, promotion, housekeeping, review, or other flows.

## Trigger

The actor enters check-in and check-out dates and the number of adults and children in the room search section on the HomePage. A receptionist can also enter the same parameters in the reception dashboard.

## Description

The system retrieves room types and calculates room availability for a selected date range. It marks whether each type meets the requested adult and child capacity and returns the number of available physical rooms. The HomePage and receptionist interface normally display suitable room types with an availability indication. The HomePage also has an optional filter that hides sold-out types.

## Preconditions

- The application can connect to the configured SQL Server database.
- Room types, physical rooms, and booking records are present in the database.
- The actor can access the relevant page. Creating an online customer booking requires an authenticated customer account; reception booking actions require receptionist authorization.

## Postconditions

- The system returns room type capacity and availability data for the requested dates.
- Search parameters are kept in HomePage state and passed in the booking URL when the actor continues to booking; they are not stored as a separate search record in the database.
- When an authenticated customer submits a booking, the backend checks capacity and inventory again before inserting it.

## Normal Flow

1. The actor opens the HomePage or receptionist room-booking module.
2. The interface displays check-in date, check-out date, adults, and children inputs.
3. The actor selects or enters the search parameters.
4. The actor clicks **Tìm phòng** or **Kiểm tra phòng**.
5. The HomePage checks that check-in is not before the browser's current date, check-out is after check-in, and adults are at least one. The receptionist interface sends the request without equivalent client-side validation. The backend checks date parsing and that check-out is later than check-in, then applies defaults/clamps to missing or invalid guest counts.
6. The frontend calls `GET /api/rooms/availability` with all four parameters.
7. The backend retrieves room types and physical rooms. It marks a type suitable when `max_adults >= adults` and `max_children >= children`.
8. The backend checks overlapping bookings using `booking.check_in_date < requested check-out` and `booking.check_out_date > requested check-in`. Cancelled bookings are excluded. Physical rooms with `MAINTENANCE` or `CLEANING` status are excluded. Unassigned overlapping booking-room rows are also deducted from the type's remaining inventory.
9. The backend returns every room type with capacity and availability fields. The HomePage and receptionist interface filter out types that do not fit the requested capacity.
10. A suitable type with rooms available is shown with its available room count and a booking action. A suitable type with zero rooms is shown as **Hết phòng** by default, with booking unavailable.
11. If the actor chooses **Chỉ hiển thị loại phòng còn trống**, sold-out types are hidden.
12. Before an online customer booking is created, the backend checks capacity and inventory again in a serializable transaction.

## Alternative Flows

### A1. Actor changes search parameters

1. The actor changes one or more search parameters and searches again.
2. The HomePage calls the availability endpoint again and replaces the current availability data with the response.

### A2. Suitable type has no available rooms

1. The backend returns the suitable type with `available_rooms = 0` and `is_available = false`.
2. The interface normally displays it as **Hết phòng** and disables the booking action.
3. If the optional availability-only filter is active, the type is hidden.

### A3. No room type fits the requested capacity

The frontend displays an empty-state message. The message currently says there is no suitable room, and does not provide a separate backend result category for “no suitable type” versus “all matching types sold out while the availability-only filter is active.”

## Exceptions and Validation

### E1. Invalid date range

- The HomePage displays a validation message when check-in is before the browser's current date or check-out is not later than check-in.
- The availability API rejects unparseable dates and check-out dates equal to or earlier than check-in.
- The availability API does **not** reject a past check-in date. Booking creation separately rejects past check-in and invalid date ranges.

### E2. Invalid guest count

- The HomePage adult selector offers values starting at one; the children selector offers values starting at zero. HomePage search checks adults are at least one.
- The availability API does not reject invalid guest counts: it defaults/clamps adults to at least one and children to at least zero.
- Customer booking creation validates that adults are at least one and children are non-negative.

### E3. Database/API error

- The availability controller catches database errors and returns HTTP 500 with a generic message.
- The frontend catches the failure and displays an error. The shared GET helper currently reports the HTTP status (for example, `Request failed: 500`) rather than extracting the backend's message.

## Business Rules (current behavior)

| ID | Business Rule | Current implementation |
|---|---|---|
| BR1 | Date range | HomePage checks check-in against browser today and requires check-out after check-in. Availability API checks parseability and checkout ordering but does not reject past check-in. |
| BR2 | Search inputs | HomePage sends all four parameters. Missing availability query parameters receive backend defaults; the API does not enforce that all four were explicitly supplied. |
| BR3 | Occupancy and capacity | Suitable when `max_adults >= requested adults` and `max_children >= requested children`. Adults must be at least one for customer booking creation; availability API clamps instead of rejecting. |
| BR4 | Availability calculation | Physical rooms are checked separately from room type capacity. Overlap uses a half-open stay range. Cancelled bookings are ignored; physical room statuses `MAINTENANCE` and `CLEANING` are excluded. No explicit `OUT_OF_SERVICE` status check is present in the availability query. |
| BR5 | Availability display | Suitable types are displayed by default with `Còn N phòng` or `Hết phòng`. The optional availability-only filter hides types with zero availability. |
| BR6 | Data consistency | Availability is queried from SQL Server on search. Customer booking creation rechecks capacity and inventory in a serializable transaction. |

## Other Information

- The availability query retrieves all rows from `room_types`; it does not apply an active/inactive room-type condition.
- The room overlap condition permits a new stay to begin on the previous booking's checkout date, matching the usual hotel checkout convention.
- Current status labels in the Vietnamese interface are **Còn N phòng** and **Hết phòng**.
