import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { homeDestinations } from '../homeData';
import { formatCurrency } from '../../../lib/formatters';

export function extractMinPriceForFlights(flightList) {
  if (!Array.isArray(flightList) || flightList.length === 0) return null;
  let minPrice = null;

  for (const flight of flightList) {
    // 1. Chỉ tính chuyến scheduled
    const status = String(flight?.status || '').toLowerCase();
    if (status !== 'scheduled') continue;

    // 2. Chỉ tính chuyến còn ghế
    const availableSeats = Number(flight?.available_seats ?? flight?.availableSeats);
    if (!Number.isFinite(availableSeats) || availableSeats <= 0) continue;

    // 3. Lấy MIN(fare_classes.price)
    const fares = Array.isArray(flight.fareClasses)
      ? flight.fareClasses
      : Array.isArray(flight.fare_classes)
      ? flight.fare_classes
      : [];

    for (const fare of fares) {
      if (fare?.seat_quota !== null && fare?.seat_quota !== undefined && Number(fare.seat_quota) <= 0) {
        continue;
      }
      const price = Number(fare?.price);
      if (Number.isFinite(price) && price > 0) {
        if (minPrice === null || price < minPrice) {
          minPrice = price;
        }
      }
    }
  }

  return minPrice;
}

export function countScheduledFlightsInNext7Days(flightList, referenceDate = new Date()) {
  if (!Array.isArray(flightList) || flightList.length === 0) return 0;
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let count = 0;
  for (const flight of flightList) {
    const status = String(flight?.status || '').toLowerCase();
    if (status !== 'scheduled') continue;

    const availableSeats = Number(flight?.available_seats ?? flight?.availableSeats);
    if (!Number.isFinite(availableSeats) || availableSeats <= 0) continue;

    const depRaw = flight?.departure_time || flight?.departureTime;
    if (!depRaw) continue;
    const depTime = new Date(depRaw).getTime();
    if (Number.isFinite(depTime) && depTime >= now.getTime() && depTime <= next7Days.getTime()) {
      count++;
    }
  }

  return count;
}

export function DestinationGrid({ api, onSelectDestination }) {
  const [filter, setFilter] = useState('all');
  const [apiPrices, setApiPrices] = useState({});
  const [destinationStats, setDestinationStats] = useState({});

  useEffect(() => {
    let active = true;

    async function fetchDestinationPrices() {
      if (!api) return;

      try {
        let airportMap = {};
        if (typeof api.searchAirports === 'function') {
          const airportRes = await api.searchAirports({ limit: 100 });
          if (Array.isArray(airportRes?.data)) {
            airportRes.data.forEach((ap) => {
              const code = ap?.iata_code || ap?.code;
              if (code && ap.id) airportMap[code] = ap.id;
            });
          }
        }

        const priceMap = {};
        const statsMap = {};
        const destPromises = homeDestinations.map(async (dest) => {
          const destCode = dest.code;
          const airportId = airportMap[destCode];
          if (!airportId || typeof api.searchFlights !== 'function') return;

          try {
            // Lọc theo sân bay đến của từng điểm đến, chỉ lấy chuyến còn ghế, sắp xếp giá thấp nhất
            const flightRes = await api.searchFlights({
              arrival_airport_id: airportId,
              min_seats: 1,
              sort_by: 'price_low',
              limit: 50,
            });

            if (!active) return;
            const flightList = Array.isArray(flightRes?.data) ? flightRes.data : [];
            const minPrice = extractMinPriceForFlights(flightList);
            if (minPrice !== null) {
              priceMap[destCode] = formatCurrency(minPrice);
            }

            // Với thẻ rộng (DAD, SGN): lấy dữ liệu thật số chuyến bay scheduled còn ghế trong 7 ngày tới
            if (destCode === 'DAD' || destCode === 'SGN') {
              const count7 = countScheduledFlightsInNext7Days(flightList);
              if (count7 > 0) {
                statsMap[destCode] = count7;
              }
            }
          } catch {
            // Điểm đến không có chuyến hoặc lỗi -> giữ nguyên, không lưu dữ liệu
          }
        });

        await Promise.allSettled(destPromises);
        if (active) {
          setApiPrices(priceMap);
          setDestinationStats(statsMap);
        }
      } catch {
        // Fallback im lặng khi toàn bộ fetch lỗi
      }
    }

    if (import.meta.env.MODE !== 'test') {
      fetchDestinationPrices();
    }

    return () => {
      active = false;
    };
  }, [api]);

  const filtered = filter === 'all'
    ? homeDestinations
    : homeDestinations.filter((item) => item.tag === filter);

  return (
    <section className="destination-section" aria-labelledby="destinations-heading">
      <div className="section-heading">
        <div>
          <span className="destination-eyebrow">ĐƯỜNG BAY PHỔ BIẾN</span>
          <h2 id="destinations-heading" className="section-title">
            Khám phá các điểm đến nổi bật
          </h2>
          <p className="destination-subtext">
            Xem lịch bay và giá vé cho các chặng bay được quan tâm nhiều nhất.
          </p>
        </div>

        <div className="destination-filters">
          <div className="filter-pills" role="tablist" aria-label="Bộ lọc điểm đến">
            <button
              type="button"
              role="tab"
              className={`filter-pill ${filter === 'all' ? 'is-active' : ''}`}
              aria-selected={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              Tất cả
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'domestic'}
              className={`filter-pill ${filter === 'domestic' ? 'is-active' : ''}`}
              onClick={() => setFilter('domestic')}
            >
              Nội địa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'international'}
              className={`filter-pill ${filter === 'international' ? 'is-active' : ''}`}
              onClick={() => setFilter('international')}
            >
              Quốc tế
            </button>
          </div>
          <a href="#flight-search-form" className="view-all-routes">
            <span>Tra cứu theo ngày</span>
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <div className="destination-grid-container">
        {filtered.map((place) => {
          const isSpanTwo = place.code === 'DAD' || place.code === 'SGN';
          const priceText = apiPrices[place.code] || 'Xem giá';

          return (
            <button
              className={`destination-card${isSpanTwo ? ' destination-card-span-2' : ''}`}
              type="button"
              key={place.code}
              aria-label={`Tìm chuyến bay đến ${place.city} (${place.code})`}
              onClick={() => onSelectDestination && onSelectDestination(place)}
            >
              <div
                className="destination-art"
                style={{ backgroundImage: `url("${place.image}")` }}
                aria-hidden="true"
              >
                <div className="destination-art-scrim" />
                {place.badge ? (
                  <span className="destination-badge-tag">{place.badge}</span>
                ) : null}
                <span className="destination-art-code font-mono">{place.code}</span>
              </div>

              <div className="destination-card-meta">
                <div className="destination-card-top-row">
                  <span className="destination-code font-mono">
                    {place.code} · {place.country}
                  </span>
                  <span className="destination-price-tag font-mono">
                    {priceText === 'Xem giá' ? priceText : `Từ ${priceText}`}
                  </span>
                </div>
                <h3 className="destination-city-name">{place.city}</h3>
                <p className="destination-note">{place.note}</p>
                {isSpanTwo && destinationStats[place.code] ? (
                  <p className="destination-7day-flights font-mono">
                    <span className="stat-bullet" aria-hidden="true">●</span>
                    <span>{destinationStats[place.code]} chuyến bay scheduled còn ghế trong 7 ngày tới</span>
                  </p>
                ) : null}
                <div className="destination-card-bottom-row">
                  <span className="destination-book-btn">
                    <span>Xem chuyến bay →</span>
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
