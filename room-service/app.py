import os
import time
import psycopg2
from flask import Flask, jsonify, request

app = Flask(__name__)

DB_HOST = os.getenv("DB_HOST", "room-db")
DB_NAME = os.getenv("DB_NAME", "room_db")
DB_USER = os.getenv("DB_USER", "room_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "room_password")
DB_PORT = os.getenv("DB_PORT", "5432")

conn = None


def connect_with_retry(retries=20, delay=3):
    global conn

    for attempt in range(1, retries + 1):
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                port=DB_PORT
            )
            print("Room Service berhasil terhubung ke PostgreSQL")
            return
        except Exception as error:
            print(f"Menunggu PostgreSQL siap... percobaan {attempt}")
            print(error)
            time.sleep(delay)

    raise Exception("Room Service gagal terhubung ke PostgreSQL")


def init_database():
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            id SERIAL PRIMARY KEY,
            room_number VARCHAR(20) NOT NULL UNIQUE,
            room_type VARCHAR(50) NOT NULL,
            price INT NOT NULL,
            capacity INT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'available',
            description TEXT
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM rooms")
    total = cursor.fetchone()[0]

    if total == 0:
        cursor.execute("""
            INSERT INTO rooms 
            (room_number, room_type, price, capacity, status, description)
            VALUES
            ('101', 'Standard', 300000, 2, 'available', 'Kamar standard dengan AC dan WiFi'),
            ('102', 'Standard', 300000, 2, 'booked', 'Kamar standard dekat lobby'),
            ('201', 'Deluxe', 500000, 3, 'available', 'Kamar deluxe dengan balkon'),
            ('301', 'Suite', 850000, 4, 'maintenance', 'Kamar suite sedang maintenance')
        """)

    conn.commit()
    cursor.close()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "service": "room-service",
        "language": "Python",
        "framework": "Flask",
        "database": "PostgreSQL",
        "status": "running"
    })


@app.route("/rooms", methods=["GET"])
def get_rooms():
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, room_number, room_type, price, capacity, status, description
        FROM rooms
        ORDER BY id ASC
    """)
    rows = cursor.fetchall()
    cursor.close()

    rooms = []
    for row in rows:
        rooms.append({
            "id": row[0],
            "room_number": row[1],
            "room_type": row[2],
            "price": row[3],
            "capacity": row[4],
            "status": row[5],
            "description": row[6]
        })

    return jsonify({
        "service": "room-service",
        "database": "PostgreSQL",
        "data": rooms
    })


@app.route("/rooms/<int:room_id>", methods=["GET"])
def get_room_detail(room_id):
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, room_number, room_type, price, capacity, status, description
        FROM rooms
        WHERE id = %s
    """, (room_id,))
    row = cursor.fetchone()
    cursor.close()

    if row is None:
        return jsonify({
            "message": "Kamar tidak ditemukan"
        }), 404

    return jsonify({
        "service": "room-service",
        "database": "PostgreSQL",
        "data": {
            "id": row[0],
            "room_number": row[1],
            "room_type": row[2],
            "price": row[3],
            "capacity": row[4],
            "status": row[5],
            "description": row[6]
        }
    })


@app.route("/rooms/available", methods=["GET"])
def get_available_rooms():
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, room_number, room_type, price, capacity, status, description
        FROM rooms
        WHERE status = 'available'
        ORDER BY id ASC
    """)
    rows = cursor.fetchall()
    cursor.close()

    rooms = []
    for row in rows:
        rooms.append({
            "id": row[0],
            "room_number": row[1],
            "room_type": row[2],
            "price": row[3],
            "capacity": row[4],
            "status": row[5],
            "description": row[6]
        })

    return jsonify({
        "service": "room-service",
        "message": "Daftar kamar yang tersedia",
        "data": rooms
    })


@app.route("/rooms", methods=["POST"])
def create_room():
    body = request.get_json()

    room_number = body.get("room_number")
    room_type = body.get("room_type")
    price = body.get("price")
    capacity = body.get("capacity")
    status = body.get("status", "available")
    description = body.get("description")

    if not room_number or not room_type or price is None or capacity is None:
        return jsonify({
            "message": "room_number, room_type, price, dan capacity wajib diisi"
        }), 400

    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO rooms 
            (room_number, room_type, price, capacity, status, description)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (room_number, room_type, price, capacity, status, description))

        new_id = cursor.fetchone()[0]
        conn.commit()

        return jsonify({
            "service": "room-service",
            "message": "Kamar berhasil ditambahkan",
            "data": {
                "id": new_id,
                "room_number": room_number,
                "room_type": room_type,
                "price": price,
                "capacity": capacity,
                "status": status,
                "description": description
            }
        }), 201

    except Exception as error:
        conn.rollback()
        return jsonify({
            "message": "Gagal menambahkan kamar",
            "error": str(error)
        }), 500

    finally:
        cursor.close()


@app.route("/rooms/<int:room_id>", methods=["PUT"])
def update_room(room_id):
    body = request.get_json()

    room_number = body.get("room_number")
    room_type = body.get("room_type")
    price = body.get("price")
    capacity = body.get("capacity")
    status = body.get("status")
    description = body.get("description")

    cursor = conn.cursor()

    cursor.execute("""
        UPDATE rooms
        SET room_number = %s,
            room_type = %s,
            price = %s,
            capacity = %s,
            status = %s,
            description = %s
        WHERE id = %s
    """, (room_number, room_type, price, capacity, status, description, room_id))

    if cursor.rowcount == 0:
        conn.rollback()
        cursor.close()
        return jsonify({
            "message": "Kamar tidak ditemukan"
        }), 404

    conn.commit()
    cursor.close()

    return jsonify({
        "service": "room-service",
        "message": "Data kamar berhasil diperbarui",
        "data": {
            "id": room_id,
            "room_number": room_number,
            "room_type": room_type,
            "price": price,
            "capacity": capacity,
            "status": status,
            "description": description
        }
    })


@app.route("/rooms/<int:room_id>/status", methods=["PATCH"])
def update_room_status(room_id):
    body = request.get_json()
    status = body.get("status")

    allowed_status = ["available", "booked", "occupied", "maintenance", "cleaning"]

    if status not in allowed_status:
        return jsonify({
            "message": "Status tidak valid",
            "allowed_status": allowed_status
        }), 400

    cursor = conn.cursor()
    cursor.execute("""
        UPDATE rooms
        SET status = %s
        WHERE id = %s
    """, (status, room_id))

    if cursor.rowcount == 0:
        conn.rollback()
        cursor.close()
        return jsonify({
            "message": "Kamar tidak ditemukan"
        }), 404

    conn.commit()
    cursor.close()

    return jsonify({
        "service": "room-service",
        "message": "Status kamar berhasil diperbarui",
        "data": {
            "id": room_id,
            "status": status
        }
    })


@app.route("/rooms/<int:room_id>", methods=["DELETE"])
def delete_room(room_id):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM rooms WHERE id = %s", (room_id,))

    if cursor.rowcount == 0:
        conn.rollback()
        cursor.close()
        return jsonify({
            "message": "Kamar tidak ditemukan"
        }), 404

    conn.commit()
    cursor.close()

    return jsonify({
        "service": "room-service",
        "message": "Kamar berhasil dihapus"
    })


if __name__ == "__main__":
    connect_with_retry()
    init_database()
    app.run(host="0.0.0.0", port=5000)