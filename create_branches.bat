@echo off
REM ============================================================
REM  Script tạo nhánh chức năng - Nhóm E - Đặt Vé Máy Bay
REM ============================================================

echo ============================================================
echo   MODULE: feature/airline-airport  (Thanh vien B)
echo ============================================================

git checkout feature/airline-airport
git checkout -b feature/airline-add
git push -u origin feature/airline-add
git checkout feature/airline-airport
git checkout -b feature/airline-edit
git push -u origin feature/airline-edit
git checkout feature/airline-airport
git checkout -b feature/airline-delete
git push -u origin feature/airline-delete
git checkout feature/airline-airport
git checkout -b feature/airline-list
git push -u origin feature/airline-list
git checkout feature/airline-airport
git checkout -b feature/airline-detail
git push -u origin feature/airline-detail
git checkout feature/airline-airport
git checkout -b feature/airport-add
git push -u origin feature/airport-add
git checkout feature/airline-airport
git checkout -b feature/airport-edit
git push -u origin feature/airport-edit
git checkout feature/airline-airport
git checkout -b feature/airport-delete
git push -u origin feature/airport-delete
git checkout feature/airline-airport
git checkout -b feature/airport-list
git push -u origin feature/airport-list
git checkout feature/airline-airport
git checkout -b feature/airport-detail
git push -u origin feature/airport-detail

echo.
echo ============================================================
echo   MODULE: feature/flight-fareclass  (Thanh vien C)
echo ============================================================

git checkout feature/flight-fareclass
git checkout -b feature/flight-add
git push -u origin feature/flight-add
git checkout feature/flight-fareclass
git checkout -b feature/flight-edit
git push -u origin feature/flight-edit
git checkout feature/flight-fareclass
git checkout -b feature/flight-delete
git push -u origin feature/flight-delete
git checkout feature/flight-fareclass
git checkout -b feature/flight-list
git push -u origin feature/flight-list
git checkout feature/flight-fareclass
git checkout -b feature/flight-detail
git push -u origin feature/flight-detail
git checkout feature/flight-fareclass
git checkout -b feature/fareclass-add
git push -u origin feature/fareclass-add
git checkout feature/flight-fareclass
git checkout -b feature/fareclass-edit
git push -u origin feature/fareclass-edit
git checkout feature/flight-fareclass
git checkout -b feature/fareclass-delete
git push -u origin feature/fareclass-delete
git checkout feature/flight-fareclass
git checkout -b feature/fareclass-list
git push -u origin feature/fareclass-list
git checkout feature/flight-fareclass
git checkout -b feature/fareclass-detail
git push -u origin feature/fareclass-detail

echo.
echo ============================================================
echo   MODULE: feature/booking-payment  (Thanh vien D)
echo ============================================================

git checkout feature/booking-payment
git checkout -b feature/booking-create
git push -u origin feature/booking-create
git checkout feature/booking-payment
git checkout -b feature/booking-update
git push -u origin feature/booking-update
git checkout feature/booking-payment
git checkout -b feature/booking-cancel
git push -u origin feature/booking-cancel
git checkout feature/booking-payment
git checkout -b feature/booking-list
git push -u origin feature/booking-list
git checkout feature/booking-payment
git checkout -b feature/booking-detail
git push -u origin feature/booking-detail
git checkout feature/booking-payment
git checkout -b feature/payment-create
git push -u origin feature/payment-create
git checkout feature/booking-payment
git checkout -b feature/payment-refund
git push -u origin feature/payment-refund
git checkout feature/booking-payment
git checkout -b feature/payment-cancel
git push -u origin feature/payment-cancel
git checkout feature/booking-payment
git checkout -b feature/payment-list
git push -u origin feature/payment-list
git checkout feature/booking-payment
git checkout -b feature/payment-detail
git push -u origin feature/payment-detail

echo.
echo ============================================================
echo   Quay ve develop - Ket thuc!
echo ============================================================
git checkout develop

echo.
echo === TONG KET NHANH HIEN CO ===
git branch -a
