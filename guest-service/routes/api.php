<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\GuestController;

Route::get('/health', function () {
    return response()->json([
        'service' => 'guest-service',
        'status' => 'running'
    ]);
});

Route::apiResource('guests', GuestController::class);