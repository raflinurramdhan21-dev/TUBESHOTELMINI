import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

// ================= SERVICE URL (DOCKER SAFE) =================
const ROOM_SERVICE_URL = process.env.ROOM_SERVICE_URL || "http://localhost:5001";
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://localhost:3000";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:5002";
const GUEST_SERVICE_URL = process.env.GUEST_SERVICE_URL || "http://localhost:8000";

// ================= FETCH HELPER =================
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

// ================= TYPE DEFINITIONS =================
const typeDefs = `#graphql

type Room {
  id: ID
  room_number: String
  room_type: String
  price: Int
  capacity: Int
  status: String
  description: String
}

type Guest {
  id: ID
  nama: String
  email: String
  no_telp: String
  alamat: String
}

type Booking {
  id: ID
  guest_id: Int
  guest_name: String
  room_id: Int
  check_in: String
  check_out: String
  total_price: Int
  status: String
  createdAt: String
}

type Payment {
  id: ID
  order_id: String
  room_id: Int
  amount: Int
  currency: String
  method: String
  status: String
  description: String
  created_at: String
}

type Query {
  rooms: [Room]
  room(id: ID!): Room

  guests: [Guest]
  guest(id: ID!): Guest

  bookings: [Booking]
  booking(id: ID!): Booking

  payments: [Payment]
  payment(id: ID!): Payment

  systemStatus: String
}

type Mutation {
  createRoom(room_number: String!, room_type: String!, price: Int!, capacity: Int!, description: String): Room
  updateRoom(id: ID!, room_number: String, room_type: String, price: Int, capacity: Int, status: String, description: String): Room
  updateRoomStatus(id: ID!, status: String!): Room
  deleteRoom(id: ID!): String

  createGuest(nama: String!, email: String!, no_telp: String, alamat: String): Guest
  updateGuest(id: ID!, nama: String, email: String, no_telp: String, alamat: String): Guest
  deleteGuest(id: ID!): String

  createBooking(guest_id: Int!, room_id: Int!, check_in: String!, check_out: String!): Booking
  updateBookingStatus(id: ID!, status: String!): Booking
  deleteBooking(id: ID!): String

  createPayment(order_id: String!, room_id: Int!, amount: Int!, method: String!, description: String): Payment
  updatePaymentStatus(id: ID!, status: String!): Payment
  deletePayment(id: ID!): String
}
`;

// ================= RESOLVERS =================
const resolvers = {
  Query: {
    rooms: async () => (await fetchJson(`${ROOM_SERVICE_URL}/rooms`)).data,
    room: async (_, { id }) => (await fetchJson(`${ROOM_SERVICE_URL}/rooms/${id}`)).data,

    guests: async () => (await fetchJson(`${GUEST_SERVICE_URL}/api/guests`)).data,
    guest: async (_, { id }) => (await fetchJson(`${GUEST_SERVICE_URL}/api/guests/${id}`)).data,

    bookings: async () => (await fetchJson(`${BOOKING_SERVICE_URL}/bookings`)).data,
    booking: async (_, { id }) => (await fetchJson(`${BOOKING_SERVICE_URL}/bookings/${id}`)).data,

    payments: async () => (await fetchJson(`${PAYMENT_SERVICE_URL}/payments`)).data,
    payment: async (_, { id }) => (await fetchJson(`${PAYMENT_SERVICE_URL}/payments/${id}`)).data,

    systemStatus: async () => {
      try {
        await Promise.all([
          fetchJson(`${ROOM_SERVICE_URL}/health`),
          fetchJson(`${BOOKING_SERVICE_URL}/health`),
          fetchJson(`${PAYMENT_SERVICE_URL}/health`),
          fetchJson(`${GUEST_SERVICE_URL}/api/health`),
        ]);
        return "ALL SERVICES OK";
      } catch {
        return "SOME SERVICE DOWN";
      }
    },
  },

  Mutation: {
    // ===== ROOM =====
    createRoom: async (_, args) =>
      (await fetchJson(`${ROOM_SERVICE_URL}/rooms`, {
        method: "POST",
        body: JSON.stringify(args),
      })).data,

    updateRoom: async (_, { id, ...body }) =>
      (await fetchJson(`${ROOM_SERVICE_URL}/rooms/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })).data,

    updateRoomStatus: async (_, { id, status }) =>
      (await fetchJson(`${ROOM_SERVICE_URL}/rooms/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })).data,

    deleteRoom: async (_, { id }) =>
      (await fetchJson(`${ROOM_SERVICE_URL}/rooms/${id}`, {
        method: "DELETE",
      })).message,

    // ===== GUEST =====
    createGuest: async (_, args) =>
      (await fetchJson(`${GUEST_SERVICE_URL}/api/guests`, {
        method: "POST",
        body: JSON.stringify(args),
      })).data,

    updateGuest: async (_, { id, ...body }) =>
      (await fetchJson(`${GUEST_SERVICE_URL}/api/guests/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })).data,

    deleteGuest: async (_, { id }) =>
      (await fetchJson(`${GUEST_SERVICE_URL}/api/guests/${id}`, {
        method: "DELETE",
      })).message,

    // ===== BOOKING =====
    createBooking: async (_, args) =>
      (await fetchJson(`${BOOKING_SERVICE_URL}/bookings`, {
        method: "POST",
        body: JSON.stringify(args),
      })).data,

    updateBookingStatus: async (_, { id, status }) =>
      (await fetchJson(`${BOOKING_SERVICE_URL}/bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })).data,

    deleteBooking: async (_, { id }) =>
      (await fetchJson(`${BOOKING_SERVICE_URL}/bookings/${id}`, {
        method: "DELETE",
      })).message,

    // ===== PAYMENT =====
    createPayment: async (_, args) =>
      (await fetchJson(`${PAYMENT_SERVICE_URL}/payments`, {
        method: "POST",
        body: JSON.stringify(args),
      })).data,

    updatePaymentStatus: async (_, { id, status }) =>
      (await fetchJson(`${PAYMENT_SERVICE_URL}/payments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })).data,

    deletePayment: async (_, { id }) =>
      (await fetchJson(`${PAYMENT_SERVICE_URL}/payments/${id}`, {
        method: "DELETE",
      })).message,
  },
};

// ================= START SERVER =================
const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`🚀 GraphQL Gateway running at ${url}`);