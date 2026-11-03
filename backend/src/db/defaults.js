// Starting values from the workflow (section 26). They are loaded into the
// settings tables once; after that the admin changes them in the console.
// [key, group, value, unit, label, min, max]
export const DEFAULT_SETTINGS = [
  // Platform fees (owner step-up, 30 days notice)
  ['fees.booking_fee_pct', 'fees', 5, '%', 'Booking fee paid by each traveller', 0, 30],
  ['fees.commission_pct', 'fees', 10, '%', 'Commission taken from partners', 0, 40],
  ['fees.tip_commission_pct', 'fees', 0, '%', 'Commission on tips', 0, 30],

  // Rate-card rules (owner step-up, 7 days notice)
  ['rates.band_min_pct', 'rates', 70, '%', "Lowest a partner's own rate may be (of the rate card)", 10, 100],
  ['rates.band_max_pct', 'rates', 130, '%', "Highest a partner's own rate may be (of the rate card)", 100, 300],
  ['rates.flexible_daily_km', 'rates', 150, 'km', 'Daily km allowance on flexible routes', 10, 1000],
  ['rates.fuel_advance_pct', 'rates', 30, '%', "Share of the transport booking paid after day-1 check-in", 0, 80],

  // Trips
  ['trips.min_days_ahead', 'deadlines', 5, 'days', 'Earliest start date from today', 1, 60],
  ['trips.min_group', 'deadlines', 2, 'people', 'Smallest group (including the organiser)', 2, 10],
  ['trips.max_group', 'deadlines', 30, 'people', 'Largest group (including the organiser)', 2, 60],
  ['trips.join_request_hours', 'deadlines', 72, 'hours', 'Organiser must answer a join request within', 1, 240],
  ['trips.complete_days_before', 'deadlines', 3, 'days', 'Booking and payment must be done this many days before the start', 1, 30],
  ['trips.reminder_days', 'deadlines', [7, 4], 'days', 'Remind the organiser this many days before the start', null, null],
  ['trips.listing_deposit', 'deadlines', 1000, 'Rs', "Listing deposit for an unverified organiser's first trip", 0, 20000],
  ['trips.change_confirm_hours', 'deadlines', 24, 'hours', 'People affected by a change confirm (or a reopened seat stays open) for', 1, 96],
  ['trips.report_hide_count', 'deadlines', 3, 'reports', 'Hide a trip from the board after this many reports', 1, 20],

  // Partners
  ['partners.reply_hours', 'deadlines', 24, 'hours', 'Partner must accept or decline a request within', 1, 96],
  ['partners.offer_valid_hours', 'deadlines', 48, 'hours', 'A driver offer is valid for', 1, 168],
  ['partners.driver_radius_km', 'deadlines', 30, 'km', 'Drivers shown within this distance of the start', 5, 300],
  ['partners.min_drivers_for_average', 'deadlines', 3, 'drivers', 'Show the average price only with at least', 1, 20],

  // Driving warnings
  ['driving.leg_warn_hours', 'deadlines', 6, 'hours', 'Suggest a stop when one leg is longer than', 1, 24],
  ['driving.day_warn_hours', 'deadlines', 10, 'hours', 'Warn when a day has more driving than', 1, 24],

  // Money
  ['money.payment_window_hours', 'deadlines', 48, 'hours', 'Each member has this long to pay', 1, 240],
  ['money.payment_reminder_hours', 'deadlines', [24, 4], 'hours', 'Payment reminders before the deadline', null, null],
  ['money.slip_min_days_ahead', 'deadlines', 5, 'days', 'Bank transfer only for trips starting at least', 1, 60],
  ['money.slip_reject_working_days', 'deadlines', 3, 'working days', 'Reject a slip if no money arrives within', 1, 15],
  ['money.payhere_settlement_working_days', 'deadlines', 2, 'working days', 'PayHere pays Yaluwo after (T+n)', 0, 10],
  ['money.payout_ready_hours', 'deadlines', 24, 'hours', 'Payouts become Ready this long after the trip', 0, 240],
  ['money.stepup_limit', 'money_safety', 100000, 'Rs', 'Payout batches above this need a step-up confirmation', 0, 10000000],
  ['money.bank_change_hold_hours', 'money_safety', 48, 'hours', 'Payouts paused after a bank account change', 0, 240],
  ['money.password_reset_hold_hours', 'money_safety', 24, 'hours', 'Payouts paused after a password reset', 0, 240],

  // Cancellations (section 15)
  ['cancel.member_full_days', 'deadlines', 7, 'days', 'Member cancels this many days before or more: share refunded, fee kept', 1, 60],
  ['cancel.member_half_days', 'deadlines', 3, 'days', 'Member cancels from this many days before: partial refund', 0, 60],
  ['cancel.member_half_pct', 'deadlines', 50, '%', 'Partial refund for a late member cancellation', 0, 100],

  // Quality
  ['quality.dispute_window_hours', 'deadlines', 24, 'hours', 'Disputes can be opened until this long after the trip', 1, 240],
  ['quality.dispute_partner_hours', 'deadlines', 24, 'hours', 'Partner replies to a dispute within', 1, 240],
  ['quality.dispute_admin_hours', 'deadlines', 72, 'hours', 'Admin decides a dispute within', 1, 240],
  ['quality.review_window_days', 'deadlines', 14, 'days', 'Review window after a trip', 1, 60],
  ['quality.review_reminder_day', 'deadlines', 7, 'day', 'Review reminder on day', 1, 60],
  ['quality.badge_min_reviews', 'quality', 5, 'reviews', 'Reviews needed for a badge or a suspension', 1, 100],
  ['quality.badge_min_avg', 'quality', 4.5, 'stars', 'Average above which a badge is earned', 1, 5],
  ['quality.suspend_max_avg', 'quality', 2.5, 'stars', 'Average below which the account is suspended for review', 1, 5],
  ['quality.strike_limit', 'quality', 3, 'strikes', 'Strikes that flag a partner for review', 1, 20],
  ['quality.strike_months', 'quality', 6, 'months', 'Strikes are counted over', 1, 36],

  // Accounts
  ['accounts.otp_minutes', 'deadlines', 5, 'minutes', 'Login and sign-up codes expire after', 1, 30],
  ['accounts.otp_per_hour', 'deadlines', 3, 'codes', 'Codes that can be requested per hour', 1, 20],
  ['accounts.password_min', 'deadlines', 10, 'characters', 'Shortest password', 8, 64],
  ['accounts.admin_password_min', 'deadlines', 14, 'characters', 'Shortest admin and staff password', 12, 64],
  ['accounts.reset_link_minutes', 'deadlines', 30, 'minutes', 'Password reset link lasts', 5, 240],
  ['accounts.lockout_tries', 'deadlines', 5, 'tries', 'Failed logins before the account is locked for a while', 3, 20],
  ['accounts.lockout_minutes', 'deadlines', 15, 'minutes', 'Lock time after too many failed logins', 1, 1440],
  ['accounts.admin_idle_minutes', 'deadlines', 30, 'minutes', 'Admin sessions end after this long idle', 5, 240],
  ['accounts.verification_hours', 'deadlines', 24, 'hours', 'Verifications are decided within', 1, 240],
  ['accounts.min_age', 'deadlines', 18, 'years', 'Minimum age', 16, 25],

  // Where travellers send bank transfers (owner only; shown to payers in full)
  ['bank.transfer_account', 'money_safety', { bank: 'Set in admin settings', branch: '', accountName: 'Yaluwo (Pvt) Ltd', accountNumber: '' }, null, 'Yaluwo bank account for transfers and deposit slips', null, null],
  ['safety.second_phone', 'money_safety', '', null, 'Second trusted phone for SOS alerts', null, null],

  // Notice periods for changes (section 24)
  ['settings.notice_fees_days', 'settings', 30, 'days', 'Notice before a fee change applies', 0, 120],
  ['settings.notice_rates_days', 'settings', 7, 'days', 'Notice before a rate card applies', 0, 60],
]

// Vehicle types and the first rate card (section 9 example amounts)
export const VEHICLE_TYPES = [
  // code, name, max passengers, licence class, self-drive, rate per km, day minimum, flexible daily, self-drive day, self-drive deposit
  ['TUKTUK', 'Tuk-tuk', 3, 'B1', true, 70, 6000, 7500, 4500, 15000],
  ['CAR', 'Car', 4, 'B', true, 100, 12000, 14000, 8000, 30000],
  ['VAN', 'Van', 10, 'B', true, 120, 15000, 17000, 12000, 40000],
  ['SUV', 'SUV or jeep', 5, 'B', true, 150, 18000, 21000, 14000, 50000],
  ['MINICOACH', 'Mini coach', 25, 'D1', false, 220, 28000, 32000, null, null],
]
export const RATE_DEFAULTS = { driverAllowance: 2500, emptyReturnPct: 50, dailyKm: 150, selfdriveKm: 100 }

export const LOOKUPS = {
  TRIP_TAG: ['Hiking', 'Beach', 'Culture', 'Food', 'Surf', 'Wildlife', 'Nightlife', 'Relaxed', 'Adventure', 'Budget', 'Photography', 'Train ride'],
  LANGUAGE: ['English', 'Sinhala', 'Tamil', 'German', 'French', 'Chinese', 'Japanese', 'Russian', 'Hindi'],
  REPORT_REASON: ['Scam or fake details', 'Harassment', 'Asked to pay outside Yaluwo', 'Unsafe behaviour', 'Inappropriate content', 'Other'],
  CANCEL_REASON: ['Change of plans', 'Health', 'Weather', 'Group problem', 'Other'],
  VEHICLE_PHOTO_ANGLE: ['Front', 'Back', 'Left side', 'Right side', 'Front seats', 'Back seats', 'Luggage space'],
  BANK: ['Bank of Ceylon', "People's Bank", 'Commercial Bank', 'Hatton National Bank', 'Sampath Bank', 'Seylan Bank', 'National Savings Bank', 'Nations Trust Bank', 'DFCC Bank', 'NDB Bank', 'Pan Asia Bank', 'Union Bank'],
}

export const LEGAL_PAGES = [
  ['terms', 'Terms of use', true],
  ['privacy', 'Privacy notice', true],
  ['cancellation', 'Cancellation and refund policy', false],
  ['community', 'Community guidelines', true],
  ['partner-agreement', 'Partner agreement', false],
]
