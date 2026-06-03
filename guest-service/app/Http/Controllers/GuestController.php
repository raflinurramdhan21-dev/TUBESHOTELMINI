<?php

namespace App\Http\Controllers;

use App\Models\Guest;
use Illuminate\Http\Request;

class GuestController extends Controller
{
    // READ ALL
    public function index()
    {
        return response()->json(Guest::all());
    }

    // CREATE
    public function store(Request $request)
    {
        $guest = Guest::create([
            'nama' => $request->nama,
            'email' => $request->email,
            'no_telp' => $request->no_telp,
            'alamat' => $request->alamat
        ]);

        return response()->json($guest, 201);
    }

    // READ ONE
    public function show(string $id)
    {
        return response()->json(
            Guest::findOrFail($id)
        );
    }

    // UPDATE
    public function update(Request $request, string $id)
    {
        $guest = Guest::findOrFail($id);

        $guest->update([
            'nama' => $request->nama,
            'email' => $request->email,
            'no_telp' => $request->no_telp,
            'alamat' => $request->alamat
        ]);

        return response()->json($guest);
    }

    // DELETE
    public function destroy(string $id)
    {
        $guest = Guest::findOrFail($id);

        $guest->delete();

        return response()->json([
            'message' => 'Guest berhasil dihapus'
        ]);
    }
}