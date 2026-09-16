#!/usr/bin/env pwsh
# Script tạo và push tất cả nhánh chức năng theo mô hình 3 tầng
# Nhóm E - Đồ án Đặt Vé Máy Bay

$ErrorActionPreference = "Stop"

Write-Host "=== BẮT ĐẦU TẠO NHÁNH CHO NHÓM E ===" -ForegroundColor Cyan

# ─────────────────────────────────────────────
# MODULE: feature/auth  (Thành viên A)
# Nhánh chức năng đã có: user-register, user-update, user-delete, user-list, user-detail
#                        role-add, role-edit, role-delete, role-list, role-detail
# => Chỉ cần push những nhánh chưa có trên remote
# ─────────────────────────────────────────────
Write-Host "`n[MODULE AUTH] Kiểm tra & push nhánh còn thiếu trên remote..." -ForegroundColor Yellow

$authBranches = @(
    "feature/user-register",
    "feature/user-update",
    "feature/user-delete",
    "feature/user-list",
    "feature/user-detail",
    "feature/role-add",
    "feature/role-edit",
    "feature/role-delete",
    "feature/role-list",
    "feature/role-detail"
)

# Lấy danh sách remote branches
$remoteBranches = git branch -r | ForEach-Object { $_.Trim() -replace "^origin/", "" }

foreach ($branch in $authBranches) {
    if ($remoteBranches -notcontains $branch) {
        Write-Host "  Push: $branch" -ForegroundColor Green
        git checkout $branch 2>&1 | Out-Null
        git push -u origin $branch 2>&1
    } else {
        Write-Host "  Đã có trên remote: $branch" -ForegroundColor Gray
    }
}

# ─────────────────────────────────────────────
# MODULE: feature/airline-airport  (Thành viên B)
# ─────────────────────────────────────────────
Write-Host "`n[MODULE AIRLINE-AIRPORT] Tạo nhánh chức năng từ nhánh module..." -ForegroundColor Yellow

git checkout feature/airline-airport
git pull origin feature/airline-airport 2>&1 | Out-Null

$airlineBranches = @(
    "feature/airline-add",
    "feature/airline-edit",
    "feature/airline-delete",
    "feature/airline-list",
    "feature/airline-detail",
    "feature/airport-add",
    "feature/airport-edit",
    "feature/airport-delete",
    "feature/airport-list",
    "feature/airport-detail"
)

foreach ($branch in $airlineBranches) {
    $localExists = git branch --list $branch
    if ($localExists) {
        Write-Host "  Đã có local: $branch" -ForegroundColor Gray
        git checkout $branch 2>&1 | Out-Null
    } else {
        Write-Host "  Tạo mới: $branch" -ForegroundColor Green
        git checkout -b $branch 2>&1 | Out-Null
    }

    # Push lên remote nếu chưa có
    if ($remoteBranches -notcontains $branch) {
        git push -u origin $branch 2>&1
        Write-Host "    => Pushed $branch" -ForegroundColor Cyan
    } else {
        Write-Host "    => Đã có trên remote" -ForegroundColor Gray
    }
}

# ─────────────────────────────────────────────
# MODULE: feature/flight-fareclass  (Thành viên C)
# ─────────────────────────────────────────────
Write-Host "`n[MODULE FLIGHT-FARECLASS] Tạo nhánh chức năng từ nhánh module..." -ForegroundColor Yellow

git checkout feature/flight-fareclass
git pull origin feature/flight-fareclass 2>&1 | Out-Null

$flightBranches = @(
    "feature/flight-add",
    "feature/flight-edit",
    "feature/flight-delete",
    "feature/flight-list",
    "feature/flight-detail",
    "feature/fareclass-add",
    "feature/fareclass-edit",
    "feature/fareclass-delete",
    "feature/fareclass-list",
    "feature/fareclass-detail"
)

foreach ($branch in $flightBranches) {
    $localExists = git branch --list $branch
    if ($localExists) {
        Write-Host "  Đã có local: $branch" -ForegroundColor Gray
        git checkout $branch 2>&1 | Out-Null
    } else {
        Write-Host "  Tạo mới: $branch" -ForegroundColor Green
        git checkout -b $branch 2>&1 | Out-Null
    }

    if ($remoteBranches -notcontains $branch) {
        git push -u origin $branch 2>&1
        Write-Host "    => Pushed $branch" -ForegroundColor Cyan
    } else {
        Write-Host "    => Đã có trên remote" -ForegroundColor Gray
    }
}

# ─────────────────────────────────────────────
# MODULE: feature/booking-payment  (Thành viên D)
# ─────────────────────────────────────────────
Write-Host "`n[MODULE BOOKING-PAYMENT] Tạo nhánh chức năng từ nhánh module..." -ForegroundColor Yellow

git checkout feature/booking-payment
git pull origin feature/booking-payment 2>&1 | Out-Null

$bookingBranches = @(
    "feature/booking-create",
    "feature/booking-update",
    "feature/booking-cancel",
    "feature/booking-list",
    "feature/booking-detail",
    "feature/payment-create",
    "feature/payment-refund",
    "feature/payment-cancel",
    "feature/payment-list",
    "feature/payment-detail"
)

foreach ($branch in $bookingBranches) {
    $localExists = git branch --list $branch
    if ($localExists) {
        Write-Host "  Đã có local: $branch" -ForegroundColor Gray
        git checkout $branch 2>&1 | Out-Null
    } else {
        Write-Host "  Tạo mới: $branch" -ForegroundColor Green
        git checkout -b $branch 2>&1 | Out-Null
    }

    if ($remoteBranches -notcontains $branch) {
        git push -u origin $branch 2>&1
        Write-Host "    => Pushed $branch" -ForegroundColor Cyan
    } else {
        Write-Host "    => Đã có trên remote" -ForegroundColor Gray
    }
}

# ─────────────────────────────────────────────
# Quay về develop
# ─────────────────────────────────────────────
git checkout develop
Write-Host "`n=== HOÀN THÀNH! Tổng kết nhánh hiện có ===" -ForegroundColor Cyan
git branch -a
