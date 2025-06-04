

---

# Supabase Booking Backend with RLS and Race Condition Handling

## Overview

This project implements a secure booking system backend using **Supabase** (PostgreSQL) with **Row Level Security (RLS)**, **race condition prevention**, and **user-based access control**. The backend is written in **TypeScript** and simulates booking operations with strict access control and concurrency safety.

---

## Features

* User creation and lookup by phone number.
* Row Level Security (RLS) to restrict data access per user UUID.
* Booking creation, rescheduling, and cancellation operations.
* Race condition prevention using database constraints and row-level locking.
* Scoped Supabase clients with user-specific UUID context.
* Simulation of race conditions and error handling.
* Easily extensible for JWT authentication and API endpoint creation.

---

## Prerequisites

* Node.js (v16+ recommended)
* Supabase project with configured PostgreSQL database
* Supabase CLI or SQL editor access
* Environment variables setup with Supabase URL and Service Role Key

---

## Setup Instructions

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create `.env` file** with your Supabase credentials:

   ```env
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

4. **Enable Row Level Security and Policies on your tables:**

   Run the following SQL in Supabase SQL editor (adjust table names if needed):

   ```sql
   ALTER TABLE bookings2 ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can access their own bookings"
   ON bookings2
   FOR ALL
   USING (user_id = current_setting('app.uuid')::uuid);

   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can access own record"
   ON users
   FOR ALL
   USING (id = current_setting('app.uuid')::uuid);
   ```

5. **Add Unique Constraint on bookings2:**

   ```sql
   ALTER TABLE bookings2
   ADD CONSTRAINT unique_user_slot UNIQUE (user_id, date, time);
   ```

6. **Create booking stored procedure with row-level locking (to prevent race conditions):**

   ```sql
   CREATE OR REPLACE FUNCTION book_slot(p_user_id UUID, p_date DATE, p_time TIME)
   RETURNS VOID AS $$
   DECLARE
     existing_booking bookings2%ROWTYPE;
   BEGIN
     SELECT * INTO existing_booking
     FROM bookings2
     WHERE user_id = p_user_id AND date = p_date AND time = p_time
     FOR UPDATE;

     IF FOUND THEN
       RAISE EXCEPTION 'Booking already exists for this slot';
     ELSE
       INSERT INTO bookings2 (user_id, date, time, status)
       VALUES (p_user_id, p_date, p_time, 'confirmed');
     END IF;
   END;
   $$ LANGUAGE plpgsql;
   ```

---

## Project Structure

* **index.ts** — Main backend file that:

  * Connects to Supabase
  * Implements user management (`getOrCreateUser`)
  * Creates scoped clients for RLS (`createScopedClient`)
  * Implements booking operations: create, fetch, reschedule, delete
  * Handles error logging and race condition simulation

* **.env** — Environment variables file (not committed to repo)

---

## Usage

Run the backend script with:

```bash
npx ts-node index.ts
```

The example usage in `index.ts` demonstrates:

* Creating or fetching a user by phone number.
* Creating a new booking.
* Rescheduling the booking.
* Deleting the booking.
* Fetching all bookings for the user.

---

## How It Works

* **RLS & Scoped Client**: All queries use a Supabase client scoped by user UUID passed via the `X-PostgREST-Settings` header. This enforces row-level security in Postgres.
* **Race Condition Prevention**: The `book_slot` PL/pgSQL function locks the relevant booking row for update during booking creation, preventing duplicate or conflicting bookings.
* **Unique Constraint**: The database prevents exact duplicate bookings for the same user/date/time slot.
* **Error Handling**: All errors are logged and surfaced during operations.

---

## Limitations and Future Work

* **Time Overlaps**: Currently, overlapping time intervals (e.g., 2:00-2:30 vs 2:15-2:45) are not fully prevented. Interval overlap detection logic can be added to the booking function.
* **Authentication**: No JWT or OAuth implemented yet. Future versions should secure API with JWT tokens tied to users.
* **API Layer**: Currently a script. Building REST or GraphQL APIs on top will enable integration with frontend/UI.
* **Transaction Retry**: Adding retry logic in client code to handle booking conflicts more gracefully.
* **Monitoring**: Logging and metrics for booking attempts and failures can improve maintainability.

---

## Troubleshooting

* **Errors like `operator does not exist: time without time zone < timestamp without time zone`** indicate type mismatch in SQL queries — ensure you use correct data types and explicit casts.
* Check environment variables are correctly set and the Supabase URL/key are valid.
* Confirm RLS policies are enabled and working by testing queries with scoped clients.
* Use Supabase logs and SQL editor to debug function errors.

