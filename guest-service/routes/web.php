<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Tambahkan ini:
Route::get('/health', function () {
    return response()->json([
        'service' => 'guest-service',
        'status' => 'running'
    ]);
});