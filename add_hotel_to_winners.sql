-- Run this once in your MySQL client (Aiven)
ALTER TABLE award_winners
  ADD COLUMN hotel VARCHAR(255) NULL AFTER full_name;
