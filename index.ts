import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Default client (for user creation/check)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getOrCreateUser(phone: string, name: string): Promise<string | null> {
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .single();

  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
  }

  if (existingUser) return existingUser.id;

  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert([{ phone, name }])
    .select()
    .single();

  if (insertError) {
    console.error('Insert error:', insertError.message);
  }

  return newUser?.id ?? null;
}

// Create scoped client with UUID-based RLS
function createScopedClient(uuid: string) {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: {
      headers: {
        'X-PostgREST-Settings': `app.uuid="${uuid}"`,
      },
    },
  });
}

// Fetch all bookings for a user
async function getUserBookings(uuid: string) {
  const scopedClient = createScopedClient(uuid);

  const { data, error } = await scopedClient
    .from('bookings2')
    .select('*');

  if (error) {
    console.error('Error fetching bookings:', error.message);
    return null;
  }

  return data;
}

// ✅ Create a new booking for the user
async function createBooking(uuid: string, date: string, time: string) {
  const scopedClient = createScopedClient(uuid);

  const { data, error } = await scopedClient
    .from('bookings2')
    .insert([{ date, time, status: 'booked' }])
    .select()
    .single();

  if (error) {
    console.error('Error creating booking:', error.message);
    return null;
  }

  return data;
}

// ♻️ Reschedule a booking (only accessible if RLS uuid matches)
async function rescheduleBooking(uuid: string, bookingId: string, newDate: string, newTime: string) {
  const scopedClient = createScopedClient(uuid);

  const { data, error } = await scopedClient
    .from('bookings2')
    .update({ date: newDate, time: newTime, status: 'rescheduled' })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) {
    console.error('Error rescheduling booking:', error.message);
    return null;
  }

  return data;
}

// ❌ Delete a booking (if user owns it)
async function deleteBooking(uuid: string, bookingId: string) {
  const scopedClient = createScopedClient(uuid);

  const { data, error } = await scopedClient
    .from('bookings2')
    .delete()
    .eq('id', bookingId)
    .select()
    .single();

  if (error) {
    console.error('Error deleting booking:', error.message);
    return null;
  }

  return data;
}

// --- NEW: Call Postgres function book_slot to test race condition locking ---
async function bookSlot(user_id: string, date: string, start_time: string, end_time: string) {
  const { data, error } = await supabase.rpc('book_slot', {
    p_user_id: user_id,
    p_date: date,
    p_start_time: start_time,
    p_end_time: end_time,
  });

  if (error) {
    throw new Error(error.message);
  }
}

// --- NEW: Simulate concurrent booking attempts to test race condition ---
async function simulateRaceCondition(uuid: string) {
  const date = '2025-06-10';

  // Overlapping time slots to test locking
  const bookings = [
    { start_time: '14:00:00', end_time: '14:30:00' },
    { start_time: '14:15:00', end_time: '14:45:00' },
  ];

  await Promise.allSettled(
    bookings.map(({ start_time, end_time }) =>
      bookSlot(uuid, date, start_time, end_time)
        .then(() => console.log(`Booking succeeded: ${start_time} - ${end_time}`))
        .catch((err) => console.error(`Booking failed: ${start_time} - ${end_time} | Error: ${err.message}`))
    )
  );
}

// Example usage
(async () => {
  const uuid = await getOrCreateUser('+919999888877', 'Soham Test');
  if (!uuid) return console.error('Could not fetch or create user.');

  console.log('UUID:', uuid);

  // Existing flow: create, reschedule, delete booking
  const newBooking = await createBooking(uuid, '2025-06-10', '15:30:00');
  console.log('New Booking:', newBooking);

  if (newBooking?.id) {
    const updatedBooking = await rescheduleBooking(uuid, newBooking.id, '2025-06-11', '16:00:00');
    console.log('Rescheduled:', updatedBooking);

    const deletedBooking = await deleteBooking(uuid, newBooking.id);
    console.log('Deleted Booking:', deletedBooking);
  }

  const bookings = await getUserBookings(uuid);
  console.log('Bookings:', bookings);

  // --- NEW: Simulate race condition with overlapping booking attempts
  console.log('\n--- Simulating race condition ---');
  await simulateRaceCondition(uuid);
})();


// import { createClient } from '@supabase/supabase-js';
// import dotenv from 'dotenv';
// dotenv.config();

// const SUPABASE_URL = process.env.SUPABASE_URL!;
// const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// // Default client (for user creation/check)
// const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// async function getOrCreateUser(phone: string, name: string): Promise<string | null> {
//   const { data: existingUser, error: fetchError } = await supabase
//     .from('users')
//     .select('id')
//     .eq('phone', phone)
//     .single();

//   if (fetchError) {
//     console.error('Fetch error:', fetchError.message);
//   }

//   if (existingUser) return existingUser.id;

//   const { data: newUser, error: insertError } = await supabase
//     .from('users')
//     .insert([{ phone, name }])
//     .select()
//     .single();

//   if (insertError) {
//     console.error('Insert error:', insertError.message);
//   }

//   return newUser?.id ?? null;
// }

// // Create scoped client with UUID-based RLS
// function createScopedClient(uuid: string) {
//   return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
//     global: {
//       headers: {
//         'X-PostgREST-Settings': `app.uuid="${uuid}"`,
//       },
//     },
//   });
// }

// // Fetch all bookings for a user
// async function getUserBookings(uuid: string) {
//   const scopedClient = createScopedClient(uuid);

//   const { data, error } = await scopedClient
//     .from('bookings2')
//     .select('*');

//   if (error) {
//     console.error('Error fetching bookings:', error.message);
//     return null;
//   }

//   return data;
// }

// // ✅ Create a new booking for the user
// async function createBooking(uuid: string, date: string, time: string) {
//   const scopedClient = createScopedClient(uuid);

//   const { data, error } = await scopedClient
//     .from('bookings2')
//     .insert([{ date, time, status: 'booked' }])
//     .select()
//     .single();

//   if (error) {
//     console.error('Error creating booking:', error.message);
//     return null;
//   }

//   return data;
// }

// // ♻️ Reschedule a booking (only accessible if RLS uuid matches)
// async function rescheduleBooking(uuid: string, bookingId: string, newDate: string, newTime: string) {
//   const scopedClient = createScopedClient(uuid);

//   const { data, error } = await scopedClient
//     .from('bookings2')
//     .update({ date: newDate, time: newTime, status: 'rescheduled' })
//     .eq('id', bookingId)
//     .select()
//     .single();

//   if (error) {
//     console.error('Error rescheduling booking:', error.message);
//     return null;
//   }

//   return data;
// }

// // ❌ Delete a booking (if user owns it)
// async function deleteBooking(uuid: string, bookingId: string) {
//   const scopedClient = createScopedClient(uuid);

//   const { data, error } = await scopedClient
//     .from('bookings2')
//     .delete()
//     .eq('id', bookingId)
//     .select()
//     .single();

//   if (error) {
//     console.error('Error deleting booking:', error.message);
//     return null;
//   }

//   return data;
// }

// // Example usage
// (async () => {
//   const uuid = await getOrCreateUser('+919999888877', 'Soham Test');
//   if (!uuid) return console.error('Could not fetch or create user.');

//   console.log('UUID:', uuid);

//   // ✅ Create a booking
//   const newBooking = await createBooking(uuid, '2025-06-10', '15:30:00');
//   console.log('New Booking:', newBooking);

//   // ♻️ Reschedule
//   if (newBooking?.id) {
//     const updatedBooking = await rescheduleBooking(uuid, newBooking.id, '2025-06-11', '16:00:00');
//     console.log('Rescheduled:', updatedBooking);
//   }

//   // ❌ Delete the booking
//   if (newBooking?.id) {
//     const deletedBooking = await deleteBooking(uuid, newBooking.id);
//     console.log('Deleted Booking:', deletedBooking);
//   }

//   // Fetch bookings again
//   const bookings = await getUserBookings(uuid);
//   console.log('Bookings:', bookings);
// })();


