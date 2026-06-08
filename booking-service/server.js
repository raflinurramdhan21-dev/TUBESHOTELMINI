const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

const PORT = 3000;

const ROOM_SERVICE_URL = 
  process.env.ROOM_SERVICE_URL || "http://room-service:5001";

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://payment-service:5002";

const GUEST_SERVICE_URL = 
  process.env.GUEST_SERVICE_URL || "http://guest-service:8000"

const BOOKING_SERVICE_URL = 
  process.env.BOOKING_SERVICE_URL || "http://booking:3000"

const MONGO_URL =
  process.env.MONGO_URL || "mongodb://booking:bookingpassword@booking-db:27017/booking_db?authSource=admin";

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log("MongoDB connected");
  } catch (err) {
    console.log("MongoDB error:", err.message);
  }
}

async function getGuest(id) {
  const res = await fetch(
    `${GUEST_SERVICE_URL}/api/guests/${id}`
  );

  if (!res.ok){
    throw new Error(`Guest tidak ditemukan: ${res.status}`);
  }

  return await res.json();
  
}

async function getRoom(id) {
  const res = await fetch(
    `${ROOM_SERVICE_URL}/rooms/${id}`
  );

  if (!res.ok) {
    throw new Error(`Gagal menemukan room`)
  }

  const data = await res.json();
  return data.data
}

const bookingSchema = new mongoose.Schema(
  {
    guest_name: String,
    guest_id: Number,
    room_id: Number,
    check_in: String,
    check_out: String,

    room_snapshot: {
       id: Number,
       room_number: String,
       price: Number
    },
    total_price: Number,

    status: {
      type: String,
      default: "created",
    }
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", bookingSchema);

app.get("/health", (req, res) => {
  res.json({
    service: "booking-service",
    status: "running",
  });
});

app.get("/bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });

  res.json({
    service: "booking-service",
    data
  });
});

app.get("/bookings/:id", async (req, res) => {
  const data = await Booking.findById(req.params.id);

  if (!data) {
    return res.status(404).json({
      service: "booking-service",
      message: "Booking tidak ditemukan",
    });
  }

  res.json({
    service: "booking-service",
    data
  });
});

app.post("/bookings", async (req, res) => {
  try {
    const { guest_id, room_id, check_in, check_out } = req.body;

    const guest = await getGuest(guest_id);

    const roomRes = await fetch(`${ROOM_SERVICE_URL}/rooms/${room_id}`);

    if (!roomRes.ok) {
      throw new Error("Room tidak ditemukan");
    }

    const roomResult = await roomRes.json();
    const roomData = roomResult?.data;

    if(!roomData) {
      throw new Error("Room data kosong")
    }

    if (roomData.status !== "available") {
      return res.status(400).json({
        service: "booking-service",
        message: "Room tidak tersedia",
      });
    }

    const total_price = roomData.price;

    const booking = await Booking.create({
      guest_name: guest.nama,
      guest_id,
      room_id,
      check_in,
      check_out,
      room_snapshot: roomData,
      total_price,
      status: "created"
    });

  try {
    await fetch(`${PAYMENT_SERVICE_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        booking_id: booking._id,
        guest_id,
        room_id,
        amount: total_price,
      }),
    });
  } catch (err) {
    console.log("Payment belum tersedia")
  }

    await fetch(`${ROOM_SERVICE_URL}/rooms/${room_id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "booked"
      })
    });

    booking.status = "confirmed";
    await booking.save();

    res.status(201).json({
      service: "booking-service",
      message: "Booking berhasil dibuat",
      data: booking
    });

  }catch (error) {
    res.status(500).json({
      service: "booking-service",
      message: "Gagal membuat booking",
      error: error.message
    });
  }
});

app.patch("/bookings/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        message: "Booking tidak ditemukan"
      });
    }

    booking.status = status;
    await booking.save();

    if (status === "cancelled") {
      await fetch(`${ROOM_SERVICE_URL}/rooms/${booking.room_id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "available",
        }),
      });
    }

    res.json({
      service: "booking-service",
      message: "Status booking berhasil diupdate",
      data: booking,
    });
  } catch (err) {
    res.status(500).json({
      message: "Gagal update booking",
      error: err.message,
    });
  }
});

app.delete("/bookings/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        service:  "booking-service",
        message: "booking tidak ditemukan",
      });
    }

    await fetch(`${ROOM_SERVICE_URL}/rooms/${booking.room_id}/status`, {
      method: "PATCH",
      headers:  {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "available"
      }),
    });

    await Booking.findByIdAndDelete(req.params.id);

    res.json({
      service: "booking-service",
      message: "Booking berhasil dihapus",
    });

  } catch (err) {
    res.status(500).json({
      service: "booking-service",
      message: "Gagal menghapus booking",
      error: err.message,
    });
  }
});

async function start(){
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Booking service running on port ${PORT}`);
  });
  
}

start();
