-- ============================================================
-- ARDE Awards Seed Data
-- Run this in your MySQL client (Aiven or local)
-- ============================================================

INSERT INTO awards (title, description, deadline, max_winners) VALUES

-- ── SBRC ──────────────────────────────────────────────────

(
  'Singapore Best Receptionist Competition 2026',
  'The Singapore Best Receptionist Competition (SBRC) returns for its 31st edition, recognising outstanding front office professionals in Singapore''s hospitality industry. The winner will represent Singapore at the World''s Best Receptionist Competition (WBRC) at the AICR Congress 2027. Participants are assessed on service excellence, professionalism, communication skills, and leadership potential. Registration closes 31 July 2026.',
  '2026-07-31',
  1
),

-- ── SHA Best Department 2026 (OPEN — deadline future) ─────

(
  'SHA Best Front Office Department 2026',
  'Recognising outstanding front office departments across Economy, Upscale, and Luxury hotel segments. In partnership with Peak Hospitality Solutions, the competition runs from 1 August to 31 October 2026 through mystery shopping exercises. The hotel with the highest points in each segment will be declared the winner. Register by 31 July 2026.',
  '2026-07-31',
  3
),
(
  'SHA Best Concierge Department 2026',
  'Celebrating excellence in concierge services across Economy, Upscale, and Luxury hotel segments. Mystery shopping evaluations are conducted by Peak Hospitality Solutions from 1 August to 31 October 2026, assessing guest service, professionalism, and operational standards. Register by 31 July 2026.',
  '2026-07-31',
  3
),
(
  'SHA Best Housekeeping Department 2026',
  'Recognising exceptional housekeeping departments that set the gold standard for cleanliness, operational precision, and guest satisfaction. Evaluated across Economy, Upscale, and Luxury segments through mystery shopping exercises conducted from 1 August to 31 October 2026. Register by 31 July 2026.',
  '2026-07-31',
  3
),
(
  'SHA Best Executive Club Floor Department 2026',
  'Celebrating excellence in executive club floor services delivering superior guest experiences. Evaluated across Upscale and Luxury hotel segments through mystery shopping exercises conducted from 1 August to 31 October 2026. Register by 31 July 2026.',
  '2026-07-31',
  3
),

-- ── SBRC 2025 (PAST — closed) ─────────────────────────────

(
  'Singapore Best Receptionist Competition 2025',
  'The 30th edition of the Singapore Best Receptionist Competition celebrated outstanding front office professionals in Singapore''s hospitality industry. The winner represented Singapore at the World''s Best Receptionist Competition (WBRC) during the AICR Congress 2026 in Belgium. Assessments included a written examination, professional interview, and hospitality role play.',
  '2025-07-31',
  1
),

-- ── SHA Best Department 2025 (PAST — closed) ──────────────

(
  'SHA Best Front Office Department 2025',
  'The SHA Best Front Office Department Awards 2025 recognised outstanding front office teams across Economy, Upscale, and Luxury hotel segments. Mystery shopping was conducted from 1 August to 31 October 2025 in partnership with Peak Hospitality Solutions Pte Ltd.',
  '2025-07-31',
  3
),
(
  'SHA Best Concierge Department 2025',
  'The SHA Best Concierge Department Awards 2025 celebrated concierge teams delivering exceptional service across Economy, Upscale, and Luxury hotel segments, evaluated through mystery shopping exercises from 1 August to 31 October 2025.',
  '2025-07-31',
  3
),
(
  'SHA Best Housekeeping Department 2025',
  'The SHA Best Housekeeping Department Awards 2025 recognised housekeeping departments setting the benchmark for cleanliness and guest satisfaction across Economy, Upscale, and Luxury segments. Mystery shopping ran from 1 August to 31 October 2025.',
  '2025-07-31',
  3
),
(
  'SHA Best Executive Club Floor Department 2025',
  'The SHA Best Executive Club Floor Department Awards 2025 celebrated excellence in executive floor services across Upscale and Luxury hotel segments, evaluated through mystery shopping from 1 August to 31 October 2025.',
  '2025-07-31',
  3
);
