-- Migration: Add education_level and work_authorization fields to jobs table
-- Run this in your Supabase SQL Editor

-- Add education_level column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS education_level TEXT;

-- Add work_authorization column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS work_authorization TEXT;

-- Add comments for documentation
COMMENT ON COLUMN jobs.education_level IS 'Required education level for the job (e.g., Bachelor''s Degree, Master''s Degree, PhD)';
COMMENT ON COLUMN jobs.work_authorization IS 'Work authorization/visa requirements (e.g., Visa Sponsorship Available, H1B Transfer Only, Relocation Provided)';
